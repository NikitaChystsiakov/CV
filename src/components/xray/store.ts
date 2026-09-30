"use client";

import { useSyncExternalStore } from "react";

/**
 * Открыт ли «Разбор сайта» — одно состояние на всю страницу, по образцу
 * палитры (`command-palette/store.ts`).
 *
 * Открывают разбор из двух мест: команда палитры ⌘K и кнопка в финале
 * мини-игры. Сам слой смонтирован в layout, поэтому флаг живёт во внешнем
 * модуле и читается через `useSyncExternalStore`.
 *
 * Вместе с флагом хранится, куда вернуть фокус: запоминается в момент
 * открытия, потому что к закрытию фокус уже стоит внутри разбора.
 */

/**
 * С какой ширины разбор ОТКРЫВАЕТСЯ — команда палитры и кнопка в финале
 * мини-игры. Сам разбор работает на любой ширине: от 768 — объёмный, уже —
 * плоским списком слоёв с превью, и если открытый разбор сузили или повернули
 * планшет, он перестраивается, а не закрывается. Входы ниже 1024 закрыты
 * проверками «Разбор» и Э9; открыть их — решение владельца (отчёт Блока 5).
 */
export const XRAY_MEDIA = "(min-width: 1024px)";

let open = false;
let returnFocusTo: HTMLElement | null = null;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Можно ли открыть разбор прямо сейчас: ширина экрана и ничего модального поверх. */
export function canOpenXray() {
  if (typeof window === "undefined") return false;
  if (!window.matchMedia(XRAY_MEDIA).matches) return false;
  // Комната дома и палитра держат свои фокус-ловушки: две ловушки сразу
  // перетягивали бы фокус друг у друга
  return !document.querySelector("[data-room], [data-palette]");
}

/**
 * Открыть разбор. `from` — элемент, на который вернётся фокус после
 * закрытия; кнопка передаёт себя явно, потому что Safari не ставит фокус на
 * кнопку по клику.
 */
export function openXray(from?: HTMLElement | null) {
  if (open || !canOpenXray()) return;
  const active = document.activeElement;
  returnFocusTo = from ?? (active instanceof HTMLElement && active !== document.body ? active : null);
  open = true;
  emit();
}

export function closeXray() {
  if (!open) return;
  open = false;
  emit();
}

/** Куда вернуть фокус. Читается без изъятия — как в палитре, из-за StrictMode. */
export function xrayReturnFocusTarget() {
  return returnFocusTo?.isConnected ? returnFocusTo : null;
}

export function useXrayOpen() {
  // На сервере разбор всегда закрыт: разметка сервера и клиента совпадает
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
