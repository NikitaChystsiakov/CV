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
  /**
   * Стоит у внешнего края городка: рисуется только от 1280. На 768–1024 окно
   * уже карты, и такой объект оказался бы срезан краем экрана.
   */
  wide?: boolean;
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
 * месте важнее красоты таблицы: под домом и текстом ставить нельзя, а
 * свободных полос немного — перед домом, за домом, обочина со стороны текста
 * и полоса между осевой и полотном.
 *
 * Раскладка собрана «участками», а не поштучно (блок «город, а не выставка
 * предметов»): плотнее у дома, воздух у текста.
 *
 * F — палисадник перед домом (дом кончается на d = 41, поэтому объект не
 *     должен доставать до него верхушкой: чем выше объект, тем больше d);
 * B — сад за домом, выше его крыши;
 * C — ближняя обочина, между осевой линией и полотном (полотно с 29.09.2026
 *     шире — 86 базовых px, его кромка на x ≈ 8, поэтому C стоит на x = 4);
 * S — сквер на стороне текста над колонкой (d 2–14),
 * Q — сквер на стороне текста под колонкой (d 44–56). Колонка текста стоит
 *     по центру остановки, d ≈ 20–38.
 *
 * Лавочка у ассета смотрит сиденьем влево-вниз. Левее дороги её зеркалят
 * (`flip`), чтобы она смотрела на дорогу, а не спинкой к ней.
 */
const F1: Cell = { x: 14, d: 49 };
const F2: Cell = { x: 22, d: 51 };
const F3: Cell = { x: 29, d: 49 };
const F4: Cell = { x: 18, d: 46 }; // только для низких объектов (урна)
// Угол участка у внешнего края: правее дома на клетку, чтобы крона не
// заходила на цоколь. Только от 1280 (`wide`)
const F5 = { x: 35, d: 47, wide: true } as const;
const B1: Cell = { x: 16, d: 5 };
const B2: Cell = { x: 27, d: 6 };
const B3 = { x: 33, d: 12, wide: true } as const;
const C1: Cell = { x: 4, d: 16 };
const C2: Cell = { x: 4, d: 30 };
const S1: Cell = { x: -9, d: 6 };
const S2: Cell = { x: -16, d: 9 };
const S3: Cell = { x: -25, d: 5 };
const S4 = { x: -30, d: 13, wide: true } as const;
const Q1: Cell = { x: -10, d: 50 };
const Q2: Cell = { x: -18, d: 54 };
const Q3: Cell = { x: -26, d: 48 };
const Q4 = { x: -31, d: 55, wide: true } as const;

/**
 * Дорожка к дому: от полотна вверх-вправо, перпендикулярно левой грани цоколя,
 * и уходит под дом — конец прячется под картинкой. Прежняя шла параллельно
 * грани в двух клетках перед ней, под дом не заходила, и её скруглённый конец
 * торчал у цоколя «сосиской». Грань цоколя — линия d − x = 19 (от угла
 * (11,5; 30,5) до основания (22; 41)); конечная точка (15; 32) — уже за ней.
 */
const DRIVE: [Cell, Cell] = [
  { x: 10, d: 37 },
  { x: 15, d: 32 },
];

/**
 * Улица по остановкам — таблица из docs/город.md, раздел 3.
 *
 * Ключи совпадают с id в route.ts. Остановки без записи (черновая развилка)
 * на маршрут не выходят.
 */
