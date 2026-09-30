"use client";

import { type MotionValue, useMotionValue, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { useEffect, useRef } from "react";

import { TownBackdrop } from "@/components/route/backdrop";
import { Clouds } from "@/components/route/clouds";
import { Constellations } from "@/components/route/constellations";
import { DeepLinkArrival } from "@/components/route/deep-link";
import { RouteStop } from "@/components/route/route-stop";
import { SceneryLandmarks } from "@/components/route/scenery";
import { Walker } from "@/components/route/walker";
import { routeStops } from "@/lib/route";
import { TOWN_HALF_WIDTH, drivePaths, roadHeight, roadPath, townSize } from "@/lib/town";

/**
 * Вертикальный контейнер маршрута: дорога + остановки по порядку из конфига.
 *
 * Дорога — «полоса», вдоль которой на следующем шаге Э4 пойдёт персонаж:
 * его позиция будет считаться от этого же scrollYProgress, чтобы шаг отставал
 * от скролла (п.4 концепта), без пересчёта layout на кадр.
 */
export function RouteTrack() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.4,
    // Заход по ссылке на остановку: линия не прорисовывается от начала
    skipInitialAnimation: true,
  });
  // Пройденная часть серпантина кончается у ног персонажа: долю пишет он сам
  const walked = useMotionValue(0);

  return (
    // id нужен skip-link из верхней панели: с клавиатуры маршрут начинается отсюда
    <div ref={trackRef} id="route" className="relative">
      {/* Небо и окружение: заполняют вертикальные и боковые промежутки между домами */}
      <Clouds stopCount={routeStops.length} />
      <Constellations sides={routeStops.map((stop) => stop.side)} />

      {/* Фоновые кварталы по краям улицы: раньше остановок, значит под ними */}
      <TownBackdrop />

      {/* Кликабельные детали про владельца: стоят у дороги рядом со своими домами */}
      <SceneryLandmarks />

      <TownRoad progress={walked} />
      <MobileRoad progress={progress} />
      <Walker trackRef={trackRef} walked={walked} />
      <DeepLinkArrival />

      <ol className="relative">
        {routeStops.map((stop, index) => (
          <RouteStop key={stop.id} stop={stop} index={index} />
        ))}
      </ol>
    </div>
  );
}

/**
 * Пройденная часть пути рисуется штрихом по самой дороге.
 *
 * Грабли, на которые здесь уже наступили: у полотна стоит
 * `vector-effect: non-scaling-stroke` (без него лента худела бы на диагоналях —
 * `<svg>` растянут по высоте маршрута в тринадцать раз), а с ним браузер
 * считает `stroke-dasharray` в ЭКРАННЫХ пикселях и перестаёт нормировать его
 * по `pathLength="1"`. Доля пути 0,24 превращалась в штрих шириной 0,24px, и
 * прогресс был не виден вовсе, хотя в разметке и в проверке всё сходилось.
 *
 * Поэтому длина пути меряется в экранных пикселях — один раз после монтирования
 * и при изменении размеров, а не на кадр, — и дальше штрих пишется прямо в DOM
 * через ref, как процент в верхней панели: значение меняется каждый кадр
 * скролла, и состояние React здесь перерисовывало бы всю сцену.
 */
function useRoadProgress(progress: MotionValue<number>) {
  const pathRef = useRef<SVGPathElement>(null);
  const screenLength = useRef(0);

  const paint = (value: number) => {
    const el = pathRef.current;
    const total = screenLength.current;
    if (!el || total === 0) return;
    el.style.strokeDasharray = `${value * total} ${total}`;
  };

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;

    const measure = () => {
      const ctm = el.getScreenCTM();
      const userLength = el.getTotalLength();
      if (!ctm || userLength === 0) return;

      // Длина ломаной в экранных координатах: сотни выборок хватает, чтобы
      // повороты серпантина не съели точность, и это разовый расчёт
      const steps = 240;
      let sum = 0;
      let previous = new DOMPoint(el.getPointAtLength(0).x, el.getPointAtLength(0).y).matrixTransform(ctm);
      for (let i = 1; i <= steps; i += 1) {
        const point = el.getPointAtLength((userLength * i) / steps);
        const screen = new DOMPoint(point.x, point.y).matrixTransform(ctm);
        sum += Math.hypot(screen.x - previous.x, screen.y - previous.y);
        previous = screen;
      }

      screenLength.current = sum;
      paint(progress.get());
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el.ownerSVGElement ?? el);
    return () => observer.disconnect();
  }, [progress]);

  useMotionValueEvent(progress, "change", paint);

  return pathRef;
}

