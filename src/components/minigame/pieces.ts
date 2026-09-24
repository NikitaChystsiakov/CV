/**
 * Детали мини-игры «Собери интерфейс» и их места (раздел 6 концепта).
 *
 * Ровно четыре блока и четыре слота, свободного холста нет. Каждый слот
 * принимает только свой блок, и подсказка к нему — форма: широкая полоса
 * сверху может быть только навбаром, круглая плашка — только кнопкой. Поэтому
 * над слотами нет подписей: игра читается глазами, а для скринридера у слота
 * есть `aria-label` с описанием формы.
 *
 * Все размеры — в базовых единицах `--mg-u` (globals.css, `.minigame-board`):
 * одно число масштабирует и лоток, и макет, поэтому блок из лотка встаёт в
 * слот ровно по размеру на любой ширине, а при смене ширины ничто не
 * разъезжается. Лоток и макет одного размера, 240×140 внутри рамки 260×160.
 */

import type { Localized } from "@/lib/i18n";
import { UI } from "@/lib/content";

export type PieceId = "nav" | "card" | "input" | "button";

export type Rect = { x: number; y: number; w: number; h: number };

export type Piece = {
  id: PieceId;
  /** Имя блока — для объявлений и `aria-label` */
  name: Localized;
  /** Описание слота для скринридера: какую форму он ждёт */
  slotLabel: Localized;
  /** Где блок лежит в лотке, базовые единицы */
  tray: Rect;
  /** Где его место в макете, базовые единицы */
  slot: Rect;
  /** Где его место в макете телефона (второй раунд), базовые единицы */
  phone: Rect;
  /** Скругление — часть подсказки формой: у кнопки пилюля, у поля угол */
  radius: string;
};

/** Внутреннее поле лотка и макета. */
export const BOARD_W = 240;
export const BOARD_H = 140;
export const BOARD_PAD = 10;

/**
 * Порядок в массиве — порядок обхода табом. В лотке блоки перемешаны
 * относительно макета: навбар лежит внизу, кнопка — наверху, карточка справа.
 */
export const PIECES: Piece[] = [
  {
    id: "button",
    name: UI.mgButton,
    slotLabel: UI.mgSlotButton,
    tray: { x: 0, y: 0, w: 80, h: 32 },
    slot: { x: 138, y: 82, w: 80, h: 32 },
    phone: { x: 78, y: 110, w: 84, h: 22 },
    radius: "rounded-full",
  },
  {
    id: "card",
    name: UI.mgCard,
    slotLabel: UI.mgSlotCard,
    tray: { x: 112, y: 0, w: 128, h: 100 },
    slot: { x: 0, y: 40, w: 128, h: 100 },
    phone: { x: 78, y: 28, w: 84, h: 56 },
    radius: "rounded-lg",
  },
  {
    id: "input",
    name: UI.mgInput,
    slotLabel: UI.mgSlotInput,
    tray: { x: 0, y: 68, w: 102, h: 32 },
    slot: { x: 138, y: 40, w: 102, h: 32 },
    phone: { x: 78, y: 88, w: 84, h: 18 },
    radius: "rounded-md",
  },
  {
    id: "nav",
    name: UI.mgNav,
    slotLabel: UI.mgSlotNav,
    tray: { x: 0, y: 110, w: 240, h: 30 },
    slot: { x: 0, y: 0, w: 240, h: 30 },
    phone: { x: 78, y: 6, w: 84, h: 18 },
    radius: "rounded-lg",
  },
];

/**
 * Второй раунд — адаптив: те же четыре блока, но макет — телефон посреди
 * доски. Рамка телефона и места внутри неё в тех же единицах, что и доска, —
 * доска не меняет размера, и остановка не прыгает по высоте. Места идут одной
 * колонкой во всю ширину экрана телефона, поэтому подсказка формой теперь —
 * высота и скругление: у кнопки пилюля, у поля угол.
 */
export const PHONE_FRAME: Rect = { x: 72, y: 0, w: 96, h: 140 };

export type Level = 0 | 1 | 2;

/** Место блока в макете раунда. Третий раунд собран по первому. */
export function slotOf(piece: Piece, level: Level): Rect {
  return level === 1 ? piece.phone : piece.slot;
}

/**
 * Третий раунд — «найди баг»: слева эталонный макет, справа вёрстка, в
 * которой три блока свёрстаны с ошибкой. Каждая ошибка — то, что видно
 * глазом при сравнении, а не в коде: съехавший блок, текст не влез,
 * не то скругление. Навбар свёрстан верно — это ложная цель.
 */
export type BugId = Exclude<PieceId, "nav">;

export const BUGS: Record<BugId, { rect: Rect; radius: string; name: Localized }> = {
  // Карточка съехала вправо и почти упёрлась в поле
  card: { rect: { x: 8, y: 40, w: 128, h: 100 }, radius: "rounded-lg", name: UI.mgBugCard },
  // Кнопка уже своего текста: подпись не влезает
  button: { rect: { x: 138, y: 82, w: 36, h: 32 }, radius: "rounded-full", name: UI.mgBugButton },
  // У поля скругление кнопки
  input: { rect: { x: 138, y: 40, w: 102, h: 32 }, radius: "rounded-full", name: UI.mgBugInput },
};

export const isBug = (id: PieceId): id is BugId => id in BUGS;

/** Длина в базовых единицах игры — для inline-стилей. */
export function mg(units: number) {
  return `calc(${units} * var(--mg-u))`;
}
