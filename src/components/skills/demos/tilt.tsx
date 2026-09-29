"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

const SPRING = { stiffness: 220, damping: 18 };

/** Клавиша → куда «смотрит» указатель, доли карточки от центра */
const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-0.45, 0],
  ArrowRight: [0.45, 0],
  ArrowUp: [0, -0.45],
  ArrowDown: [0, 0.45],
};

/**
 * 3D-наклон за указателем. Указатель пишет две motion value (доли карточки
 * от центра), пружина сглаживает их в поворот, блик едет следом тем же
 * `transform`. Прямоугольник карточки меряется один раз на входе указателя,
 * а не на каждом движении.
 *
 * При «меньше движения» карточка не поворачивается вовсе: поворот за рукой —
 * ровно то движение, от которого человек отказался в настройках.
 */
export function TiltDemo() {
  const say = useSay();
  const reduced = usePrefersReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [10, -10]), SPRING);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-12, 12]), SPRING);
  const glareX = useTransform(px, [-0.5, 0.5], ["-35%", "35%"]);
  const glareY = useTransform(py, [-0.5, 0.5], ["-35%", "35%"]);
  const glare = useSpring(0, SPRING);
  const box = useRef<DOMRect | null>(null);
  const [aim, setAim] = useState("rest");

  function point(x: number, y: number) {
    px.set(x);
    py.set(y);
    glare.set(1);
  }

  function rest() {
    px.set(0);
    py.set(0);
    glare.set(0);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reduced) return;
    box.current ??= event.currentTarget.getBoundingClientRect();
    const rect = box.current;
    point((event.clientX - rect.left) / rect.width - 0.5, (event.clientY - rect.top) / rect.height - 0.5);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      rest();
      setAim("rest");
      return;
    }
    const target = KEYS[event.key];
    if (!target) return;
    event.preventDefault();
    if (!reduced) point(target[0], target[1]);
    setAim(event.key);
  }

  return (
    <div className="absolute inset-0 grid place-items-center [perspective:600px]">
      <motion.div
        tabIndex={0}
        role="group"
        aria-label={say(UI.demoTilt)}
        data-demo-control
        data-demo-keys="ArrowRight"
        data-demo-state={aim}
        data-demo-probe
        onPointerEnter={(event) => {
          box.current = event.currentTarget.getBoundingClientRect();
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          box.current = null;
          rest();
        }}
        onBlur={() => {
          rest();
          setAim("rest");
        }}
        onKeyDown={onKeyDown}
        style={reduced ? undefined : { rotateX, rotateY }}
        className="demo-card relative flex h-28 w-44 touch-none select-none flex-col justify-end overflow-hidden rounded-2xl p-4 outline-offset-4"
      >
        {/* Блик: мягкое пятно, которое едет за указателем. Только transform
            и opacity — фон пятна неподвижен относительно самого пятна */}
        <motion.span
          aria-hidden
          className="demo-glare pointer-events-none absolute -inset-1/2"
          style={reduced ? { opacity: 0 } : { x: glareX, y: glareY, opacity: glare }}
        />
        <span className="relative font-display text-base font-bold">{say(UI.demoTiltFace)}</span>
        <span aria-hidden className="relative mt-1 font-mono text-[11px] text-muted">
          perspective: 600px
        </span>
      </motion.div>
    </div>
  );
}