const TOWN: Record<string, TownStop> = {
  // Арка на входе: два фонаря по бокам, клумбы у столбов, урна у дорожки;
  // напротив — сквер с лавочкой, откуда начинается прогулка
  hero: {
    house: { x: 22, d: 41 },
    drive: DRIVE,
    props: [
      { ...F1, name: "lamp" },
      { ...F3, name: "lamp", flip: true },
      { ...F2, name: "flowerbed" },
      { ...F4, name: "trash" },
      { ...F5, name: "bush" },
      { ...B2, name: "tree", back: true },
      { ...B3, name: "pine", back: true },
      { ...Q1, name: "flowerbed" },
      { ...Q2, name: "bench", flip: true },
      { ...Q3, name: "tree", back: true },
      { ...Q4, name: "bush" },
    ],
  },

  // Дом навыков: клумба у входа, лавочка лицом к дороге, сад за домом;
  // напротив, над текстом — сквер с деревьями
  skills: {
    house: { x: 22, d: 41 },
    drive: DRIVE,
    props: [
      { ...F1, name: "flowerbed" },
      { ...F2, name: "bush" },
      { ...F3, name: "lamp" },
      { ...F5, name: "tree", back: true },
      { ...C2, name: "bench", flip: true },
      { ...B1, name: "bush", back: true },
      { ...B2, name: "tree", back: true },
      { ...S2, name: "flowerbed" },
      { ...S3, name: "tree", back: true },
      { ...S4, name: "bush" },
      { ...Q2, name: "lamp" },
      { ...Q3, name: "flowerbed" },
    ],
  },

  // Мини-игра: мастерская под открытым небом — забор за верстаком, фонарь,
  // урна у стола; напротив — лавочка для зрителей
  minigame: {
    house: { x: 22, d: 41 },
    drive: DRIVE,
    props: [
      { x: 17, d: 13, name: "fence", back: true },
      { x: 26, d: 14, name: "fence", back: true },
      { x: 34, d: 20, name: "tree", back: true, wide: true },
      { ...F1, name: "lamp" },
      { ...F4, name: "trash" },
      { ...F3, name: "bush" },
      { ...F5, name: "flowerbed" },
      { ...C2, name: "bench", flip: true },
      { ...S3, name: "pine", back: true },
      { ...Q1, name: "bush" },
      { ...Q3, name: "tree", back: true },
    ],
  },

  // Дом технологий: фонарь у двери, ели за домом, клумба; сквер над текстом
  tech: {
    house: { x: 22, d: 41 },
    drive: DRIVE,
    props: [
      { ...F1, name: "lamp" },
      { ...F2, name: "flowerbed" },
      { ...F3, name: "bush" },
      { ...F5, name: "lamp", flip: true },
      { ...C2, name: "bench", flip: true },
      { ...B1, name: "pine", back: true },
      { ...B2, name: "pine", back: true },
      { ...S1, name: "bush" },
      { ...S2, name: "bench", flip: true },
      { ...S4, name: "tree", back: true },
      { ...Q2, name: "flowerbed" },
      { ...Q4, name: "tree", back: true },
    ],
  },

  // Дом кейсов: две клумбы галереей, лавочка напротив через дорогу — лицом
  // к дому, как у входа в музей
  cases: {
    house: { x: 22, d: 41 },
    drive: DRIVE,
    props: [
      { ...F1, name: "flowerbed" },
      { ...F2, name: "flowerbed" },
      { ...F3, name: "lamp" },
      { ...F5, name: "bush" },
      { ...C2, name: "bench", flip: true },
      { ...B2, name: "tree", back: true },
      // Галерея шире и выше остальных домов — дерево на клетку дальше B3
      { x: 36, d: 10, name: "tree", back: true, wide: true },
      { ...S2, name: "tree", back: true },
      { ...S3, name: "flowerbed" },
      { ...Q1, name: "bush", back: true },
      { ...Q2, name: "lamp" },
      { ...Q4, name: "tree", back: true },
    ],
  },

  // Дом опыта: напротив сквер с шахматным столом (landmark-spots.ts),
  // поэтому низ у стороны текста занят — декор уходит выше
  experience: {
    house: { x: 22, d: 41 },
    drive: DRIVE,
    props: [
      { ...S2, name: "tree", back: true },
      { ...S1, name: "bench", flip: true },
      { ...S4, name: "flowerbed" },
      { ...F1, name: "lamp" },
      { ...F2, name: "flowerbed" },
      { ...F3, name: "bush" },
      { ...F5, name: "tree", back: true },
      { ...B2, name: "tree", back: true },
      { ...C1, name: "bush", back: true },
    ],
  },

  // Дом «о себе»: жилой и спокойный — клумбы, лавочка, дерево, урна. Низ
  // стороны текста отдан волейбольной площадке (landmark-spots.ts)
  about: {
    house: { x: 22, d: 41 },
    drive: DRIVE,
    props: [
      { ...F1, name: "flowerbed" },
      { ...F2, name: "flowerbed" },
      { ...F4, name: "trash" },
      { ...F5, name: "tree", back: true },
      { ...C2, name: "bench", flip: true },
      { ...B1, name: "bush", back: true },
      { ...B2, name: "tree", back: true },
      { ...S1, name: "lamp" },
      { ...S3, name: "tree", back: true },
      { ...S2, name: "flowerbed" },
      { ...Q1, name: "lamp" },
    ],
  },

  // Финиш: фонари парой, дальше пусто — за финишем ничего нет
  outro: {
    house: { x: 22, d: 41 },
    drive: DRIVE,
    props: [
      { ...F1, name: "lamp" },
      { ...F3, name: "lamp", flip: true },
      { ...F2, name: "flowerbed" },
      { ...C2, name: "bench", flip: true },
      { ...B1, name: "bush", back: true },
      { ...B3, name: "tree", back: true },
      { ...S2, name: "tree", back: true },
      { ...S3, name: "bush" },
      { ...Q2, name: "flowerbed" },
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
  { x: 4, d: 14, name: "lamp" },
  { x: 4, d: 44, name: "lamp" },
  { x: -7, d: 56, name: "tree", back: true },
];

/**
 * Фоновые кварталы: ряды жилых домов по внешним краям улицы, за домами
 * маршрута. Они мельче, бледнее и тоньше по тону, чем главные дома: это
 * задник, который превращает улицу из выставки предметов в город, а не ещё
 * один дом, спорящий с текстом.
 *
 * Канонический вид тот же — «дом маршрута справа». Справа ряд стоит за его
 * домом (главный дом перекрывает задник на полкорпуса), слева — у внешнего
 * края, дальше колонки текста. На узких окнах (768–1024) крайние дома
 * срезаны краем экрана — ряд уходит за кадр, как настоящая улица.
 *
 * Чтобы повтор одного ассета не читался, у каждого дома свои зеркало, тон
 * (`tone` — вариант файла, запечённый конвейером) и масштаб, а от остановки к
 * остановке ряд сдвигается (`backdropNodes`).
 */
type TownBackdrop = Cell & {
  flip?: boolean;
  /** Сдвиг тона: 0 — как есть, 1 — теплее, 2 — холоднее и светлее */
  tone: 0 | 1 | 2;
  /** Доля от базовой ширины фонового дома */
  scale: number;
};

const BACKDROP: TownBackdrop[] = [
  // За домом маршрута: выглядывают из-за крыши и у внешнего края
  { x: 31, d: 3, tone: 2, scale: 0.82 },
  { x: 38, d: 17, tone: 0, scale: 0.94, flip: true },
  { x: 37, d: 36, tone: 1, scale: 1 },
  { x: 39, d: 54, tone: 2, scale: 0.9, flip: true },
  // Сторона текста: за колонкой, у внешнего края
  { x: -37, d: 9, tone: 1, scale: 0.9, flip: true },
  { x: -39, d: 30, tone: 2, scale: 0.86 },
  { x: -36, d: 50, tone: 0, scale: 0.96, flip: true },
];

/** Базовая ширина фонового дома, базовые px: половина дома маршрута (460). */
export const BACKDROP_WIDTH = 232;

/** Фоновый дом на экране: координаты — уже для всего маршрута. */
export type BackdropNode = {
  key: string;
  /** Смещение основания от осевой, базовые px */
  left: number;
  /** Доля высоты всего маршрута, проценты */
  top: number;
  flip: boolean;
  tone: 0 | 1 | 2;
  scale: number;
};

/**
 * Все фоновые дома маршрута, от дальних к ближним. Ряд от остановки к
 * остановке чуть сдвигается и меняет зеркало: одинаковая раскладка на каждой
 * остановке читалась бы как обои.
 */
export function backdropNodes(): BackdropNode[] {
  const nodes: BackdropNode[] = [];
  routeStops.forEach((stop, index) => {
    if (!TOWN[stop.id]) return;
    const dir = directionOf(index);
    // Сдвиг по остановке: детерминированный, одинаковый на сервере и клиенте
    const shift = ((index * 5) % 7) - 3;
    BACKDROP.forEach((item, n) => {
      const d = Math.min(Math.max(item.d + shift, 1), STOP_DEPTH - 1);
      const left = cellLeft((item.x + (n % 2 === 0 ? 0 : shift / 3)) * dir);
      const top = round(((index + d / STOP_DEPTH) / routeStops.length) * 100);
      // Площадки у дороги (шахматы, волейбол) стоят на своём месте, задник уступает
      if (insideKeepOut(top, left, { top: 2.4, left: 300 })) return;
      nodes.push({
        key: `${stop.id}-backdrop-${n}`,
        left,
        top,
        flip: dir < 0 ? !item.flip : Boolean(item.flip),
        tone: ((item.tone + index) % 3) as 0 | 1 | 2,
        scale: item.scale,
      });
    });
  });
  return nodes.sort((a, b) => a.top - b.top);
}

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
  /** Только от 1280: объект у внешнего края */
  wide: boolean;
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
      wide: false,
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
      wide: Boolean(prop.wide),
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
