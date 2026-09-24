/**
 * Объекты окружения маршрута: плоская изометрия, минимум деталей, цвета только
 * из токенов (значит, обе темы работают сами). Ориентир — Monument Valley:
 * силуэт читается сразу, детализированная диорама не нужна.
 *
 * Геометрия строится по двум изо-осям, а не на глаз:
 *   вдоль длины  u = (+24, -7)
 *   вдоль ширины v = (+16, +6)
 * Из-за отступления от этих осей первая версия лавочки и забора выглядела кривой.
 */

type SceneryProps = { className?: string };

export function Tree({ className }: SceneryProps) {
  return (
    <svg viewBox="0 0 80 110" width="80" height="110" className={className} aria-hidden>
      <ellipse cx="40" cy="99" rx="22" ry="7" fill="var(--color-shadow)" opacity="0.3" />
      <rect x="36" y="62" width="8" height="34" rx="2" fill="var(--color-trunk)" />
      {/* Крона: тёмная половина справа даёт объём без градиентов */}
      <polygon points="40,6 74,52 40,66 6,52" fill="var(--color-foliage)" />
      <polygon points="40,6 74,52 40,66" fill="var(--color-foliage-2)" />
    </svg>
  );
}

/**
 * Сосна: три яруса, все с общей осью x=40 и каждый шире предыдущего.
 * В первой версии ярусы были всего два и с разным вылетом влево, из-за чего
 * силуэт выглядел обколотым.
 */
export function PineTree({ className }: SceneryProps) {
  const tiers = [
    { apex: 6, half: 18, base: 34 },
    { apex: 26, half: 26, base: 60 },
    { apex: 48, half: 33, base: 86 },
  ];

  return (
    <svg viewBox="0 0 80 124" width="80" height="124" className={className} aria-hidden>
      <ellipse cx="40" cy="112" rx="24" ry="7" fill="var(--color-shadow)" opacity="0.3" />
      <rect x="36" y="84" width="8" height="24" rx="2" fill="var(--color-trunk)" />
      {tiers.map(({ apex, half, base }) => (
        <g key={apex}>
          <polygon
            points={`40,${apex} ${40 + half},${base} 40,${base + 8} ${40 - half},${base}`}
            fill="var(--color-foliage)"
          />
          <polygon
            points={`40,${apex} ${40 + half},${base} 40,${base + 8}`}
            fill="var(--color-foliage-2)"
          />
        </g>
      ))}
    </svg>
  );
}

export function Bush({ className }: SceneryProps) {
  return (
    <svg viewBox="0 0 70 44" width="70" height="44" className={className} aria-hidden>
      <ellipse cx="35" cy="40" rx="24" ry="4" fill="var(--color-shadow)" opacity="0.26" />
      <ellipse cx="26" cy="26" rx="20" ry="14" fill="var(--color-foliage)" />
      <ellipse cx="46" cy="28" rx="16" ry="11" fill="var(--color-foliage-2)" />
    </svg>
  );
}

/** Фонарь: свет строго под лампой. В первой версии пятно света было смещено влево. */
export function Lamp({ className }: SceneryProps) {
  return (
    <svg viewBox="0 0 60 140" width="60" height="140" className={className} aria-hidden>
      <ellipse cx="30" cy="128" rx="15" ry="5" fill="var(--color-shadow)" opacity="0.34" />
      {/* Свет: центр совпадает с центром плафона по оси x = 17 */}
      <ellipse cx="17" cy="46" rx="15" ry="10" fill="var(--color-accent-2)" opacity="0.2" />
      <rect x="28" y="26" width="5" height="100" rx="2" fill="var(--color-metal)" />
      <rect x="16" y="24" width="17" height="4" rx="2" fill="var(--color-metal)" />
      <polygon points="10,28 24,28 21,40 13,40" fill="var(--color-accent-2)" />
    </svg>
  );
}

/**
 * Лавочка по изо-осям: сиденье — параллелограмм на u и v, спинка поднята над
 * задним ребром, ножки стоят в углах основания.
 */
/**
 * Лавочка. Углы считаются от одной точки по двум осям, ножки ставятся ровно в
 * эти углы. В первой версии ножки жили по своим координатам и лавочка «косила»,
 * а сама она была слишком крупной на фоне деревьев.
 */
