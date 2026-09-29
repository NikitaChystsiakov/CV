"use client";

import { motion } from "framer-motion";
import { useState } from "react";

import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Три штриха «меню» и их положение в «крестике». Не интерполяция атрибута
 * `d`: тот пересчитывает геометрию пути на каждом кадре, а поворот и сдвиг
 * штриха — чистый `transform`, как требует правило проекта.
 */
const BARS = {
  menu: [
    { y: 0, rotate: 0, opacity: 1, scaleX: 1 },
    { y: 0, rotate: 0, opacity: 1, scaleX: 1 },
    { y: 0, rotate: 0, opacity: 1, scaleX: 1 },
  ],
  close: [
    { y: 6, rotate: 45, opacity: 1, scaleX: 1 },
    { y: 0, rotate: 0, opacity: 0, scaleX: 0 },
    { y: -6, rotate: -45, opacity: 1, scaleX: 1 },
  ],
};

const LINES = [6, 12, 18];

export function MorphDemo() {
  const say = useSay();
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const shape = open ? BARS.close : BARS.menu;
  const transition = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 26 };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <button
        type="button"
        aria-pressed={open}
        aria-label={say(UI.demoMorph)}
        data-demo-control
        data-demo-keys="Enter"
        data-demo-state={open ? "close" : "menu"}
        onClick={() => setOpen((value) => !value)}
        className="demo-well grid size-20 place-items-center rounded-2xl transition-colors hover:text-accent"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {LINES.map((lineY, index) => (
            <motion.line
              key={lineY}
              x1="4"
              x2="20"
              y1={lineY}
              y2={lineY}
              initial={false}
              animate={shape[index]}
              transition={transition}
              style={{ originX: "50%", originY: "50%" }}
            />
          ))}
        </svg>
      </button>
      <p aria-hidden className="font-mono text-xs text-muted">
        {open ? say(UI.demoMorphClose) : say(UI.demoMorphMenu)}
      </p>
    </div>
  );
}
