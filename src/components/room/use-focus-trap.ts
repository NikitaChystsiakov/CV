"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableInside(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // Скрытые и свёрнутые элементы в кольцо не берём: таб на них не встаёт
    (node) => node.offsetWidth > 0 || node.offsetHeight > 0 || node === document.activeElement,
  );
}

/**
 * Фокус-ловушка модальной комнаты.
 *
 * Пока комната открыта, таб не должен уходить на маршрут за её пределами: там
 * лежит вся страница, и уехавший фокус превращает комнату в декорацию.
 * Ловушка тройная — так она держит и обычный таб, и клик мимо, и возврат из
 * панели браузера:
 *
 * - `keydown` на Tab заворачивает кольцо с последнего элемента на первый;
 * - `focusin` ловит фокус, оказавшийся снаружи, и возвращает его внутрь;
 * - при открытии фокус уходит на сам диалог (`tabIndex={-1}`), чтобы
 *   скринридер прочитал его имя, а первый таб попал на кнопку закрытия.
 *
 * Возврат фокуса на дом-триггер делает родитель: он знает, откуда открыли.
 */
export function useFocusTrap(dialogRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const items = focusableInside(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (target && dialog.contains(target)) return;
      dialog.focus({ preventScroll: true });
    };

    dialog.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [dialogRef]);
}
