"use client";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "framer-motion";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/** Диаметр шайбы, px — совпадает с `size-14` */
const PUCK = 56;
/** Шаг с клавиатуры: заметный, но шайба не вылетает за сцену за одно нажатие */
const STEP = 48;
/** Пружина шага: малое затухание — шайба перелетает цель и возвращается */
const SPRING = { type: "spring", stiffness: 380, damping: 12 } as const;

const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Пружина и инерция: шайбу бросают, она катится по инерции и отскакивает от
 * краёв сцены. Положение — две motion value; React перерисовывается только
 * на отпускании (счётчик бросков нужен проверкам, `data-demo-state`).
 */
export function SpringDemo() {
  const say = useSay();
  const reduced = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [moves, setMoves] = useState(0);
  const running = useRef<AnimationPlaybackControls[]>([]);

  useEffect(
    () => () => {
      running.current.forEach((item) => item.stop());
    },
    [],
  );

  function moveTo(toX: number, toY: number) {
    running.current.forEach((item) => item.stop());
    if (reduced) {
      // Статичный режим: шайба встаёт на место без полёта
      x.set(toX);
      y.set(toY);
      running.current = [];
    } else {
      running.current = [animate(x, toX, SPRING), animate(y, toY, SPRING)];
    }
    setMoves((count) => count + 1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      moveTo(0, 0);
      return;
    }
    const direction = KEYS[event.key];
    const stage = stageRef.current;
    if (!direction || !stage) return;
    event.preventDefault();
    const limitX = (stage.clientWidth - PUCK) / 2;
    const limitY = (stage.clientHeight - PUCK) / 2;
    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    moveTo(
      clamp(x.get() + direction[0] * STEP, limitX),
      clamp(y.get() + direction[1] * STEP, limitY),
    );
  }

  return (
    <div ref={stageRef} data-demo-state={moves} className="demo-dots absolute inset-3 rounded-lg">
      <motion.button
        type="button"
        aria-label={say(UI.demoPuck)}
        data-demo-control
        data-demo-keys="ArrowRight"
        // В статичном режиме бросать нечего: инерция — это и есть движение
        drag={!reduced}
        dragConstraints={stageRef}
        dragElastic={0.18}
        dragTransition={{ power: 0.35, timeConstant: 260, bounceStiffness: 420, bounceDamping: 16 }}
        onDragEnd={() => setMoves((count) => count + 1)}
        onKeyDown={onKeyDown}
        whileTap={reduced ? undefined : { scale: 0.92 }}
        style={{ x, y }}
        className="demo-puck absolute left-1/2 top-1/2 -ml-7 -mt-7 size-14 cursor-grab touch-none rounded-full active:cursor-grabbing"
      />
    </div>
  );
}
