"use client";

import { type MotionValue, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, type RefObject } from "react";

import walkManifest from "@/lib/walk-manifest.json";
import { TOWN_HALF_WIDTH, roadHeight, roadVertices, townSize } from "@/lib/town";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Персонаж на дороге (этап Э4, шаг 3).
 *
 * Ходит по роликам владельца: `assets-src/videos/walks-*.mp4` режутся
 * `npm run walk` в полосы кадров одного полного шага (`public/scene/walk-*.webp`,
 * фон вырезан хромакеем). Роликов четыре: вниз лицом к зрителю и вверх спиной —
 * на прямых участках ленты, по диагонали вправо-вниз и вправо-вверх спиной — на
 * диагоналях; влево обе диагонали зеркалятся кодом. Прокрутка вверх — это ход
 * назад по маршруту, и он идёт туда спиной к зрителю, а не пятится.
 *
 * Направление — по знаку изменения пройденного пути, с гистерезисом: чтобы
 * развернуться, он должен пройти против прежнего хода `TURN_AFTER` базовых
 * пикселей. Иначе хвост пружины и дрожь колеса разворачивали бы его туда-сюда.
 *
 * Кадр выбирается по ПУТИ, а не по времени: фаза шага накапливается от
 * пройденного вдоль ленты расстояния, поэтому ноги не скользят по дороге. Но
 * у быстрой прокрутки есть потолок: выше `MAX_CADENCE` шагов в секунду фаза
 * перестаёт ускоряться — ноги чуть скользят, зато не мелькают. Скорость меряется
 * по времени кадра (`performance.now()` между вызовами), а не по событию.
 * Остановился — через `IDLE_AFTER` мс встаёт в стойку (последний кадр полосы).
 *
 * Кадр показывается сдвигом полосы (`transform`) внутри окна с `overflow:
 * hidden`. Никакого `background-position` и переключения `src`: только то, что
 * не пересчитывает раскладку.
 *
 * На дороге стоит точка ног стойки, а не угол картинки: её конвейер меряет по
 * кедам и пишет в манифест (`feetX`, `feetY`). Ролики сняты по-разному, и
 * низ-середина кадра у каждой позы своя — по углу поза на стыке прямой и
 * диагонали прыгала бы. Рост у всех поз один: конвейер приводит к нему стойку.
 *
 * Где он стоит: на дороге, на высоте `FOCUS` экрана. Лента монотонна по
 * высоте, поэтому место на ней находится по `y` — без поиска по длине пути.
 * Вершины ленты — те же, из которых рисуется полотно (`roadVertices`), в тех
 * же единицах: смена масштаба городка не разводит персонажа с дорогой.
 *
 * Шаг отстаёт от скролла пружиной (раздел 5 концепта). Позиция на каждый кадр
 * пишется прямо в DOM через ref — правило проекта, как у процента в панели.
 * При reduced-motion пружины нет и он не ходит: встаёт на место сразу и стоит.
 *
 * Пройденную часть дороги считает тоже он: `walked` — доля длины ленты от
 * начала до его ног. Иначе бирюзовая линия, считавшаяся от прокрутки страницы,
 * обрывалась на экран выше персонажа.
 *
 * Ниже 768px не рисуется: там дорога прямая по кромке, и место персонажа на
 * узком экране — отдельное решение (концепт, раздел 5).
 */

/** На какой доле высоты экрана персонаж стоит на дороге. */
const FOCUS = 0.62;
/**
 * Рост стоящего персонажа в базовых пикселях городка. Было 92 — на быстрой
 * прокрутке шаг не читался. 120 — вровень с верхом дверей домов (проём
 * ~105–130 базовых px, замер по ассетам): человек у двери своего роста, а не великан.
 */
const HEIGHT = 120;

type Pose = "down" | "diag" | "up" | "upDiag";
const POSES: Pose[] = ["down", "diag", "up", "upDiag"];
/** Диагональные позы: их зеркалят, когда ход идёт влево */
const DIAGONAL: Record<Pose, boolean> = { down: false, diag: true, up: false, upDiag: true };

const WALK = walkManifest;
/** Базовых пикселей городка в одном пикселе полосы кадров: рост стойки у всех поз один. */
const K = HEIGHT / WALK.down.standHeight;

/**
 * Длина полного шага (две ноги) на экране приходит из манифеста: конвейер
 * меряет, как быстро опорная стопа едет по «беговой дорожке» ролика. Замер идёт
 * по центру пятна кеды и выходит на пятую часть длиннее прежних ручных замеров
 * по носку (71 и 93 px полосы вниз и по диагонали, при них ноги не скользили) —
 * одинаково у обоих роликов, поэтому поправка одна на все позы.
 */
const STRIDE_FIT = 0.82;

/** Потолок частоты шага, полных циклов в секунду: выше ноги мелькали бы. */
const MAX_CADENCE = 2;
/** Сколько базовых пикселей надо пройти против прежнего хода, чтобы развернуться. */
const TURN_AFTER = 14;
/** Длиннее этой паузы между кадрами время не считаем: вкладка спала, это не скорость. */
const MAX_FRAME_MS = 100;

