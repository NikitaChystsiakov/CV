/**
 * Фоновые кварталы: город за главной улицей (решение владельца 10.10.2026).
 *
 * Первая версия задника (30.09) ставила семь домов на остановку по
 * ручной таблице со сдвигом — владелец увидел в этом «рандомно расположенные
 * дома». Теперь по краям стоят ряды небольших домов и деревьев по решётке —
 * мельче и бледнее главных (прозрачность на весь слой, `--backdrop-opacity`),
 * чтобы не спорить с ними и с текстом.
 *
 * Раскладка не случайная, а по решётке изосетки: точки, где u и v кратны
 * шагу. Каждая третья линия решётки пустует — получаются ряды домов под 30°
 * с проездами между ними, как в настоящем городе. Взгляд считывает
 * порядок, а не разброс. Какая точка занята домом, какая деревом, а какая
 * пустует (сквер), решает детерминированный хеш от номера точки: сервер и
 * браузер получают одну и ту же картинку, без расхождения при гидратации.
 *
 * Точка отпадает, если её объект задевает зарезервированное: проспект,
 * главный дом с его двором, колонку текста или сквер с шахматами. Зоны
 * описаны в тех же клетках, что карта (`town.ts`): x — поперёк от осевой,
 * d — вглубь, сквозная по всему маршруту (остановка — STOP_DEPTH клеток).
 */

import { LANDMARKS } from "@/lib/landmark-spots";
import { routeStops } from "@/lib/route";
import { CELL_PX, STOP_DEPTH, cellLeft } from "@/lib/town";

/** Шаг между домами квартала в клетках по осям u и v. */
const STEP = 8;
/**
 * Каждая третья линия решётки вдоль v пустует и становится улицей: дома стоят
 * рядами по два вдоль оси u, между рядами — проезд. Без этого решётка
 * читалась как обои из одинаковых домов. Улицы в обе стороны (блоки 2×2)
 * пробовали — у краёв экрана, где кварталы и видны, оставалось пусто.
 */
const BLOCK = 3;
/** Насколько далеко от осевой строить кварталы: хватает на 1920px. */
const REACH = 56;
/**
 * На первых остановках — вдвое шире: там камера смотрит сверху (наезд в
 * route-track.tsx, масштаб 0,45), и в кадр попадает вдвое больше города.
 */
const REACH_OVERVIEW = 110;
const OVERVIEW_DEPTH = 3 * STOP_DEPTH;

/** Высота клетки глубины на экране при опорном окне, базовые px (22 × tan 30°). */
const ROW_PX = CELL_PX * 0.577;

export type BackdropKind = "house" | "tree" | "pine";

/** Ширина на экране в базовых пикселях и пропорция картинки (высота / ширина). */
export const BACKDROP_ART: Record<BackdropKind, { width: number; aspect: number }> = {
  house: { width: 190, aspect: 529 / 560 },
  tree: { width: 76, aspect: 563 / 360 },
  pine: { width: 70, aspect: 595 / 360 },
};

export type BackdropNode = {
  key: string;
  kind: BackdropKind;
  /**
   * Тон фонового дома: 0 — как есть, 1 — теплее, 2 — холоднее. Запечён
   * конвейером в три файла (`bg-house-1`, `-warm`, `-cool`), чтобы один ассет
   * в ряду не читался повтором; CSS-фильтр на десятках картинок
   * растеризовался бы заново на каждом тайле при скролле.
   */
  tone: 0 | 1 | 2;
  /** Смещение основания от осевой, базовые пиксели */
  left: number;
  /** Доля высоты маршрута, проценты */
  top: number;
  flip: boolean;
  scale: number;
};

type Rect = { x0: number; x1: number; d0: number; d1: number };

/** Детерминированный хеш точки решётки → [0, 1). */
function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Что занято на каждой остановке. Канонический вид — «дом справа», для левых
 * остановок зеркалится по x, как и вся карта.
 */