export function Bench({ className }: SceneryProps) {
  // A — передний левый угол, u — вдоль лавочки, v — в глубину
  const a = { x: 8, y: 40 };
  const u = { x: 52, y: -15 };
  const v = { x: 33, y: 12 };

  const b = { x: a.x + u.x, y: a.y + u.y };
  const c = { x: b.x + v.x, y: b.y + v.y };
  const d = { x: a.x + v.x, y: a.y + v.y };
  const thickness = 5;
  const legs = [a, b, c, d];

  return (
    <svg viewBox="0 0 105 72" width="105" height="72" className={className} aria-hidden>
      <ellipse cx="52" cy="60" rx="42" ry="7" fill="var(--color-shadow)" opacity="0.24" />

      {/* Спинка над задним ребром A-B */}
      <polygon
        points={`${a.x},${a.y} ${b.x},${b.y} ${b.x},${b.y - 15} ${a.x},${a.y - 15}`}
        fill="var(--color-trunk)"
      />

      {legs.map((leg) => (
        <rect
          key={`${leg.x}-${leg.y}`}
          x={leg.x - 2}
          y={leg.y + 1}
          width="4"
          height="12"
          fill="var(--color-metal)"
        />
      ))}

      {/* Сиденье: верхняя грань и два торца */}
      <polygon
        points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`}
        fill="var(--color-trunk)"
      />
      <polygon
        points={`${a.x},${a.y} ${d.x},${d.y} ${d.x},${d.y + thickness} ${a.x},${a.y + thickness}`}
        fill="var(--color-stone-2)"
      />
      <polygon
        points={`${d.x},${d.y} ${c.x},${c.y} ${c.x},${c.y + thickness} ${d.x},${d.y + thickness}`}
        fill="var(--color-trunk)"
        opacity="0.72"
      />
    </svg>
  );
}

/** Дорожный знак: заменил гидрант, который читался как кривой человечек. */
export function Sign({ className }: SceneryProps) {
  return (
    <svg viewBox="0 0 50 110" width="50" height="110" className={className} aria-hidden>
      <ellipse cx="25" cy="100" rx="12" ry="4" fill="var(--color-shadow)" opacity="0.34" />
      <rect x="23" y="34" width="4" height="64" fill="var(--color-metal)" />
      <polygon points="25,8 43,18 25,28 7,18" fill="var(--color-accent)" opacity="0.85" />
      <polygon points="25,12 37,18 25,24 13,18" fill="var(--color-surface)" opacity="0.55" />
    </svg>
  );
}

/** Клумба: небольшая изо-площадка с цветами. */
export function FlowerBed({ className }: SceneryProps) {
  return (
    <svg viewBox="0 0 90 54" width="90" height="54" className={className} aria-hidden>
      <polygon points="45,10 85,26 45,42 5,26" fill="var(--color-foliage-2)" opacity="0.55" />
      <polygon points="45,14 77,26 45,38 13,26" fill="var(--color-foliage)" />
      {[
        [45, 20],
        [33, 26],
        [57, 26],
        [45, 32],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" fill="var(--color-accent-2)" />
      ))}
    </svg>
  );
}

/**
 * Забор: посты стоят строго на изо-оси u = (+22, -6), перекладины идут по той же
 * оси. В первой версии посты сдвигались произвольно, отсюда «кривизна».
 */
export function Fence({ className }: SceneryProps) {
  const posts = [0, 1, 2, 3, 4].map((i) => ({ x: 8 + i * 22, y: 54 - i * 6 }));
  const last = posts[posts.length - 1];

  return (
    <svg viewBox="0 0 130 70" width="130" height="70" className={className} aria-hidden>
      {/* Перекладины: параллелограммы вдоль всей длины */}
      <polygon
        points={`8,32 ${last.x},${last.y - 22} ${last.x},${last.y - 18} 8,36`}
        fill="var(--color-trunk)"
      />
      <polygon
        points={`8,44 ${last.x},${last.y - 10} ${last.x},${last.y - 6} 8,48`}
        fill="var(--color-trunk)"
      />
      {posts.map(({ x, y }) => (
        <rect
          key={x}
          x={x}
          y={y - 26}
          width="4"
          height="28"
          fill="var(--color-trunk)"
          opacity="0.9"
        />
      ))}
    </svg>
  );
}
