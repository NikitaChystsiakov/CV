"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";

import { UI } from "@/lib/content";
import { ROUTE_FIGURES } from "@/lib/constellations";
import { dashes, type Localized } from "@/lib/i18n";
import { routeStops } from "@/lib/route";
import {
  MINIGAME_ACHIEVEMENT,
  MINIGAME_MASTER,
  useUnlocked,
  VOLLEYBALL_ACHIEVEMENT,
  XRAY_ACHIEVEMENT,
} from "@/lib/unlocked";
import { useLang } from "@/lib/use-lang";

/**
 * Панель ачивок в верхней панели (блок 7).
 *
 * Игровые находки на маршруте разрознены: созвездия ночью, мини-игра,
 * волейбол у дороги, «Разбор сайта» наградой. Счётчик в панели связывает их в
 * одну цель и подсказывает, что искать есть что, — без текста на экране:
 * подсказки, как открыть недостающее, живут под кликом.
 *
 * Источник один — `sessionStorage` через `useUnlocked` (unlocked.ts): панель
 * ничего не хранит сама, а открытие где угодно на странице сразу отражается в
 * счётчике.
 */

const FIGURES = ROUTE_FIGURES.slice(0, routeStops.length).map((figure) => `constellation:${figure.id}`);

type Item = { id: string; title: Localized; hint: Localized; done: (open: string[]) => number; of: number };

const ITEMS: Item[] = [
  {
    id: "constellations",
    title: UI.achConstellations,
    hint: UI.achConstellationsHint,
    done: (open) => FIGURES.filter((id) => open.includes(id)).length,
    of: FIGURES.length,
  },
  {
    id: "minigame",
    title: UI.achMinigame,
    hint: UI.achMinigameHint,
    done: (open) => (open.includes(MINIGAME_ACHIEVEMENT) ? 1 : 0),
    of: 1,
  },
  {
    id: "master",
    title: UI.achMaster,
    hint: UI.achMasterHint,
    done: (open) => (open.includes(MINIGAME_MASTER) ? 1 : 0),
    of: 1,
  },
  {
    id: "xray",
    title: UI.achXray,
    hint: UI.achXrayHint,
    done: (open) => (open.includes(XRAY_ACHIEVEMENT) ? 1 : 0),
    of: 1,
  },
  {
    id: "volleyball",
    title: UI.achVolleyball,
    hint: UI.achVolleyballHint,
    done: (open) => (open.includes(VOLLEYBALL_ACHIEVEMENT) ? 1 : 0),
    of: 1,
  },
];

const TOTAL = ITEMS.reduce((sum, item) => sum + item.of, 0);

export function Achievements({ className }: { className: string }) {
  const { lang } = useLang();
  const unlocked = useUnlocked();
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const got = ITEMS.reduce((sum, item) => sum + item.done(unlocked), 0);

  // Закрытие — по Escape (фокус на кнопку) и по клику мимо, как у площадок
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (holder.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const say = (text: Localized) => dashes(text[lang], lang);

  return (
    <div ref={holder} data-achievements className="relative">
      <button
        ref={trigger}
        type="button"
        data-achievements-trigger
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${UI.achTitle[lang]}: ${got} / ${TOTAL}`}
        onClick={() => setOpen((value) => !value)}
        className={className}
      >
        {/* Прогресс — кольцом, а не цифрами: в верхней панели номеров нет
            (правило проекта), число — в подписи для диктора и в самой панели.
            Звезда внутри — значок интерфейса, как лупа у палитры */}
        <svg aria-hidden viewBox="0 0 20 20" className="size-5 -rotate-90">
          <circle cx="10" cy="10" r="8.5" fill="none" stroke="var(--color-line)" strokeWidth="1.5" />
          <circle
            cx="10"
            cy="10"
            r="8.5"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${(got / TOTAL).toFixed(3)} 1`}
            className={got === 0 ? "opacity-0" : ""}
          />
          <path
            d="M10 5.2l1.4 2.9 3.2.4-2.4 2.2.7 3.2L10 12.3l-2.9 1.6.7-3.2-2.4-2.2 3.2-.4z"
            transform="rotate(90 10 10)"
            fill={got > 0 ? "var(--color-accent)" : "none"}
            stroke={got > 0 ? "var(--color-accent)" : "currentColor"}
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
        <span data-achievements-count={got} hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={panelId}
            data-achievements-panel
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-line bg-surface p-3 text-ink shadow-lg shadow-ink/5"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{UI.achTitle[lang]}</p>
            <ul className="mt-2 space-y-2.5">
              {ITEMS.map((item) => {
                const done = item.done(unlocked);
                const full = done === item.of;
                return (
                  <li key={item.id} data-achievement={item.id} data-done={full ? "" : undefined} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${full ? "bg-accent" : "border border-line"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-3 text-sm font-medium">
                        <span>{say(item.title)}</span>
                        <span className="font-mono text-xs tabular-nums text-muted">
                          {done}/{item.of}
                        </span>
                      </p>
                      {!full ? <p className="mt-0.5 text-xs text-muted">{say(item.hint)}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
