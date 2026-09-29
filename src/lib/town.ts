/**
 * Карта городка: что где стоит на изометрической сетке (docs/город.md, разделы 2–4).
 *
 * ── Сетка ───────────────────────────────────────────────────────────────────
 * Изометрия 30°, как у ассетов владельца. Оси сетки: `u` — вправо-вниз по
 * экрану, `v` — влево-вниз. Экранные координаты клетки:
 *
 *   x = (u − v) · CELL_PX            y = (u + v) · CELL_PX · 0,577
 *
 * Таблица ниже задаётся не парой (u, v), а той же сеткой в проекции — так её
 * можно править руками, не пересчитывая парность:
 *
 *   x — поперёк экрана, в клетках вправо от осевой линии маршрута  (x = u − v)
 *   d — вглубь сцены, в клетках от верхнего края остановки         (d = u + v)
 *
 * Обратно: u = (d + x) / 2, v = (d − x) / 2. Ход «чистый +u» — это диагональ
 * вправо-вниз под 30° (x +n, d +n), «чистый +v» — влево-вниз (x −n, d +n),
 * а равный ход по обеим осям (x +0, d +2n) идёт на экране строго вниз. Из этих
 * трёх направлений и собран серпантин дороги.
 *
 * ── Почему по горизонтали пиксели, а по вертикали проценты ───────────────────
 * Ширина городка живёт в базовых пикселях и умножается на `--town-unit`
 * (globals.css) — один множитель на все объекты сразу: дом, декор, дорога и
 * толщина полотна уменьшаются вместе, поэтому на узком экране картинки не
 * начинают наезжать друг на друга.
 *
 * Высота остановки задана экраном (`min-h-[82svh]`), а не сеткой, и растянуть
 * её под истинные 30° нельзя: за девять экранов дорога ушла бы далеко за край.
 * Поэтому глубина `d` меряется в долях высоты остановки: ровно 58 клеток на
 * остановку — при опорном окне 1440×900 это и есть честная клетка 22×12,7px.
 * На других пропорциях окна вертикаль слегка тянется, зигзаг от этого не
 * ломается, а дорога остаётся непрерывной от арки до финиша.
 *
 * ── Стороны ─────────────────────────────────────────────────────────────────
 * Таблица написана в одном каноническом виде — «дом справа». Сторона берётся
 * из `stop.side` в route.ts: для левых остановок вся карта зеркалится по x
 * (это и есть перестановка u и v), поэтому раскладка симметрична по построению
 * и её не надо описывать дважды.
 */

import { insideKeepOut } from "@/lib/landmark-spots";
import { routeStops } from "@/lib/route";
import type { PropName } from "@/lib/scene-assets";

/** Ширина клетки поперёк экрана, базовые пиксели (при `--town-unit: 1px`). */
export const CELL_PX = 22;

/** Глубина остановки в клетках: 58 × 22 × 0,577 ≈ 736px — высота экрана 82svh при 900. */
export const STOP_DEPTH = 58;

/** Клетка сетки в проекции: x — поперёк, d — вглубь. */
export type Cell = { x: number; d: number };

/** Объект окружения на карте. */
type TownProp = Cell & {
  name: PropName;
  /** Отразить по горизонтали — например, лавочке повернуться к дороге */
  flip?: boolean;
  /**
   * Второй план: то, что стоит за домом. Такие объекты уходят в дымку сильнее
   * остальных — иначе дерево за крышей спорит с домом за внимание.
   */
  back?: boolean;
};

type TownStop = {
  /** Дом остановки: его основание стоит на этой клетке */
  house: Cell;
  /** Дорожка от полотна к двери — рисуется кодом вместе с дорогой */
  drive: [Cell, Cell];
  /** Декор поимённо вокруг дома (docs/город.md, раздел 3) */
  props: TownProp[];
  /** Вариант двора перед домом (`YARDS`), `null` — двора нет */
  yard: number | null;
  /** Вариант сквера над текстом (`SQUARES`), `null` — сквера нет */
  square: number | null;
  /** Квартал фоновых домов под текстом; по умолчанию есть */
  backdrop?: boolean;
};