/**
 * Полотно дороги: одна лента от арки до финиша, серпантином от дома к дому
 * (docs/город.md, раздел 2.2).
 *
 * Геометрия приходит из карты городка в тех же единицах, что дома и декор:
 * `<svg>` сжат по ширине до городка и растянут по высоте маршрута, поэтому
 * `preserveAspectRatio="none"` — а толщина полотна остаётся честной благодаря
 * `vector-effect: non-scaling-stroke` (иначе на диагоналях лента бы худела).
 *
 * Пройденная часть — тот же путь со штрихом по длине (см. `useRoadProgress`).
 * Правило проекта «анимируем только transform и opacity» это не нарушает:
 * меняется `stroke-dasharray` уже посчитанной геометрии, без единого пересчёта
 * раскладки. Фильтров и теней на пути нет намеренно — путь длинный, и каждый
 * кадр рисовался бы заново целиком.
 */
function TownRoad({ progress }: { progress: MotionValue<number> }) {
  const progressRef = useRoadProgress(progress);
  const road = roadPath();
  const drives = drivePaths();
  const height = roadHeight();

  return (
    <svg
      aria-hidden
      data-road
      viewBox={`0 0 ${TOWN_HALF_WIDTH * 2} ${height}`}
      preserveAspectRatio="none"
      // Свой композитный слой (will-change): пройденная линия перерисовывается
      // каждый кадр, и без слоя вместе с ней заново растеризовалась бы вся
      // полоса экрана вдоль дороги — дома, фонари, задник под ней
      className="pointer-events-none absolute inset-y-0 left-1/2 hidden h-full -translate-x-1/2 will-change-transform md:block"
      style={{ width: townSize(TOWN_HALF_WIDTH * 2) }}
    >
      {/* Ширина полотна — 86 базовых px (было 66, до того 44): по ленте ходит
          персонаж ростом 120, и на узкой дороге шаг не читался. Бордюр, съезды,
          разметка и пройденная линия растут в той же пропорции ×1,3. Декор
          обочины отодвинут в town.ts, чтобы не налезал на полотно.
          Бордюр тоном темнее — сначала оба, потом заливка поверх: так съезд к
          двери входит в дорогу без шва. Первой идёт сама дорога: она тянется на
          весь маршрут, и проверкам не надо угадывать, какой путь тут главный */}
      <path d={road} className="town-kerb" style={{ strokeWidth: townSize(99) }} />
      <path d={drives} className="town-kerb" style={{ strokeWidth: townSize(55) }} />
      <path d={drives} className="town-road" style={{ strokeWidth: townSize(44) }} />
      <path d={road} className="town-road" style={{ strokeWidth: townSize(86) }} />

      {/* Разметка по осевой и пройденная часть пути поверх неё */}
      <path d={road} className="route-path" style={{ strokeWidth: townSize(6.5) }} />
      <path
        ref={progressRef}
        d={road}
        data-route-progress
        className="town-progress"
        style={{ strokeWidth: townSize(10), strokeDasharray: "0 99999" }}
      />
    </svg>
  );
}

/**
 * Узкий экран: серпантин не читается, поэтому дорога идёт прямой полосой по
 * левой кромке — там же, где раньше шла дорожка прогресса (docs/город.md,
 * раздел 4). Дом и текст стоят над ней в один столбец.
 */
function MobileRoad({ progress }: { progress: MotionValue<number> }) {
  const progressRef = useRoadProgress(progress);
  const height = roadHeight();

  return (
    <svg
      aria-hidden
      viewBox={`0 0 40 ${height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-y-0 left-6 h-full w-10 -translate-x-1/2 md:hidden"
    >
      <path d={`M20 0 L20 ${height}`} className="town-kerb" strokeWidth={34} />
      <path d={`M20 0 L20 ${height}`} className="town-road" strokeWidth={28} />
      <path d={`M20 0 L20 ${height}`} className="route-path" strokeWidth={3} />
      <path
        ref={progressRef}
        d={`M20 0 L20 ${height}`}
        data-route-progress
        className="town-progress"
        style={{ strokeDasharray: "0 99999" }}
        strokeWidth={4}
      />
    </svg>
  );
}
