/**
 * Какой ассет где стоит.
 *
 * Файлы готовит `npm run assets` из исходников владельца (`assets-src`) в
 * `public/scene`, а размеры готовых файлов приходят манифестом — держать те же
 * числа руками было бы верным способом разойтись с картинками.
 *
 * Остановки, для которых ассета ещё нет, показывают прежний плейсхолдер.
 * Выдумывать им замену нельзя: чего не хватает — записано в
 * `docs/нужны-ассеты.md`.
 */

import manifest from "@/lib/scene-manifest.json";

export type SceneAsset = {
  src: string;
  /** Натуральные размеры файла: `next/image` требует их заранее */
  width: number;
  height: number;
  /** Ширина на экране в базовом масштабе, CSS-пиксели */
  display: number;
};

const FILES: Record<string, { src: string; width: number; height: number }> = manifest;

function asset(name: string, display: number): SceneAsset {
  return { ...FILES[name], display };
}

/**
 * Дома маршрута. `display` — ширина в БАЗОВОМ масштабе городка: на экране она
 * умножается на `--town-unit` (globals.css), поэтому дом на маленьком экране
 * уменьшается вместе с декором и дорогой, а не распирает колонку.
 */
export const STOP_ASSETS: Record<string, SceneAsset> = {
  hero: asset("arch", 440),
  skills: asset("skillsHouse", 460),
  minigame: asset("workbench", 420),
  tech: asset("technologiesHouse", 460),
  cases: asset("casesHouse", 460),
  experience: asset("experienseHouse", 460),
  about: asset("AboutmeHouse", 460),
  outro: asset("end", 460),
};

/**
 * Где у дома дверь — доля ширины и высоты картинки, от левого верхнего угла.
 *
 * Вход в дом (`use-house-entry.ts`) наезжает камерой именно на эту точку: она
 * остаётся неподвижной относительно дома и уезжает в центр экрана, поэтому
 * наезд читается как шаг к двери, а не как увеличение картинки. Точки сняты
 * с самих ассетов владельца по центру дверного проёма; поменяется картинка —
 * точку надо переснять, иначе камера будет входить в стену.
 */
export const HOUSE_DOORS: Record<string, { x: number; y: number }> = {
  // Дом навыков: дверь на левом фасаде, под вывеской с плиткой
  skills: { x: 0.32, y: 0.67 },
  tech: { x: 0.31, y: 0.68 },
  cases: { x: 0.62, y: 0.62 },
  experience: { x: 0.67, y: 0.63 },
  about: { x: 0.68, y: 0.58 },
};

/**
 * Декор пути. Ширина — в базовом масштабе, поверх неё раскладка декора
 * применяет свой коэффициент глубины (0,7–1,45).
 */
export const PROP_ASSETS = {
  tree: asset("tree", 104),
  pine: asset("pine", 96),
  bush: asset("bush", 92),
  lamp: asset("flashlight", 62),
  bench: asset("bench", 128),
  fence: asset("fence", 124),
  flowerbed: asset("flowerbed", 108),
  // Урна — временный объект: SVG-заглушка мимо конвейера ассетов, поэтому
  // размеры записаны руками, а не пришли манифестом. Придёт картинка
  // владельца (docs/нужны-ассеты.md) — строка вернётся к виду `asset(...)`
  trash: { src: "/scene/trash-bin.svg", width: 96, height: 120, display: 44 },
} satisfies Record<string, SceneAsset>;

export type PropName = keyof typeof PROP_ASSETS;

/**
 * Шахматы: стол, доска и фигуры для площадки на маршруте и полки в доме опыта.
 *
 * Стол — 220px: при 300 он был в два с лишним раза крупнее скамейки и занимал
 * две трети соседнего дома, а это деталь у дороги, а не здание. Доска и фигуры
 * считаются от ширины стола, чтобы при следующей подгонке менялось одно число:
 * доска — 0,84 ширины стола (252 при 300), фигуры — доли ширины доски, при
 * которых они помещались в клетку (король 20 при доске 252).
 */
const CHESS_TABLE_WIDTH = 220;
const CHESS_BOARD_WIDTH = Math.round(CHESS_TABLE_WIDTH * 0.84);

function chessPiece(name: string, shareOfBoard: number): SceneAsset {
  return asset(name, Math.round(CHESS_BOARD_WIDTH * shareOfBoard));
}

export const CHESS_ASSETS = {
  table: asset("table", CHESS_TABLE_WIDTH),
  board: asset("chessboard", CHESS_BOARD_WIDTH),
  king: chessPiece("king", 20 / 252),
  queen: chessPiece("queen", 19 / 252),
  rook: chessPiece("rook", 18 / 252),
  bishop: chessPiece("bishop", 18 / 252),
  knight: chessPiece("knight", 18 / 252),
  pawn: chessPiece("pawn", 16 / 252),
};

/**
 * Площадки у дороги, собранные из одного ассета. Корт — 300 базовых px:
 * крупнее лавочки и шахматного стола (220), но заметно мельче дома (460),
 * это деталь у дороги, а не здание. Мяч поверх рисуется кодом (VolleyBall).
 */
export const LANDMARK_ASSETS = {
  volleyballCourt: asset("volleyball-court", 300),
};
