import Image from "next/image";

import { LANDMARK_ASSETS } from "@/lib/scene-assets";

/**
 * Детали-площадки: то, что кликается у дороги и рассказывает про владельца.
 *
 * Шахматы собраны из ассетов владельца в chess-scene.tsx. Волейбольный корт,
 * нарисованный кодом (тонкий SVG-контур рядом с отрендеренными домами), убран:
 * два визуальных языка в одном кадре, и владельцу он не нравился. Площадка
 * вернётся картинкой владельца — концепция, размеры и промпт записаны в
 * docs/нужны-ассеты.md. Здесь остаётся только то, что и потом будет кодом:
 * мяч с тенью, который полетит поверх ассета корта.
 *
 * **Фигур людей здесь нет намеренно.** Плоские силуэты владельцу не понравились,
 * требование на нормальные фигурки записано в docs/нужны-ассеты.md.
 *
 * Важное правило: позиция объекта живёт на внешней группе, анимация — на
 * внутренней. CSS-свойство transform перебивает SVG-атрибут transform, и на
 * одном элементе они не сосуществуют.
 */

/**
 * Мяч и его тень на земле. Сам по себе ничего не изображает — это анимация,
 * которая ляжет поверх ассета корта: мяч летит по дуге через сетку, тень
 * едет по земле и сжимается, когда мяч высоко. Траектория задана
 * keyframes `volley-ball` / `volley-shadow` в globals.css и будет
 * перемерена под сетку, когда придёт картинка.
 *
 * Свои токены цвета (`--ball`, `--ball-line`): на `--surface` в тёмной теме
 * мяч читался как дырка.
 */
export function VolleyBall() {
  return (
    <svg viewBox="0 0 160 72" width="160" height="72" aria-hidden>
      <g transform="translate(80 64)">
        <g className="volley-shadow">
          <ellipse rx="11" ry="4.5" fill="var(--color-shadow)" opacity="0.3" />
        </g>
      </g>

      <g transform="translate(80 20)">
        <g className="volley-ball">
          <circle r="9" fill="var(--color-ball)" stroke="var(--color-ball-line)" strokeWidth="1.2" />
          <path
            d="M-9 0 A 12 12 0 0 1 9 0"
            fill="none"
            stroke="var(--color-ball-line)"
            strokeWidth="1.2"
          />
          <path
            d="M-6 6 A 12 12 0 0 0 6 6"
            fill="none"
            stroke="var(--color-ball-line)"
            strokeWidth="1"
            opacity="0.7"
          />
        </g>
      </g>
    </svg>
  );
}

/**
 * Волейбольная площадка у дороги: корт — ассет владельца, мяч с тенью поверх —
 * кодом (`VolleyBall`). Живёт в масштабе городка через обёртку `.town-scale`
 * (scenery.tsx), поэтому размеры внутри — в базовых пикселях.
 *
 * Середина сетки снята с файла корта (640×406): сетка идёт от (212, 20) к
 * (462, 152), её середина — (0,52; 0,23) долей картинки. Мяч летает над ней.
 */
const COURT = LANDMARK_ASSETS.volleyballCourt;
const NET_CENTER = { x: 0.52, y: 0.23 };

export function VolleyballCourt() {
  const height = (COURT.display * COURT.height) / COURT.width;
  return (
    <div data-volleyball-court className="relative" style={{ width: COURT.display, height }}>
      <div
        aria-hidden
        className="absolute inset-x-[6%] bottom-[2%] -z-10 h-[30%]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 40%, transparent), transparent)",
        }}
      />
      <Image
        src={COURT.src}
        alt=""
        width={COURT.width}
        height={COURT.height}
        sizes={`${COURT.display}px`}
        className="scene-art h-auto w-full select-none"
      />
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${NET_CENTER.x * 100}%`, top: `${NET_CENTER.y * 100}%` }}
      >
        <VolleyBall />
      </div>
    </div>
  );
}
