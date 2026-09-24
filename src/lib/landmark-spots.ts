import { routeStops } from "@/lib/route";

/**
 * Где стоят детали-площадки и какие зоны вокруг них заняты.
 *
 * Модуль общий, потому что зоны нужны нескольким слоям сразу: самим площадкам
 * и декору. Пока декор их не знал, забор проезжал сквозь площадку.
 *
 * Смещения выбраны так, чтобы площадки стояли в промежутках между остановками:
 * на уровне текста они налезали на блок с заголовком дома.
 *
 * Координата `left` — базовые пиксели городка от осевой линии маршрута, как у
 * всей карты (`src/lib/town.ts`): минус — сторона текста, плюс — сторона дома.
 * −550 это 25 клеток по 22px влево. Числом, а не клеткой из town.ts, чтобы не
 * заводить круговой импорт: town.ts читает зоны отсюда.
 *
 * Сейчас в раскладке только шахматы. Волейбольная площадка снята: корт,
 * нарисованный тонким SVG-контуром, стоял рядом с ассетами владельца как
 * чужеродная графика («вообще не нравится»). Она вернётся, когда придёт ассет
 * корта — концепция и промпт в docs/нужны-ассеты.md, мяч с тенью для
 * анимации поверх ассета ждёт в landmarks.tsx. Позиция под неё была:
 * `{ kind: "volleyball", stopId: "about", offset: 0.92, left: 570 }`.
 */
export const LANDMARKS = [
  { kind: "chess" as const, stopId: "experience", offset: 0.95, left: -550 },
];

export type LandmarkKind = (typeof LANDMARKS)[number]["kind"];

/** Доля высоты маршрута, на которой стоит остановка. */
export function stopTop(stopId: string, offset: number) {
  const index = routeStops.findIndex((stop) => stop.id === stopId);
  return ((index + offset) / routeStops.length) * 100;
}

const ZONES = LANDMARKS.map((landmark) => ({
  top: stopTop(landmark.stopId, landmark.offset),
  left: landmark.left,
}));

/**
 * Занято ли место площадкой. Радиус задаётся вызывающим слоем: у мелкого декора
 * он один, у крупных объектов — больше. `top` — доля высоты всего маршрута,
 * `left` — базовые пиксели городка от осевой линии.
 */
export function insideKeepOut(
  top: number,
  left: number,
  radius = { top: 3.2, left: 260 },
) {
  return ZONES.some(
    (zone) =>
      Math.abs(zone.top - top) < radius.top &&
      Math.abs(zone.left - left) < radius.left,
  );
}
