"use client";

/**
 * Что игрок уже открыл за сессию.
 *
 * Хранение в `sessionStorage` — решение из концепта (раздел 8): прогресс не
 * теряется при переходах по маршруту, но второй визит начинается заново.
 *
 * Пишут сюда созвездия, мини-игра, волейбол и «Разбор сайта». Панель ачивок в
 * верхней панели (`achievements.tsx`) читает этот же ключ через `useUnlocked`:
 * открытие шлёт событие, и счётчик обновляется сразу, без перезагрузки.
 */

import { useSyncExternalStore } from "react";

const KEY = "cv-unlocked";
/** Событие «что-то открыли» — на нём живёт `useUnlocked` */
const EVENT = "cv-unlocked";

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

  window.dispatchEvent(new Event(EVENT));
  return true;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** Сырая строка хранилища: снимок для useSyncExternalStore обязан быть стабильным. */
function snapshot() {
  try {
    return sessionStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/**
 * Список открытого за сессию — реактивно. На сервере пусто: разметка сервера
 * и клиента совпадает, а счётчик доезжает на клиенте.
 */
export function useUnlocked(): string[] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
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

/**
 * Ачивка волейбола (Б6): три розыгрыша подряд на площадке у дороги. Та же
 * схема `<источник>:<что>`; победа открывает подпись трофея «Волейбол» из
 * trophies.ts. Повторная победа ачивку не дублирует — это решает `unlock()`.
 */
export const VOLLEYBALL_ACHIEVEMENT = "volleyball:three-in-a-row";

/** «Разбор сайта» открыт хотя бы раз — из мини-игры или из ⌘K. */
export const XRAY_ACHIEVEMENT = "xray:opened";

export function unlockedCount() {
  return read().length;
}
