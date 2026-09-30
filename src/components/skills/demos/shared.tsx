"use client";

import { LayoutGroup, motion } from "framer-motion";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

const TABS = [
  { id: "day", label: UI.demoTabDay, note: UI.demoTabDayNote },
  { id: "week", label: UI.demoTabWeek, note: UI.demoTabWeekNote },
  { id: "month", label: UI.demoTabMonth, note: UI.demoTabMonthNote },
];

/**
 * Общий элемент: подсветка вкладки — один узел с `layoutId`. При смене
 * вкладки он не гаснет и не рождается заново, а перелетает на новое место:
 * раскладку framer меряет один раз, сам полёт — `transform`.
 *
 * Клавиатура — по канону ARIA для вкладок: фокус один на весь список
 * (roving tabindex), стрелки двигают выбор, Home и End — к краям.
 */
export function SharedDemo() {
  const say = useSay();
  const reduced = usePrefersReducedMotion();
  const uid = useId();
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    const next = (index + TABS.length) % TABS.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: TABS.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(moves[event.key]);
  }

  const panelId = `${uid}-panel`;

  return (
    <div
      data-demo-state={TABS[active].id}
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4"
    >
      <LayoutGroup id={uid}>
        <div
          role="tablist"
          aria-label={say(UI.demoTabs)}
          onKeyDown={onKeyDown}
          className="demo-well flex rounded-full p-1"
        >
          {TABS.map((tab, index) => {
            const selected = index === active;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${uid}-${tab.id}`}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                data-demo-control={selected ? "" : undefined}
                data-demo-keys="ArrowRight"
                onClick={() => setActive(index)}
                className="relative rounded-full px-3.5 py-1.5 text-sm font-medium outline-offset-2"
              >
                {selected ? (
                  <motion.span
                    layoutId="pill"
                    aria-hidden
                    className="demo-pill absolute inset-0 rounded-full"
                    transition={
                      reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 36 }
                    }
                  />
                ) : null}
                <span className="relative">{say(tab.label)}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${uid}-${TABS[active].id}`}
        className="max-w-[28ch] text-center text-sm text-muted"
      >
        <motion.p
          key={TABS[active].id}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {say(TABS[active].note)}
        </motion.p>
      </div>
    </div>
  );
}
