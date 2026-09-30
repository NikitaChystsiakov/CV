"use client";

import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef, type RefObject } from "react";

import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Строки списка — имена API, на которых демо и собрано. Это код, а не текст
 * интерфейса, поэтому они одинаковые на обоих языках.
 */
const ROWS = [
  "useScroll",
  "container",
  "scrollYProgress",
  "useTransform",
  "useSpring",
  "MotionValue",
  "transform",
  "opacity",
  "offset",
  "target",
  "willChange",
  "requestAnimationFrame",
];

/**
 * Анимация от скролла внутри плитки. Прокрутка у плитки своя, и правило
 * проекта действует и здесь: прогресс — motion value из `useScroll`, его
 * читают полоса и строки, а не слушатель `scroll` с состоянием на кадр.
 */
export function ScrollLinkedDemo() {
  const say = useSay();
  const reduced = usePrefersReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: listRef });
  const smooth = useSpring(scrollYProgress, { stiffness: 300, damping: 40, restDelta: 0.001 });

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Полоса прогресса — проба для проверок: её transform и есть состояние */}
      <motion.div
        aria-hidden
        data-demo-probe
        className="h-1 origin-left bg-accent"
        style={{ scaleX: reduced ? scrollYProgress : smooth }}
      />
      <div
        ref={listRef}
        tabIndex={0}
        role="region"
        aria-label={say(UI.demoScrollList)}
        data-demo-control
        data-demo-keys="PageDown"
        data-lenis-prevent
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 outline-offset-[-3px]"
      >
        <ul className="space-y-2 pb-16">
          {ROWS.map((name) => (
            <Row key={name} name={name} container={listRef} still={reduced} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Строка въезжает, пока поднимается от нижнего края контейнера к середине.
 * Свой `useScroll` с `target`: прогресс считается от положения строки, а не
 * от всего списка — так каждая строка живёт своей кривой.
 */
function Row({
  name,
  container,
  still,
}: {
  name: string;
  container: RefObject<HTMLDivElement | null>;
  still: boolean;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({
    container,
    target: rowRef,
    offset: ["start end", "center center"],
  });
  const opacity = useTransform(scrollYProgress, [0, 1], [0.25, 1]);
  const x = useTransform(scrollYProgress, [0, 1], [28, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);

  return (
    <motion.li
      ref={rowRef}
      style={still ? undefined : { opacity, x, scale }}
      className="demo-row origin-left rounded-md px-3 py-2 font-mono text-xs"
    >
      {name}
    </motion.li>
  );
}