/**
 * Дорога внутри остановки, канонический вид (дом справа).
 *
 * Полотно уходит к дому диагональю 30° (чистый +u), идёт вдоль него вниз и
 * такой же диагональю (чистый +v) уходит к следующей остановке. Поперечная
 * координата на стыке — среднее между обочинами соседних остановок
 * (`seamX`): когда дома по разные стороны, шов приходится на осевую и дорога
 * честно переваливает через неё; когда два дома подряд стоят с одной стороны,
 * дорога просто идёт мимо них, а не втыкается иглой в середину и обратно.
 */
const ROAD_SIDE = 10; // обочина: 10 клеток от осевой
const ROAD_TURN = 10; // на какой глубине полотно уже вышло на обочину

/**
 * Город, а не выставка предметов (29.09.2026).
 *
 * Прежде вдоль улицы стояли одиночные предметы, каждый на своём газоне, и
 * улица читалась как каталог. Теперь декор собран в группы, и у каждой
 * остановки три одинаковые по смыслу зоны — меняется только их наполнение:
 *
 *   ДВОР — перед домом (d 42–57, сторона дома): клумбы у входа, фонари парой
 *   через дорогу, лавочка лицом к дороге, урна у лавочки, дерево на углу.
 *
 *   СКВЕР — над текстом (d 0–16, сторона текста). Он продолжает двор
 *   предыдущей остановки: соседние остановки зеркальны, поэтому двор одной и
 *   сквер следующей стоят на одной стороне улицы и складываются в один
 *   участок между домами — там, где раньше был пустой экран.
 *
 *   КВАРТАЛ — ряд фоновых домов (`BACKDROP`) под текстом (d 41–58, сторона
 *   текста). Это прямо за крышей дома следующей остановки: главный дом стоит
 *   на фоне улицы, а не в поле.
 *
 * Высоты объектов в клетках глубины (одна клетка — 12,7 базовых px): дерево
 * ~14, ель ~13, забор ~10, лавочка ~8, фонарь ~7, куст ~6, клумба ~6, урна ~4,
 * фоновый дом ~17. Якорь — низ объекта, поэтому объект занимает d от
 * «якорь − высота» до «якорь». Дом кончается на d = 41, и всё, что стоит в
 * полосе дома, обязано начинаться ниже.
 *
 * Лавочка в ассете смотрит влево-вниз: справа от дороги она без зеркала
 * смотрит на дорогу, слева её надо зеркалить.
 */

/** Двор: три варианта, чтобы соседние дворы не повторялись. */
const YARDS: TownProp[][] = [
  [
    { x: 5.5, d: 47, name: "lamp" },
    { x: 14, d: 47, name: "lamp", flip: true },
    { x: 18.5, d: 50, name: "flowerbed" },
    { x: 24, d: 49, name: "flowerbed" },
    { x: 28.5, d: 55, name: "bench" },
    { x: 23, d: 55, name: "trash" },
  ],
  [
    { x: 5.5, d: 47, name: "lamp" },
    { x: 14, d: 47, name: "lamp", flip: true },
    { x: 19, d: 49, name: "bush" },
    { x: 24.5, d: 51, name: "flowerbed" },
    { x: 18, d: 56, name: "bench" },
    { x: 31, d: 57, name: "tree", back: true },
  ],
  [
    { x: 5.5, d: 47, name: "lamp" },
    { x: 14, d: 47, name: "lamp", flip: true },
    { x: 18.5, d: 50, name: "flowerbed" },
    { x: 22, d: 55, name: "trash" },
    { x: 27, d: 56, name: "bench" },
    { x: 30.5, d: 49, name: "bush" },
  ],
];

/** Сквер над текстом: деревья глубже, лавочка и клумба ближе к дороге. */
const SQUARES: TownProp[][] = [
  [
    { x: -22, d: 10, name: "tree", back: true },
    { x: -29, d: 12, name: "pine", back: true },
    { x: -15, d: 14, name: "bench", flip: true },
    { x: -8.5, d: 12, name: "bush" },
  ],
  [
    { x: -27, d: 9, name: "tree", back: true },
    { x: -20, d: 13, name: "flowerbed" },
    { x: -13, d: 15, name: "bench", flip: true },
    { x: -7, d: 13, name: "lamp" },
  ],
  [
    { x: -21, d: 11, name: "pine", back: true },
    { x: -28, d: 13, name: "tree", back: true },
    { x: -14, d: 14, name: "flowerbed" },
    { x: -8, d: 12, name: "bush" },
  ],
];

