"use client";

import { useLenis } from "lenis/react";
import { useEffect } from "react";

/**
 * Замок скролла на время, пока комната открыта.
 *
 * Скроллом страницы рулит Lenis (`SmoothScroll`), и одного `overflow` на body
 * не хватает: колесо и тач Lenis обрабатывает сам, на своих слушателях окна.
 * Поэтому замок двойной:
 *
 * 1. `lenis.stop()` — Lenis начинает гасить колесо и тач своим preventDefault
 *    (см. `onVirtualScroll` в lenis: ветка `isStopped` отменяет событие).
 * 2. `overflow: clip` на `<html>` — на случай клавиатуры и того, что при
 *    `prefers-reduced-motion` инстанса Lenis нет вовсе (провайдер отдаёт
 *    нативный скролл). Именно `clip`, а не `hidden`: так это делает сам Lenis
 *    в режиме `autoToggle`, и позиция прокрутки при этом остаётся на месте.
 *
 * Позиция всё равно запоминается и восстанавливается перед `start()`: Lenis на
 * старте делает `reset()` и берёт текущее положение окна за своё, так что
 * порядок здесь важен — сначала вернуть окно, потом отпускать Lenis.
 */
export function useScrollLock() {
  const lenis = useLenis();

  useEffect(() => {
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const previousOverflow = root.style.overflow;

    lenis?.stop();
    root.style.overflow = "clip";

    return () => {
      root.style.overflow = previousOverflow;
      if (Math.abs(window.scrollY - scrollY) > 1) {
        window.scrollTo(0, scrollY);
      }
      lenis?.start();
    };
  }, [lenis]);
}
