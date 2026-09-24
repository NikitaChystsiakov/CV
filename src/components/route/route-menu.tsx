"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useLenis } from "lenis/react";
import { useEffect, useRef, useState } from "react";

import { UI } from "@/lib/content";
import { useLang } from "@/lib/use-lang";
import { routeStops } from "@/lib/route";

/**
 * Быстрый путь для узких экранов.
 *
 * Карта-созвездие сбоку требует свободного поля справа и включается только с
 * 1280px (см. route-map.tsx). Ниже этой ширины тот же быстрый путь даётся
 * свёрнутым списком в верхней панели: нанимающий человек должен добираться до
 * кейсов за один клик на любом экране, а не за девять экранов скролла.
 *
 * Список свёрнут по умолчанию — развёрнутый он закрывал бы контент, а это
 * прямо запрещено критериями этапа.
 */
export function RouteMenu({ activeIndex }: { activeIndex: number }) {
  const { lang } = useLang();
  const lenis = useLenis();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="relative xl:hidden">
      <button
        ref={triggerRef}
        type="button"
        data-route-menu-trigger
        aria-expanded={open}
        aria-controls="route-menu"
        aria-label={open ? UI.routeMenuClose[lang] : UI.routeMenuOpen[lang]}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface/80 px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink backdrop-blur transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden className="grid gap-[3px]">
          <span className="block h-px w-3.5 bg-current" />
          <span className="block h-px w-3.5 bg-current" />
          <span className="block h-px w-3.5 bg-current" />
        </span>
        <span className="hidden sm:inline">{UI.routeMenu[lang]}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id="route-menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            // Панель прижата к краю экрана, а не к кнопке: кнопка стоит в
            // середине правой группы, и от неё панель уезжала за левый край.
            // Ширина ограничена вьюпортом — иначе на 390px появлялась бы
            // горизонтальная прокрутка. Фон непрозрачный: сквозь полупрозрачный
            // читался текст маршрута под меню.
            className="fixed right-5 top-16 z-50 max-h-[60svh] w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-lg shadow-ink/10 sm:right-8"
          >
            <ul>
              {routeStops.map((stop, index) => {
                const isActive = index === activeIndex;

                return (
                  <li key={stop.id}>
                    <button
                      type="button"
                      data-route-menu-item={stop.id}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => {
                        lenis?.scrollTo(`#${stop.id}`);
                        setOpen(false);
                      }}
                      className={`flex w-full items-baseline gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-stone/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                        isActive ? "text-accent" : "text-ink"
                      }`}
                    >
                      <span className="font-mono text-[11px] text-muted">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm text-pretty">{stop.title[lang]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
