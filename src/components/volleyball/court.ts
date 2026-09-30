import { LANDMARK_ASSETS } from "@/lib/scene-assets";

/**
 * Геометрия волейбольного корта, снятая с ассета владельца.
 *
 * Все числа — пиксели файла `volleyball-court.webp` (640×406), замерены по
 * увеличенной картинке. Игра считает мяч в координатах площадки, а на экран
 * переводит через эти точки, поэтому поменяется картинка — перемерить надо
 * только этот файл.
 *
 * Площадка на картинке — не ровный ромб: у рендера лёгкая перспектива, ближний
 * край длиннее дальнего. Поэтому точка площадки считается билинейно по четырём
 * углам, а не «угол плюс два вектора»: так мяч приземляется точно на линии.
 */

export const COURT = LANDMARK_ASSETS.volleyballCourt;

/** Натуральный размер файла: в нём заданы все точки ниже */
export const IMG_W = COURT.width;
export const IMG_H = COURT.height;

/**
 * Углы игрового поля по середине белой разметки. u — поперёк сетки (0 — наша
 * задняя линия, ближняя к зрителю; 1 — задняя линия соперника), v — вдоль
 * сетки (0 — левая боковая, 1 — правая).
 */
const CORNER_OURS_LEFT = { x: 40, y: 216 };
const CORNER_OURS_RIGHT = { x: 278, y: 364 };
const CORNER_THEIRS_LEFT = { x: 370, y: 65 };
const CORNER_THEIRS_RIGHT = { x: 599, y: 196 };

/** Сетка стоит на середине поля: левая стойка ровно на u = 0,51 боковой линии */
export const NET_U = 0.5;

/**
 * Полотно сетки на картинке: верхняя и нижняя кромки — прямые от левой стойки
 * (x = 221) до правой (x = 447). Мяч за сеткой в этой полосе рисуется
 * полупрозрачным — «виден сквозь сетку»: масок по картинке нет, а мяч поверх
 * сетки читался бы как пролетевший сквозь неё.
 */
const NET_X0 = 221;
const NET_X1 = 447;
const NET_TOP = { y0: 29, slope: 0.55 };
const NET_BOTTOM = { y0: 90, slope: 0.553 };

/** Высота верхней кромки сетки над землёй — ~117 px картинки у стоек */
export const NET_HEIGHT = 117;

/** Мяч: диаметр в базовых пикселях городка и радиус в пикселях картинки */
export const BALL_BASE = 15;
export const BALL_R = ((BALL_BASE / COURT.display) * IMG_W) / 2;

export type CourtPoint = { u: number; v: number; h: number };

/** Точка на земле площадки в пикселях картинки. */
export function ground(u: number, v: number) {
  const a = (1 - u) * (1 - v);
  const b = (1 - u) * v;
  const c = u * (1 - v);
  const d = u * v;
  return {
    x: a * CORNER_OURS_LEFT.x + b * CORNER_OURS_RIGHT.x + c * CORNER_THEIRS_LEFT.x + d * CORNER_THEIRS_RIGHT.x,
    y: a * CORNER_OURS_LEFT.y + b * CORNER_OURS_RIGHT.y + c * CORNER_THEIRS_LEFT.y + d * CORNER_THEIRS_RIGHT.y,
  };
}

/** Центр мяча на картинке: `h` — высота нижней точки мяча над землёй. */
export function ballCenter(p: CourtPoint) {
  const g = ground(p.u, p.v);
  return { x: g.x, y: g.y - p.h - BALL_R };
}

/** Мяч по ту сторону сетки и на картинке закрыт её полотном. */
export function behindNet(p: CourtPoint) {
  if (p.u <= NET_U) return false;
  const { x, y } = ballCenter(p);
  if (x < NET_X0 || x > NET_X1) return false;
  const top = NET_TOP.y0 + (x - NET_X0) * NET_TOP.slope;
  const bottom = NET_BOTTOM.y0 + (x - NET_X0) * NET_BOTTOM.slope;
  return y + BALL_R * 0.5 > top && y - BALL_R * 0.5 < bottom;
}

/** Где мяч лежит, пока игра не идёт: на нашей половине, у задней линии */
export const REST: CourtPoint = { u: 0.24, v: 0.62, h: 0 };

/** Проценты для статичной разметки: округлены, чтобы сервер и клиент совпали */
export function percent(x: number, y: number) {
  return {
    left: `${Math.round((x / IMG_W) * 10000) / 100}%`,
    top: `${Math.round((y / IMG_H) * 10000) / 100}%`,
  };
}
