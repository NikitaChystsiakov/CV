"use client";

/**
 * Что игрок уже открыл за сессию.
 *
 * Хранение в `sessionStorage` — решение из концепта (раздел 8): прогресс не
 * теряется при переходах по маршруту, но второй визит начинается заново.
 *
 * Пока сюда пишут только созвездия. Полная система ачивок делается на этапе Э10
 * и должна читать этот же ключ, а не заводить своё хранилище.
 */

const KEY = "cv-unlocked";

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    // Приватный режим или заблокированное хранилище — молча живём без прогресса
    return [];
  }
}

export function isUnlocked(id: string) {
  return read().includes(id);
}

/** Возвращает true, если открытие случилось только что. */
export function unlock(id: string) {
  const current = read();
  if (current.includes(id)) return false;

  try {
    sessionStorage.setItem(KEY, JSON.stringify([...current, id]));
  } catch {
    return true;
  }

  return true;
}

/**
 * Ачивка мини-игры «Собери интерфейс» (Э9). Пишется тем же `unlock()`, что и
 * созвездия, — отдельного хранилища у игры нет. Id по той же схеме
 * `<источник>:<что>`, что и `constellation:<id>`: Э10 различает ачивки по
 * префиксу. `unlock()` сам отвечает «только что или уже было», поэтому
 * повторный сбор ачивку не дублирует.
 */
export const MINIGAME_ACHIEVEMENT = "minigame:assembled";

/**
 * Вторая ачивка игры: пройдены все три раунда (сбор, адаптив, баги). Она же
 * открывает «Разбор сайта» — команду в палитре и кнопку на верстаке.
 */
export const MINIGAME_MASTER = "minigame:master";

export function unlockedCount() {
  return read().length;
}
