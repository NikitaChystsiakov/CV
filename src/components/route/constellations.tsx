"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { UI } from "@/lib/content";
import { useLang } from "@/lib/use-lang";
import { ROUTE_FIGURES } from "@/lib/constellations";
import { projectFigure, starRadius, type SkyFigure } from "@/lib/sky";
import { unlock } from "@/lib/unlocked";

/**
 * Созвездия по ходу маршрута: на каждом экране своё, в верхней полосе.
 *
 * Раньше небо было закреплённым слоем, и созвездия стояли на месте. Владелец
 * хотел иначе: чтобы по мере скролла попадались разные, поэтому теперь они живут
 * внутри маршрута и уезжают вместе с ним.
 *
 * Звёзды берутся по настоящим координатам (`lib/constellations.ts`), форма
 * считается проекцией. Точки руками не двигать: из подобранных «на глаз»
 * координат получались фигуры, которых на небе не существует.
 *
 * По клику созвездие называет себя и отмечается как открытое (`sessionStorage`).
 * Полная система ачивок собирается на этапе Э10 и подхватит этот же ключ.
 *
 * Только тёмная тема: в светлой вместо звёзд солнце (см. sky-body.tsx).
 *
 * Слой включается с 1280px: созвездия лежат выше текста (z-30), а на узких
 * экранах колонка контента доходит до краёв, и звёзды садились бы на заголовок.
 */

/** Окно фигуры в пикселях; масштаб честный, поэтому viewBox совпадает с ним. */
const BOX = { width: 170, height: 140, padding: 12 } as const;

export function Constellations({ sides }: { sides: ("left" | "right")[] }) {
  const slice = 100 / sides.length;

  return (
    // z-30, как и у площадок: блок текста остановки растянут на всю ширину и
    // иначе перехватывает клик по звёздам
    <div className="scene-layer pointer-events-none absolute inset-0 z-30 hidden overflow-hidden dark:xl:block">
      {ROUTE_FIGURES.slice(0, sides.length).map((figure, index) => (
        <ConstellationMark
          key={figure.id}
          figure={figure}
          top={index * slice + slice * 0.08}
          // Созвездие стоит над домом, а не над текстом: стороны остановок не
          // чередуются строго (после развилки два дома подряд справа), и
          // чередование по индексу сажало Кассиопею на имя в hero при 1280×720
          left={sides[index] === "right" ? 62 : 22}
        />
      ))}
    </div>
  );
}

function ConstellationMark({
  figure,
  top,
  left,
}: {
  figure: SkyFigure;
  top: number;
  left: number;
}) {
  const { lang } = useLang();
  const [revealed, setRevealed] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);

  const points = projectFigure(figure.stars, BOX);

  return (
    <div
      data-constellation={figure.id}
      className="pointer-events-auto absolute"
      style={{ top: `${top}%`, left: `${left}%` }}
    >
      <button
        type="button"
        aria-label={`${UI.constellationOf[lang]} ${figure.name[lang]}`}
        onClick={() => {
          setRevealed((value) => !value);
          if (!revealed) setJustUnlocked(unlock(`constellation:${figure.id}`));
        }}
        className="block cursor-pointer rounded-lg outline-offset-4 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-accent"
        style={{ opacity: revealed ? 1 : 0.75 }}
      >
        <svg
          width={BOX.width}
          height={BOX.height}
          viewBox={`0 0 ${BOX.width} ${BOX.height}`}
          aria-hidden
        >
          {figure.links.map(([from, to]) => (
            <line
              key={`${from}-${to}`}
              x1={points[from].x}
              y1={points[from].y}
              x2={points[to].x}
              y2={points[to].y}
              stroke={revealed ? "var(--color-accent)" : "var(--color-cloud)"}
              strokeWidth="0.7"
              opacity={revealed ? 0.8 : 0.4}
            />
          ))}
          {points.map((point, index) => (
            <circle
              key={figure.stars[index].name ?? index}
              cx={point.x}
              cy={point.y}
              r={starRadius(figure.stars[index].mag, 1.1, 2.6)}
              fill={revealed ? "var(--color-accent)" : "var(--color-ink)"}
              className="star-twinkle"
              style={
                {
                  "--twinkle-duration": `${3 + (index % 4)}s`,
                  "--twinkle-delay": `${-index * 0.6}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </svg>
      </button>

      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none absolute left-1/2 top-full w-max -translate-x-1/2 rounded-lg border border-line bg-surface/95 px-2.5 py-1 backdrop-blur"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.16em]">
              {figure.name[lang]}
            </p>
            {justUnlocked && (
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                {UI.constellationUnlocked[lang]}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
