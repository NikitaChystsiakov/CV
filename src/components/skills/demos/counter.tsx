"use client";

import { motion } from "framer-motion";
import { useState, type KeyboardEvent } from "react";

import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const MAX = 9999;
const START = 2048;

/** Клавиши счётчика — по канону ARIA для spinbutton */
const STEPS: Record<string, number> = {
  ArrowUp: 1,
  ArrowDown: -1,
  PageUp: 100,
  PageDown: -100,
};

/**
 * Счётчик-барабан: каждый разряд — лента цифр 0–9, которая едет по
 * вертикали. Сдвиг ленты — в процентах её собственной высоты, поэтому шрифт
 * можно менять, не пересчитывая ничего в коде: цифра всегда ровно 10% ленты.
 *
 * Для скринридера это `spinbutton` с настоящим значением; ленты скрыты.
 */
export function CounterDemo() {
  const say = useSay();
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(START);
  const digits = String(value).padStart(4, "0").split("").map(Number);

  const change = (delta: number) => setValue((current) => (current + delta + MAX + 1) % (MAX + 1));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setValue(event.key === "Home" ? 0 : MAX);
      return;
    }
    const step = STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    change(step);
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={say(UI.demoCounter)}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={MAX}
        data-demo-control
        data-demo-keys="ArrowUp"
        data-demo-state={value}
        onKeyDown={onKeyDown}
        className="flex rounded-lg px-2 font-display text-5xl font-bold tabular-nums leading-none outline-offset-4"
      >
        {digits.map((digit, index) => (
          <span key={index} aria-hidden className="relative block h-[1em] w-[0.72em] overflow-hidden">
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-digit * 10}%` }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
            >
              {DIGITS.map((n) => (
                <span key={n} className="block h-[1em]">
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label={say(UI.demoCounterDown)}
          onClick={() => change(-1)}
          className="demo-chip rounded-full px-3 py-1 font-mono text-xs"
        >
          −1
        </button>
        <button
          type="button"
          aria-label={say(UI.demoCounterUp)}
          data-demo-tap
          onClick={() => change(1)}
          className="demo-chip rounded-full px-3 py-1 font-mono text-xs"
        >
          +1
        </button>
      </div>
    </div>
  );
}