/**
 * Квартал за следующим домом: ряд фоновых домов под текстом, вплотную —
 * газоны смыкаются в один участок, как дома одной улицы. Крайний уходит за
 * край городка: на широком экране квартал продолжается, на узком обрезается
 * краем окна.
 *
 * Отдельные дома у дальних краёв пробовали: на 1280–1728 от них оставалась
 * половинка у кромки окна и читалась как ошибка раскладки, а не как город.
 */
type BackdropCell = Cell & { flip?: boolean };
const BACKDROP: BackdropCell[] = [
  { x: -16, d: 58 },
  { x: -26, d: 57, flip: true },
  { x: -36, d: 58 },
];

/**
 * Улица по остановкам — таблица из docs/город.md, раздел 3.
 *
 * Ключи совпадают с id в route.ts. Остановки без записи (черновая развилка)
 * на маршрут не выходят. `props` — то, что у остановки своё, поверх двора и
 * сквера; `yard`/`square` — номер варианта; `null` — зоны нет.
 */
const TOWN: Record<string, TownStop> = {
  // Арка на входе: сквера над текстом нет — над ним только начало страницы
  hero: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    yard: 0,
    square: null,
    props: [{ x: 27, d: 8, name: "tree", back: true }],
  },

  // Дом навыков
  skills: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    yard: 1,
    square: 0,
    props: [{ x: 4, d: 30, name: "bench", flip: true }],
  },

  // Мини-игра: панель игры высокая, сквер над ней ниже обычного не спускается.
  // Забор — за верстаком, это мастерская
  minigame: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    yard: 2,
    square: null,
    props: [
      { x: 17, d: 13, name: "fence", back: true },
      { x: 26, d: 14, name: "fence", back: true },
      { x: -24, d: 8, name: "tree", back: true },
      { x: -15, d: 9, name: "bush" },
    ],
  },

  // Дом технологий: ель за домом
  tech: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    yard: 0,
    square: 1,
    props: [{ x: 4, d: 30, name: "bench", flip: true }],
  },

  // Дом кейсов
  cases: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    yard: 1,
    square: 2,
    props: [],
  },

  // Дом опыта: под текстом сквер с шахматным столом (landmark-spots.ts) —
  // квартал там снимается зоной отчуждения
  experience: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    yard: 2,
    square: 0,
    props: [{ x: 4, d: 30, name: "bench", flip: true }],
  },

  // Дом «о себе»: под текстом волейбольная площадка (landmark-spots.ts)
  about: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    yard: 0,
    square: 1,
    props: [],
  },

  // Финиш: за ним ничего нет — квартала под текстом тоже
  outro: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    yard: 1,
    square: 2,
    backdrop: false,
    props: [],
  },
};

/**
 * Декор между остановками — единственное место, где объекты ставятся по
 * правилу, а не поимённо (docs/город.md, раздел 3): фонарь у обочины над
 * домом и дерево на стыке остановок.
 */
const ROADSIDE: TownProp[] = [
  { x: 5, d: 14, name: "lamp" },
  { x: -7, d: 56, name: "tree", back: true },
];

/** Насколько близко к ручному объекту считается «то же место». */
function collides(a: Cell, b: Cell) {
  return Math.abs(a.x - b.x) < 7 && Math.abs(a.d - b.d) < 10;
}

/** Узел городка на экране: уже с учётом стороны остановки и масштаба. */
export type TownNode = {
  key: string;
  kind: "house" | "prop";
  name?: PropName;
  /** Смещение основания от осевой линии, базовые пиксели */
  left: number;
  /** Доля высоты остановки, проценты */
  top: number;
  /** Глубина сцены: по ней сортируется порядок отрисовки */
  depth: number;
  flip: boolean;
  back: boolean;
  /** Дальние объекты чуть мельче и бледнее — воздух между планами */
  scale: number;
  opacity: number;
};

/** Доля высоты остановки для клетки глубины. */
export function depthTop(d: number) {
  return round((d / STOP_DEPTH) * 100);
}

