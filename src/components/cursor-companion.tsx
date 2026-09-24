"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Спутники курсора: четыре огонька летят за мышью с разным отставанием.
 *
 * Так решена просьба «пусть на курсор реагирует что-то отдельное, а не весь фон»:
 * раньше на движение мыши ездили слои декора, и это владельцу не понравилось.
 * Городок теперь стоит на месте, а живёт только этот рой.
 *
 * В светлой теме это пыльца в воздухе, в тёмной — светлячки. Позиция считается
 * через motion values и пружины: перерисовки React на каждое движение мыши
 * съели бы кадры.
 */

const SWARM = [
  { stiffness: 150, damping: 16, size: 9, opacity: 0.9 },
  { stiffness: 90, damping: 18, size: 7, opacity: 0.7 },
  { stiffness: 55, damping: 20, size: 5, opacity: 0.55 },
  { stiffness: 32, damping: 22, size: 4, opacity: 0.4 },
];

export function CursorCompanion() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [awake, setAwake] = useState(false);

  const x = useMotionValue(-200);
  const y = useMotionValue(-200);

  // По одной пружине на огонёк: разная жёсткость и даёт эффект роя
  const x0 = useSpring(x, SWARM[0]);
  const y0 = useSpring(y, SWARM[0]);
  const x1 = useSpring(x, SWARM[1]);
  const y1 = useSpring(y, SWARM[1]);
  const x2 = useSpring(x, SWARM[2]);
  const y2 = useSpring(y, SWARM[2]);
  const x3 = useSpring(x, SWARM[3]);
  const y3 = useSpring(y, SWARM[3]);

  const positions = [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    { x: x3, y: y3 },
  ];

  useEffect(() => {
    if (prefersReducedMotion) return;

    const onMove = (event: PointerEvent) => {
      // Рой только для мыши: на тач-устройствах курсора нет
      if (event.pointerType !== "mouse") return;
      x.set(event.clientX);
      y.set(event.clientY);
      setAwake(true);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [prefersReducedMotion, x, y]);

  if (prefersReducedMotion) return null;

  return (
    <div
      aria-hidden
      data-cursor-swarm
      className="pointer-events-none fixed inset-0 z-[45] hidden overflow-hidden md:block"
      style={{ opacity: awake ? 1 : 0, transition: "opacity 400ms" }}
    >
      {positions.map((position, index) => {
        const spec = SWARM[index];
        return (
          <motion.span
            key={index}
            className="absolute rounded-full"
            style={{
              x: position.x,
              y: position.y,
              width: spec.size,
              height: spec.size,
              marginLeft: -spec.size / 2,
              marginTop: -spec.size / 2,
              opacity: spec.opacity,
              background:
                "radial-gradient(closest-side, var(--color-accent-2), transparent)",
              boxShadow: "0 0 12px 2px color-mix(in oklab, var(--color-accent-2) 45%, transparent)",
            }}
          />
        );
      })}
    </div>
  );
}