/** Столько миллисекунд без движения — и он встаёт в позу стойки. */
const IDLE_AFTER = 140;
/**
 * Медленнее этого (px экрана в секунду) — покой: хвост пружины не должен
 * дёргать ноги. Порог по скорости, а не «пикселей за кадр»: при 20 кадрах в
 * секунду шаг за кадр втрое крупнее, и прежний порог держал персонажа на ходу
 * лишнюю секунду после остановки.
 */
const MOVE_SPEED = 21;
/** Первый кадр после паузы: времени ещё не намерено — тогда порог за кадр при 60 к/с. */
const MOVE_EPSILON = MOVE_SPEED / 60;

export function Walker({
  trackRef,
  walked,
}: {
  trackRef: RefObject<HTMLDivElement | null>;
  /** Сюда пишется доля пройденного пути — её рисует полотно дороги */
  walked: MotionValue<number>;
}) {
  const reduced = usePrefersReducedMotion();
  const bodyRef = useRef<HTMLDivElement>(null);
  const poseRefs = useRef<Record<Pose, HTMLDivElement | null>>({ down: null, diag: null, up: null, upDiag: null });
  const flipRefs = useRef<Record<Pose, HTMLDivElement | null>>({ down: null, diag: null, up: null, upDiag: null });
  const stripRefs = useRef<Record<Pose, HTMLImageElement | null>>({ down: null, diag: null, up: null, upDiag: null });
  const geometry = useRef<{
    points: { x: number; y: number }[];
    /** Длина ленты от начала до каждой вершины, px — для пройденной доли */
    lengths: number[];
    /** Экранных пикселей в одном базовом пикселе городка */
    unit: number;
    top: number;
    height: number;
  } | null>(null);
  /** Куда идёт по маршруту: +1 — вперёд (вниз по странице), −1 — назад */
  const heading = useRef(1);
  /** Сколько пройдено против `heading` подряд, базовые px: копится до разворота */
  const against = useRef(0);
  const lastTime = useRef<number | null>(null);
  const shown = useRef<Pose>("down");
  /** Фаза шага, доли цикла; растёт с расстоянием вперёд и убывает назад */
  const phase = useRef(0);
  const lastDistance = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { scrollY } = useScroll();
  // Первое изменение — прыжком (`skipInitialAnimation`): при заходе по ссылке
  // на остановку или после перезагрузки посреди маршрута персонаж не пролетает
  // всю дорогу от арки. Демпфирование почти критическое (ζ ≈ 1,08): шаг
  // отстаёт от скролла, но без перелёта, а хвост после рывка на весь маршрут
  // гаснет за ~0,8 с — при ζ ≈ 1,55 он тянулся полторы секунды, и персонаж
  // долго «доползал» до места вместо того, чтобы встать
  const smooth = useSpring(scrollY, {
    stiffness: 140,
    damping: 18,
    mass: 0.5,
    skipInitialAnimation: true,
  });

  /** Показать кадр `frame` полосы позы `pose` (N — стойка). */
  const showFrame = (pose: Pose, frame: number) => {
    const strip = stripRefs.current[pose];
    if (strip) strip.style.transform = `translate3d(${(-frame * 100) / (WALK[pose].frames + 1)}%, 0, 0)`;
  };

  const showPose = (pose: Pose) => {
    if (shown.current === pose) return;
    shown.current = pose;
    for (const name of POSES) {
      const el = poseRefs.current[name];
      if (el) el.style.visibility = name === pose ? "visible" : "hidden";
    }
  };

  const place = (scroll: number) => {
    const geo = geometry.current;
    const body = bodyRef.current;
    if (!geo || !body || geo.points.length < 2) return;

    const y = Math.min(Math.max(scroll + window.innerHeight * FOCUS - geo.top, 0), geo.height);
    const points = geo.points;
    let i = 1;
    while (i < points.length - 1 && points[i].y < y) i += 1;
    const a = points[i - 1];
    const b = points[i];
    const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
    const x = a.x + (b.x - a.x) * t;

    body.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const distance = geo.lengths[i - 1] + Math.hypot(x - a.x, y - a.y);
    const total = geo.lengths[geo.lengths.length - 1];
    if (total > 0) walked.set(distance / total);

    const step = lastDistance.current === null ? 0 : distance - lastDistance.current;
    lastDistance.current = distance;
    const now = performance.now();
    const dt = lastTime.current === null ? 0 : Math.min(now - lastTime.current, MAX_FRAME_MS);
    lastTime.current = now;
    const moving = dt > 0 ? (Math.abs(step) * 1000) / dt > MOVE_SPEED : Math.abs(step) > MOVE_EPSILON;

    // Разворот с гистерезисом: против хода надо пройти заметный кусок
    if (!reduced && moving) {
      if (Math.sign(step) === heading.current) {
        against.current = 0;
      } else {
        against.current += Math.abs(step) / geo.unit;
        if (against.current > TURN_AFTER) {
          heading.current = -heading.current;
          against.current = 0;
        }
      }
    }

    // Поза: прямой участок или диагональ, лицом или спиной. Ролики диагоналей
    // идут вправо (вниз — вправо-вниз, спиной — вправо-вверх), влево — зеркало
    const diagonal = Math.abs(b.x - a.x) > 1;
    const forward = heading.current > 0;
    const pose: Pose = diagonal ? (forward ? "diag" : "upDiag") : forward ? "down" : "up";
    const goingRight = forward ? b.x > a.x : a.x > b.x;
    for (const name of POSES) {
      const flip = flipRefs.current[name];
      if (flip && DIAGONAL[name]) flip.style.transform = name === pose && !goingRight ? "scaleX(-1)" : "";
    }

    if (reduced) {
      showPose(pose);
      showFrame(pose, WALK[pose].frames);
      return;
    }

    if (moving) {
      const stride = WALK[pose].stride * STRIDE_FIT * K * geo.unit;
      // Фаза идёт вперёд, куда бы он ни шёл: назад он идёт лицом по ходу.
      // Шаг против хода (до разворота) крутит кадры обратно — это доля секунды
      let advance = (step * heading.current) / stride;
      // Потолок частоты: быстрее двух шагов в секунду фаза не бежит
      const limit = (MAX_CADENCE * dt) / 1000;
      if (dt > 0 && Math.abs(advance) > limit) advance = Math.sign(advance) * limit;
      phase.current += advance;
      const cycle = WALK[pose].frames;
      const frame = Math.floor((phase.current - Math.floor(phase.current)) * cycle);
      showPose(pose);
      showFrame(pose, Math.min(frame, cycle - 1));

      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        showFrame(shown.current, WALK[shown.current].frames);
      }, IDLE_AFTER);
    } else if (shown.current !== pose) {
      // Стоит, но участок сменился: другая полоса, та же стойка
      showPose(pose);
      showFrame(pose, WALK[pose].frames);
    }
  };

  // Геометрия ленты в пикселях маршрута: разово и на изменение размеров, не на кадр
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const road = track.querySelector<SVGSVGElement>("[data-road]");
      if (!road) return;
      const unit = road.getBoundingClientRect().width / (TOWN_HALF_WIDTH * 2);
      const height = track.offsetHeight;
      const center = track.offsetWidth / 2;
      const scaleY = height / roadHeight();
      const points = roadVertices().map((v) => ({ x: center + v.x * unit, y: v.y * scaleY }));
      const lengths = points.map(() => 0);
      for (let k = 1; k < points.length; k += 1) {
        lengths[k] = lengths[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
      }
      geometry.current = { points, lengths, unit, top: track.getBoundingClientRect().top + window.scrollY, height };
      lastDistance.current = null;
      place(reduced ? scrollY.get() : smooth.get());
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      observer.disconnect();
      clearTimeout(idleTimer.current);
    };
    // place читает только ref-ы, пересоздавать эффект на каждый рендер незачем
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackRef, reduced]);

  useMotionValueEvent(smooth, "change", (value) => {
    if (!reduced) place(value);
  });
  useMotionValueEvent(scrollY, "change", (value) => {
    if (reduced) place(value);
  });

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 hidden md:block">
      {/* Тело — точка на дороге, где стоят ноги; всё остальное отсчитывается от неё */}
      <div ref={bodyRef} data-walker className="absolute left-0 top-0 will-change-transform">
        <div
          className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: townSize(72),
            height: townSize(12),
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 45%, transparent), transparent)",
          }}
        />
        {POSES.map((pose) => {
          const art = WALK[pose];
          return (
            <div
              key={pose}
              ref={(node) => {
                poseRefs.current[pose] = node;
              }}
              data-walker-frame={pose}
              className="absolute"
              // Точка ног стойки — ровно в точке тела на дороге
              style={{
                left: townSize(-art.feetX * art.frameWidth * K),
                top: townSize(-art.feetY * art.frameHeight * K),
                width: townSize(art.frameWidth * K),
                height: townSize(art.frameHeight * K),
                visibility: pose === "down" ? "visible" : "hidden",
              }}
            >
              {/* Зеркало вокруг ног: развернувшись, он остаётся на том же месте */}
              <div
                ref={(node) => {
                  flipRefs.current[pose] = node;
                }}
                className="size-full"
                style={{ transformOrigin: `${art.feetX * 100}% 100%` }}
              >
                <div className="relative size-full overflow-hidden">
                  {/* Полоса кадров: окно показывает один, остальные сдвинуты за край */}
                  <Image
                    ref={(node) => {
                      stripRefs.current[pose] = node;
                    }}
                    src={art.src}
                    alt=""
                    width={art.frameWidth * (art.frames + 1)}
                    height={art.frameHeight}
                    unoptimized
                    className="scene-art absolute left-0 top-0 h-full max-w-none select-none will-change-transform"
                    style={{
                      width: `${(art.frames + 1) * 100}%`,
                      transform: `translate3d(${(-art.frames * 100) / (art.frames + 1)}%, 0, 0)`,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