function reserved(): Rect[] {
  const rects: Rect[] = [];
  const total = routeStops.length * STOP_DEPTH;

  // Проспект с бордюром и фонарями — на всю длину
  rects.push({ x0: -8, x1: 8, d0: -20, d1: total + 20 });

  routeStops.forEach((stop, index) => {
    const dir = stop.side === "left" ? -1 : 1;
    const top = index * STOP_DEPTH;
    const mirror = (x0: number, x1: number, d0: number, d1: number): Rect =>
      dir > 0
        ? { x0, x1, d0: top + d0, d1: top + d1 }
        : { x0: -x1, x1: -x0, d0: top + d0, d1: top + d1 };

    // Главный дом, дерево за ним и двор с клумбами
    rects.push(mirror(2, 26, -10, 52));
    // Колонка текста. Она уже половины экрана (`max-w-[30rem]` у абзаца), и
    // внешний край остаётся кварталам. Мини-игра и hero шире и выше абзаца
    const tall = stop.id === "minigame" || stop.kind === "hero";
    rects.push(mirror(tall ? -33 : -29, -2, tall ? 2 : 12, tall ? 56 : 46));
  });

  // Сквер с шахматами — площадка стоит центром на своей точке
  for (const landmark of LANDMARKS) {
    const index = routeStops.findIndex((stop) => stop.id === landmark.stopId);
    if (index < 0) continue;
    const x = landmark.left / CELL_PX;
    const d = (index + landmark.offset) * STOP_DEPTH;
    rects.push({ x0: x - 12, x1: x + 12, d0: d - 14, d1: d + 10 });
  }

  return rects;
}

function hits(a: Rect, b: Rect) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.d0 < b.d1 && a.d1 > b.d0;
}

/**
 * Все объекты фоновых кварталов в порядке отрисовки (дальние раньше).
 * Считается один раз на модуль: раскладка от окна не зависит, адаптив делает
 * общий множитель `--town-unit`, а лишнее срезает край экрана.
 */
export function backdropNodes(): BackdropNode[] {
  const total = routeStops.length * STOP_DEPTH;
  const blocked = reserved();
  const nodes: (BackdropNode & { depth: number })[] = [];

  // Точки решётки: x = (a − b)·STEP, d = (a + b)·STEP
  const kMax = Math.ceil(total / STEP);
  for (let k = 1; k <= kMax; k += 1) {
    const d = k * STEP;
    if (d > total - 2) break;
    const reach = d < OVERVIEW_DEPTH ? REACH_OVERVIEW : REACH;
    for (let m = -Math.ceil(reach / STEP); m <= Math.ceil(reach / STEP); m += 1) {
      if ((m + k) % 2 !== 0) continue;
      const x = m * STEP;

      // Номер точки по оси v: каждая BLOCK-я линия — улица
      const v = (k - m) / 2;
      if (((v % BLOCK) + BLOCK) % BLOCK === 0) continue;

      const roll = hash(k, m);
      // Редкая пустая клетка внутри квартала — двор
      if (roll < 0.1) continue;
      const kind: BackdropKind = roll < 0.74 ? "house" : roll < 0.88 ? "tree" : "pine";
      const art = BACKDROP_ART[kind];
      const scale = round(0.92 + hash(m, k) * 0.16);
      const halfWidth = (art.width * scale) / CELL_PX / 2;
      const height = (art.width * scale * art.aspect) / ROW_PX;
      const box = { x0: x - halfWidth, x1: x + halfWidth, d0: d - height, d1: d };

      // Объект не должен свисать над началом маршрута и задевать занятое
      if (box.d0 < 0) continue;
      if (blocked.some((rect) => hits(rect, box))) continue;

      nodes.push({
        key: `bg-${k}-${m}`,
        kind,
        left: cellLeft(x),
        top: round((d / total) * 100),
        flip: hash(k * 7, m * 3) < 0.5,
        tone: Math.floor(hash(m * 5, k * 11) * 3) as 0 | 1 | 2,
        scale,
        depth: d,
      });
    }
  }

  return nodes
    .sort((a, b) => a.depth - b.depth)
    .map(({ key, kind, tone, left, top, flip, scale }) => ({ key, kind, tone, left, top, flip, scale }));
}
