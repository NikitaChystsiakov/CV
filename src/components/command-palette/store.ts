"use client";

import { useSyncExternalStore } from "react";

/**
 * Открыта ли палитра — одно состояние на всю страницу.
 *
 * Палитру открывают из двух мест: горячая клавиша (слушатель в
 * `CommandPalette`) и кнопка в панели (`CommandPaletteTrigger`). Кнопка и
 * палитра живут в разных ветках дерева, поэтому состояние вынесено во внешний
 * модуль и читается через `useSyncExternalStore` — как язык в `use-lang.ts`.
 * Контекст-провайдер ради одного булева флага был бы лишним слоем в layout.
 *
 * Вместе с флагом хранится, куда вернуть фокус после закрытия. Запоминается
 * он в момент открытия, а не берётся из `document.activeElement` при закрытии:
 * к тому времени фокус уже стоит в поле палитры.
 */

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

/**
 * Открыть палитру.
 *
 * `from` — элемент, на который вернётся фокус. Кнопка передаёт себя явно:
 * Safari не ставит фокус на кнопку по клику, и `activeElement` там — `body`.
 */
export function openPalette(from?: HTMLElement | null) {
  if (open) return;
  const active = document.activeElement;
  returnFocusTo = from ?? (active instanceof HTMLElement && active !== document.body ? active : null);
  open = true;
  emit();
}

export function closePalette() {
  if (!open) return;
  open = false;
  emit();
}

export function togglePalette(from?: HTMLElement | null) {
  if (open) closePalette();
  else openPalette(from);
}

/**
 * Куда вернуть фокус при закрытии. Читается без изъятия: в dev StrictMode
 * прогоняет размонтирование эффекта понарошку, и «забранный» при этом элемент
 * к настоящему закрытию уже пропадал. Перезаписывается при следующем открытии.
 */
export function returnFocusTarget() {
  // Элемент мог исчезнуть из DOM, пока палитра была открыта
  return returnFocusTo?.isConnected ? returnFocusTo : null;
}

export function usePaletteOpen() {
  // На сервере палитра всегда закрыта: разметка сервера и клиента совпадает
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
