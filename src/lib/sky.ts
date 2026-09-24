/**
 * Небо по настоящим координатам.
 *
 * Раньше звёзды расставлялись «на глаз» прямо в компонентах, и на небе
 * получались фигуры, которых не существует. Теперь у каждой звезды её реальные
 * экваториальные координаты (эпоха J2000) и звёздная величина, а раскладка на
 * экране — результат проекции, а не подобранные вручную числа.
 *
 * Данные фигур лежат в `constellations.ts`, здесь только математика.
 */

import type { Localized } from "@/lib/i18n";

export type SkyStar = {
  /** Прямое восхождение, часы */
  ra: number;
  /** Склонение, градусы */
  dec: number;
  /** Видимая звёздная величина: чем меньше, тем ярче звезда */
  mag: number;
  /** Собственное имя, если у звезды оно есть */
  name?: string;
};

export type SkyFigure = {
  id: string;
  /** Название на обоих языках: его показывает подпись */
  name: Localized;
  stars: SkyStar[];
  /** Рёбра фигуры парами индексов в `stars` */
  links: [number, number][];
};

export type ProjectOptions = {
  width: number;
  height: number;
  padding?: number;
  /**
   * Во сколько раз одной оси разрешено растянуться относительно честного
   * масштаба. 1 — форма без искажений. Больше 1 нужно там, где фигуру надо
   * вписать в узкую панель: Скорпион почти квадратный, а карта сбоку — высокий
   * столбец.
   */
  maxStretch?: number;
};

export type SkyPoint = { x: number; y: number };

const RAD = Math.PI / 180;

/**
 * Тригонометрия на сервере и в браузере расходится в последнем бите
 * (78.52867331171375 против ...77), и React ругался на несовпадение разметки
 * при гидратации. Округление до тысячных убирает расхождение, а на экране это
 * доли пикселя.
 */
function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Направление на звезду единичным вектором. */
function toVector({ ra, dec }: SkyStar) {
  const a = ra * 15 * RAD;
  const d = dec * RAD;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

/**
 * Центр фигуры — усреднение единичных векторов, а не среднее по ra и dec.
 * У Малой Медведицы звёзды лежат по обе стороны от 0 часов, у Пегаса тоже:
 * среднее по ra увело бы центр проекции на другую сторону неба.
 */
function figureCenter(stars: SkyStar[]) {
  const sum = [0, 0, 0];
  for (const star of stars) {
    const v = toVector(star);
    sum[0] += v[0];
    sum[1] += v[1];
    sum[2] += v[2];
  }

  const length = Math.hypot(sum[0], sum[1], sum[2]);
  return {
    ra0: Math.atan2(sum[1], sum[0]),
    dec0: Math.asin(sum[2] / length),
  };
}

/**
 * Гномоническая проекция на касательную плоскость: прямая на небе остаётся
 * прямой на экране, а рядом с центром фигура не искажается. Простое
 * «x = Δra · cos(dec)» у приполярных созвездий (Малая Медведица) разваливает
 * ковш, поэтому берётся честная формула.
 *
 * Оси разворачиваются под взгляд с земли: север сверху, восток слева.
 */
function gnomonic(star: SkyStar, ra0: number, dec0: number): SkyPoint {
  const a = star.ra * 15 * RAD;
  const d = star.dec * RAD;
  const cosc =
    Math.sin(dec0) * Math.sin(d) +
    Math.cos(dec0) * Math.cos(d) * Math.cos(a - ra0);

  return {
    x: -(Math.cos(d) * Math.sin(a - ra0)) / cosc,
    y: -(
      Math.cos(dec0) * Math.sin(d) -
      Math.sin(dec0) * Math.cos(d) * Math.cos(a - ra0)
    ) / cosc,
  };
}

/**
 * Проекция фигуры в прямоугольник: возвращает точки в тех же единицах, в каких
 * заданы `width` и `height`.
 */
export function projectFigure(
  stars: SkyStar[],
  { width, height, padding = 0, maxStretch = 1 }: ProjectOptions,
): SkyPoint[] {
  const { ra0, dec0 } = figureCenter(stars);
  const raw = stars.map((star) => gnomonic(star, ra0, dec0));

  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Плоские фигуры (пояс Ориона почти прямая) иначе делили бы на ноль
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const boxWidth = width - padding * 2;
  const boxHeight = height - padding * 2;
  const fitX = boxWidth / spanX;
  const fitY = boxHeight / spanY;
  const honest = Math.min(fitX, fitY);
  const scaleX = Math.min(fitX, honest * maxStretch);
  const scaleY = Math.min(fitY, honest * maxStretch);

  // Центрируем то, что получилось, в отведённом прямоугольнике
  const offsetX = padding + (boxWidth - spanX * scaleX) / 2;
  const offsetY = padding + (boxHeight - spanY * scaleY) / 2;

  return raw.map((p) => ({
    x: round(offsetX + (p.x - minX) * scaleX),
    y: round(offsetY + (p.y - minY) * scaleY),
  }));
}

/**
 * Радиус звезды по её величине: Антарес и Вега обязаны быть заметно крупнее
 * соседей, иначе созвездие читается как россыпь одинаковых точек.
 */
export function starRadius(mag: number, min: number, max: number) {
  const t = Math.min(1, Math.max(0, (4.6 - mag) / 3.6));
  return round(min + t * (max - min));
}
