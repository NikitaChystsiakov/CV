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
 * Места, которые повторяются от остановки к остановке. Держать их в одном
 * месте важнее красоты таблицы: под домом и текстом ставить нельзя, а свободных
 * полос всего четыре — перед домом, за домом, обочина со стороны текста и
 * полоса между осевой и полотном.
 *
 * F — перед домом (дом кончается на d = 41, поэтому объект не должен
 *     доставать до него верхушкой: чем выше объект, тем больше d);
 * B — за домом, выше его крыши;
 * C — ближняя обочина, между осевой линией и полотном;
 * T — сторона текста, только выше и ниже колонки с текстом.
 */
const F1: Cell = { x: 14, d: 49 };
const F2: Cell = { x: 22, d: 51 };
const F3: Cell = { x: 29, d: 49 };
const F4: Cell = { x: 18, d: 46 }; // только для низких объектов (урна)
const B1: Cell = { x: 16, d: 5 };
const B2: Cell = { x: 27, d: 6 };
const C1: Cell = { x: 5, d: 16 };
const C2: Cell = { x: 5, d: 30 };
const T1: Cell = { x: -13, d: 8 };
const T2: Cell = { x: -25, d: 12 };
const T3: Cell = { x: -14, d: 50 };

/**
 * Улица по остановкам — таблица из docs/город.md, раздел 3.
 *
 * Ключи совпадают с id в route.ts. Остановки без записи (черновая развилка)
 * на маршрут не выходят.
 */
const TOWN: Record<string, TownStop> = {
  // Арка на входе: два фонаря по бокам, клумбы у столбов, урна у дорожки
  hero: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    props: [
      { ...F1, name: "lamp" },
      { ...F3, name: "lamp", flip: true },
      { ...F2, name: "flowerbed" },
      { ...F4, name: "trash" },
      { ...B2, name: "tree", back: true },
      { ...T1, name: "bush", back: true },
    ],
  },

  // Дом навыков: клумба у входа, лавочка лицом к дороге, дерево за домом
  skills: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    props: [
      { ...F1, name: "flowerbed" },
      { ...F3, name: "lamp" },
      { ...C2, name: "bench", flip: true },
      { ...B2, name: "tree", back: true },
      { ...B1, name: "bush", back: true },
      { ...T3, name: "flowerbed" },
    ],
  },

  // Мини-игра: забор за верстаком, фонарь, куст, урна у стола
  minigame: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    props: [
      { x: 17, d: 13, name: "fence", back: true },
      { x: 26, d: 14, name: "fence", back: true },
      { ...F1, name: "lamp" },
      { ...F4, name: "trash" },
      { ...F3, name: "bush" },
      { ...C2, name: "bench", flip: true },
    ],
  },

  // Дом технологий: фонарь у двери, ель за домом
  tech: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    props: [
      { ...F1, name: "lamp" },
      { ...B2, name: "pine", back: true },
      { ...F2, name: "flowerbed" },
      { ...F3, name: "bush" },
      { ...C2, name: "bench", flip: true },
      { ...T2, name: "tree", back: true },
    ],
  },

  // Дом кейсов: две клумбы галереей, лавочка напротив через дорогу
  cases: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    props: [
      { ...F1, name: "flowerbed" },
      { ...F2, name: "flowerbed" },
      { ...C2, name: "bench" },
      { ...F3, name: "lamp" },
      { ...B2, name: "tree", back: true },
      { ...T3, name: "bush", back: true },
    ],
  },

  // Дом опыта: напротив сквер с шахматным столом (landmark-spots.ts),
  // поэтому низ у стороны текста занят — декор уходит выше
  experience: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    props: [
      { ...T2, name: "tree", back: true },
      { ...T1, name: "bench" },
      { ...F1, name: "lamp" },
      { ...F2, name: "flowerbed" },
      { ...B2, name: "tree", back: true },
      { ...C1, name: "bush", back: true },
    ],
  },

  // Дом «о себе»: жилой и спокойный — клумбы, лавочка, дерево, урна
  about: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    props: [
      { ...F1, name: "flowerbed" },
      { ...F2, name: "flowerbed" },
      { ...F4, name: "trash" },
      { ...C2, name: "bench", flip: true },
      { ...B2, name: "tree", back: true },
      { ...T3, name: "lamp" },
    ],
  },

  // Финиш: фонари парой, дальше пусто — за финишем ничего нет
  outro: {
    house: { x: 22, d: 41 },
    drive: [
      { x: 10, d: 31 },
      { x: 17, d: 38 },
    ],
    props: [
      { ...F1, name: "lamp" },
      { ...F3, name: "lamp", flip: true },
      { ...F2, name: "flowerbed" },
      { ...C2, name: "bench", flip: true },
      { ...B1, name: "bush", back: true },
      { ...T2, name: "tree", back: true },
    ],
  },
};

/**
 * Декор между остановками — единственное место, где объекты ставятся по
 * правилу, а не поимённо (docs/город.md, раздел 3): фонари вдоль полотна с
 * постоянным шагом и дерево на стыке остановок. Шаг переведён в глубину
 * остановки: 30 клеток — примерно 220px улицы при опорном окне.
 */
const ROADSIDE: TownProp[] = [
  { x: 5, d: 14, name: "lamp" },
  { x: 5, d: 44, name: "lamp" },
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
  const hand = map.props;
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
