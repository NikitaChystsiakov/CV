/**
 * Детали-площадки: то, что кликается у дороги и рассказывает про владельца.
 *
 * Шахматы собраны из ассетов владельца в chess-scene.tsx, волейбольная
 * площадка — ассет корта владельца в volleyball-scene.tsx. Корт, нарисованный
 * кодом (тонкий SVG-контур), был убран ещё раньше: два визуальных языка в
 * одном кадре. Здесь только то, что и должно быть кодом: мяч с тенью поверх
 * ассета корта.
 *
 * **Фигур людей здесь нет намеренно.** Плоские силуэты владельцу не понравились,
 * требование на нормальные фигурки записано в docs/нужны-ассеты.md.
 *
 * Важное правило: позиция объекта живёт на внешней группе, анимация — на
 * внутренней. CSS-свойство transform перебивает SVG-атрибут transform, и на
 * одном элементе они не сосуществуют.
 */

/**
 * Мяч и его тень на земле поверх ассета корта (`volleyball-scene.tsx`).
 *
 * Система координат — сам корт в базовых пикселях (300 × 190, ширина
 * `VOLLEYBALL_COURT.display`), поэтому svg ложится на картинку один в один.
 * Траектория снята с ассета: центр ближней половины поля — (94, 122), дальней
 * — (202, 70), сетка между ними, её верх в середине — около y = 43. Мяч летает
 * между половинами над сеткой, тень едет по земле и сжимается, когда мяч
 * высоко. Ключевые кадры — `volley-ball` / `volley-shadow` в globals.css.
 *
 * Свои токены цвета (`--ball`, `--ball-line`): на `--surface` в тёмной теме
 * мяч читался как дырка.
 */
export function VolleyBall() {
  return (
    <svg viewBox="0 0 300 190" width="300" height="190" aria-hidden className="absolute inset-0 size-full overflow-visible">
      <g transform="translate(94 122)">
        <g className="volley-shadow">
          <ellipse rx="11" ry="4.5" fill="var(--color-shadow)" opacity="0.3" />
        </g>
      </g>

      <g transform="translate(94 122)">
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