/** Смещение клетки от осевой линии в базовых пикселях. */
export function cellLeft(x: number) {
  return round(x * CELL_PX);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Куда смотрит остановка: +1 — дом справа, −1 — слева (зеркало карты). */
function directionOf(stopIndex: number) {
  return routeStops[stopIndex]?.side === "left" ? -1 : 1;
}

/**
 * Объекты остановки в порядке отрисовки.
 *
 * Сортировка одна на всех — по глубине `u + v` (docs/город.md, раздел 2.4):
 * дальние рисуются раньше, поэтому фонарь перед домом перекрывает дом, а не
 * наоборот. Дом стоит в том же списке, отдельного слоя у него нет.
 */
export function townNodes(stopIndex: number): TownNode[] {
  const stop = routeStops[stopIndex];
  const map = stop ? TOWN[stop.id] : undefined;
  if (!stop || !map) return [];

  const dir = directionOf(stopIndex);
  const hand = [
    ...(map.yard === null ? [] : YARDS[map.yard]),
    ...(map.square === null ? [] : SQUARES[map.square]),
    ...map.props,
  ];
  const roadside = ROADSIDE.filter((item) => !hand.some((prop) => collides(prop, item)));

  const nodes: TownNode[] = [
    {
      key: `${stop.id}-house`,
      kind: "house",
      left: cellLeft(map.house.x * dir),
      top: depthTop(map.house.d),
      depth: map.house.d,
      flip: false,
      back: false,
      scale: 1,
      opacity: 1,
    },
  ];

  [...hand, ...roadside].forEach((prop, index) => {
    const left = cellLeft(prop.x * dir);
    const top = depthTop(prop.d);

    // Зоны отчуждения вокруг площадок: иначе забор проезжает сквозь сквер
    const routeTop = ((stopIndex + top / 100) / routeStops.length) * 100;
    if (insideKeepOut(routeTop, left)) return;

    nodes.push({
      key: `${stop.id}-${prop.name}-${index}`,
      kind: "prop",
      name: prop.name,
      left,
      top,
      depth: prop.d,
      flip: dir < 0 ? !prop.flip : Boolean(prop.flip),
      back: Boolean(prop.back),
      // Дальний план мельче ближнего: 0,88 у горизонта против 1,12 у зрителя
      scale: round(0.88 + (prop.d / STOP_DEPTH) * 0.24),
      opacity: round((0.74 + (prop.d / STOP_DEPTH) * 0.26) * (prop.back ? 0.88 : 1)),
    });
  });

  return nodes.sort((a, b) => a.depth - b.depth);
}

/** Фоновый дом квартала на экране. */
export type BackdropNode = {
  key: string;
  left: number;
  top: number;
  flip: boolean;
  /** Доля базовой ширины фонового дома */
  scale: number;
  opacity: number;
  /** Сдвиг тона: у одного и того же ассета крыши и стены чуть разного цвета */
  tone: string;
};

/**
 * Сдвиг тона фоновых домов. Одна картинка на весь город, и без этого ряд
 * читался бы копипастой. Сдвиги маленькие: дом должен остаться тем же
 * материалом, что главные, а не перекраситься.
 */
const TONES = [
  "saturate(0.8) hue-rotate(-8deg) brightness(1.03)",
  "saturate(0.72) hue-rotate(6deg)",
  "saturate(0.85) hue-rotate(-2deg) brightness(0.97)",
  "saturate(0.7) hue-rotate(12deg) brightness(1.02)",
];

/**
 * Кварталы за улицей для остановки (см. `BACKDROP`): зеркало чередуется,
 * тон идёт по кругу со сдвигом от номера остановки, дальние дома мельче и
 * бледнее. Зоны отчуждения площадок снимают дома, как и декор: иначе квартал
 * встал бы на шахматный стол.
 */
export function townBackdrop(stopIndex: number): BackdropNode[] {
  const stop = routeStops[stopIndex];
  const map = stop ? TOWN[stop.id] : undefined;
  if (!stop || !map || map.backdrop === false) return [];
  const dir = directionOf(stopIndex);

  return BACKDROP.flatMap((cell, index) => {
    const left = cellLeft(cell.x * dir);
    const top = depthTop(cell.d);
    const routeTop = ((stopIndex + top / 100) / routeStops.length) * 100;
    if (insideKeepOut(routeTop, left, { top: 4, left: 420 })) return [];
    const flip = Boolean(cell.flip) !== (dir < 0);
    return [
      {
        key: `${stop.id}-backdrop-${index}`,
        left,
        top,
        flip,
        scale: 0.92,
        opacity: 0.56,
        tone: TONES[(stopIndex * 3 + index) % TONES.length],
      },
    ];
  });
}

/**
 * Полотно дороги на весь маршрут — один SVG-путь.
 *
 * Координаты пути: x — базовые пиксели от левого края городка (осевая линия в
 * середине), y — клетки глубины подряд по всем остановкам. Сам `<svg>` растянут
 * по высоте маршрута и сжат по ширине до городка, поэтому единицы совпадают с
 * теми, в которых стоят дома и декор.
 */
export const TOWN_HALF_WIDTH = 714;

function pathFrom(points: Cell[], stopIndex: number, dir: number) {
  return points
    .map((point, index) => {
      const x = round(TOWN_HALF_WIDTH + point.x * dir * CELL_PX);
      const y = round(stopIndex * STOP_DEPTH + point.d);
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

/** Поперечная координата шва между остановками, в клетках без зеркала. */
function seamX(stopIndex: number) {
  const here = directionOf(stopIndex);
  const next = stopIndex + 1 < routeStops.length ? directionOf(stopIndex + 1) : here;
  // Начало маршрута и его конец приходят на осевую: дорога уходит за край
  if (stopIndex + 1 >= routeStops.length) return 0;
  return ((ROAD_SIDE * here + ROAD_SIDE * next) / 2) * here;
}

/** Непрерывная лента от арки до финиша. */
export function roadPath() {
  const start = `M${round(TOWN_HALF_WIDTH)} 0`;

  const line = routeStops
    .map((_, index) => {
      const dir = directionOf(index);
      const points: Cell[] = [
        { x: ROAD_SIDE, d: ROAD_TURN },
        { x: ROAD_SIDE, d: STOP_DEPTH - ROAD_TURN },
        { x: seamX(index), d: STOP_DEPTH },
      ];
      return pathFrom(points, index, dir).replace("M", "L");
    })
    .join(" ");

  return `${start} ${line}`;
}

/**
 * Вершины той же ленты, что рисует `roadPath`, — для того, кто по ней ходит.
 * `x` — базовые пиксели от осевой (на экране умножаются на `--town-unit`),
 * `y` — единицы глубины пути (`roadHeight()` на всю высоту маршрута). Лента
 * монотонна по `y`: персонаж находит своё место на ней по высоте экрана.
 */
export function roadVertices() {
  const vertices = [{ x: 0, y: 0 }];
  routeStops.forEach((_, index) => {
    const dir = directionOf(index);
    for (const point of [
      { x: ROAD_SIDE, d: ROAD_TURN },
      { x: ROAD_SIDE, d: STOP_DEPTH - ROAD_TURN },
      { x: seamX(index), d: STOP_DEPTH },
    ]) {
      vertices.push({ x: round(point.x * dir * CELL_PX), y: round(index * STOP_DEPTH + point.d) });
    }
  });
  return vertices;
}

/** Короткие дорожки к дверям — отдельным путём, чтобы не ломать прогресс. */
export function drivePaths() {
  return routeStops
    .map((stop, index) => {
      const map = TOWN[stop.id];
      if (!map) return "";
      return pathFrom(map.drive, index, directionOf(index));
    })
    .filter(Boolean)
    .join(" ");
}

/** Высота всей ленты в единицах пути. */
export function roadHeight() {
  return routeStops.length * STOP_DEPTH;
}

/** Где дорога пересекает середину остановки — туда садится её зарубка. */
export function stopMarkLeft(stopIndex: number) {
  return cellLeft(ROAD_SIDE * directionOf(stopIndex));
}

/**
 * Единый множитель городка. Ширина объекта и его смещение считаются от одного
 * и того же `--town-unit` (globals.css), поэтому масштаб меняется в одном месте
 * и композиция не разъезжается: уменьшается всё сразу.
 */
export function townSize(basePx: number) {
  return `calc(${round(basePx)} * var(--town-unit))`;
}
