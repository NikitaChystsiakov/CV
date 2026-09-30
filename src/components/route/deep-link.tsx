"use client";

import { useLenis } from "lenis/react";
import { useEffect, useRef } from "react";

import { routeStops } from "@/lib/route";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Приезд по ссылке на остановку (`/#skills`, блок 7).
 *
 * Браузер сам прыгает к якорю ещё до гидрации — у остановок есть `id`, — но
 * ставит её верхним краем под панель, и текст с домом оказываются не по
 * центру. Здесь, когда Lenis готов, остановка аккуратно доезжает до середины
 * экрана. Прыжок до гидрации не отменяем: персонаж встаёт сразу на месте, а
 * не бежит через весь маршрут.
 *
 * Адрес при прокрутке обновляет верхняя панель (`hud.tsx`) — эта часть только
 * про приезд. Со сниженным движением доводка мгновенная.
 */
export function DeepLinkArrival() {
  const lenis = useLenis();
  const reduced = usePrefersReducedMotion();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    // Сырой хэш, без decodeURIComponent: id остановок — латиница, а битая
    // escape-последовательность в чужой ссылке (`/#%`) уронила бы страницу
    const id = window.location.hash.slice(1);
    const stop = id ? routeStops.find((item) => item.id === id) : undefined;
    const target = stop ? document.getElementById(stop.id) : null;
    // Lenis нет при reduced-motion (нативный скролл) — тогда доводит окно само
    if (!target || (!lenis && !reduced)) return;
    done.current = true;

    const box = target.getBoundingClientRect();
    const offset = -Math.max(0, (window.innerHeight - box.height) / 2);
    if (lenis) {
      lenis.scrollTo(target, { offset, duration: 0.9, immediate: reduced });
    } else {
      window.scrollTo(0, window.scrollY + box.top + offset);
    }
  }, [lenis, reduced]);

  return null;
}
