"use client";

import { useMotionValueEvent, useScroll } from "framer-motion";
import { useLenis } from "lenis/react";
import { useState } from "react";

import { UI } from "@/lib/content";
import { useLang } from "@/lib/use-lang";
import { SCORPIUS, SCORPIUS_ROUTE } from "@/lib/constellations";
import { routeStops } from "@/lib/route";
import { projectFigure, starRadius } from "@/lib/sky";

/**
 * Карта маршрута сбоку: быстрый переход к любому дому, минуя прогулку.
 *
 * Остановки выстроены **созвездием Скорпиона** — знак зодиака владельца.
 * Созвездие рисуется целиком, по настоящим координатам: голова, тело с
 * Антаресом и хвост с жалом, пятнадцать звёзд. Остановок девять, поэтому они
 * садятся на опорные звёзды фигуры от головы к жалу (`SCORPIUS_ROUTE`), а
 * остальные звёзды остаются фоном — мельче и без клика. Дорисовывать
 * недостающие звёзды нельзя: созвездие настоящее.
 *
 * Панель узкая и высокая, а Скорпион почти квадратный, поэтому проекции
 * разрешено растянуть фигуру по вертикали вдвое: рисунок узнаётся, а звёзды не
 * слипаются. Это осознанная стилизация, а не астрономическая карта.
 *
 * Остановки берутся из `routeStops`, список руками не дублируется.
 *
 * Панель видна с 1280px: она закреплена у края и лежит выше текста, а на более
 * узких экранах колонка контента доходит до самого края — звёзды ложились прямо
 * на заголовок остановки. Там быстрый путь даёт свёрнутый список в верхней
 * панели (`route-menu.tsx`).
 */

const PANEL = { width: 192, height: 384, padding: 18, maxStretch: 2 } as const;

/** Доли панели: проекция считается один раз на модуль, она детерминированная. */
const STARS = projectFigure(SCORPIUS.stars, PANEL).map((point) => ({
  x: (point.x / PANEL.width) * 100,
  y: (point.y / PANEL.height) * 100,
}));

export function RouteMap() {
  const { lang } = useLang();
  const lenis = useLenis();
  const { scrollYProgress } = useScroll();
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const index = Math.min(
      routeStops.length - 1,
      Math.floor(value * routeStops.length),
    );
    // Карта перерисовывается только на смене остановки, а не на каждом кадре
    setActive((current) => (current === index ? current : index));
  });

  // Пройденной считается та часть фигуры, что осталась позади активной звезды
  const activeStar = SCORPIUS_ROUTE[active];

  return (
    // Слой сквозной: панель шире самой фигуры и иначе перехватывала бы
    // выделение текста маршрута под собой
    <nav
      aria-label={UI.routeMap[lang]}
      data-route-map
      className="pointer-events-none fixed right-5 top-1/2 z-40 hidden h-96 w-48 -translate-y-1/2 xl:block"
    >
      {/* Линии созвездия: рисуются в долях панели, поэтому масштаб по осям
          разный, а толщина держится non-scaling-stroke */}
      <svg
        aria-hidden
        className="absolute inset-0 size-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {SCORPIUS.links.map(([from, to]) => {
          const passed = from <= activeStar && to <= activeStar;
          return (
            <line
              key={`${from}-${to}`}
              x1={STARS[from].x}
              y1={STARS[from].y}
              x2={STARS[to].x}
              y2={STARS[to].y}
              stroke={passed ? "var(--color-accent)" : "var(--color-muted)"}
              strokeWidth="0.5"
              opacity={passed ? 0.75 : 0.35}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {/* Звёзды фона: держат рисунок созвездия целым, остановками не являются.
          Опорная звезда, до которой остановки не дошли (жало, пока развилка —
          черновик), тоже остаётся звездой фона: созвездие рисуется целиком */}
      {SCORPIUS.stars.map((star, index) => {
        if (SCORPIUS_ROUTE.slice(0, routeStops.length).includes(index)) return null;
        const size = starRadius(star.mag, 4, 7);

        return (
          <span
            key={star.name ?? `bg-${index}`}
            aria-hidden
            data-star={star.name ?? `sco-${index}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted/70"
            style={{
              left: `${STARS[index].x}%`,
              top: `${STARS[index].y}%`,
              width: `${size}px`,
              height: `${size}px`,
            }}
          />
        );
      })}

      <ul>
        {routeStops.map((stop, index) => {
          const starIndex = SCORPIUS_ROUTE[index];
          const star = SCORPIUS.stars[starIndex];
          const isActive = index === active;
          const size = starRadius(star.mag, 7, 13);

          return (
            <li
              key={stop.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${STARS[starIndex].x}%`,
                top: `${STARS[starIndex].y}%`,
              }}
            >
              <button
                type="button"
                onClick={() => lenis?.scrollTo(`#${stop.id}`)}
                aria-current={isActive ? "true" : undefined}
                data-star={star.name ?? stop.id}
                className="group pointer-events-auto relative grid size-7 place-items-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
              >
                {/* Свечение активной звезды */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute size-7 rounded-full bg-accent/25 blur-[2px]"
                  />
                )}
                <span
                  aria-hidden
                  className={`relative block rounded-full transition-colors ${
                    isActive ? "bg-accent" : "bg-muted group-hover:bg-accent"
                  }`}
                  style={{ width: `${size}px`, height: `${size}px` }}
                />
                <span className="sr-only">{stop.title[lang]}</span>

                {/* Подпись только по наведению: она торчит влево от звезды и у
                    активной остановки ложилась на текст маршрута и на светило
                    неба. Название текущей остановки и так написано в верхней
                    панели, второй раз дублировать его незачем. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-full mr-1 whitespace-nowrap rounded-md border border-line bg-surface/95 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  {stop.title[lang]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
