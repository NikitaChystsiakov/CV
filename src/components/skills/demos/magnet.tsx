"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/** Радиус притяжения от центра кнопки, px */
const RADIUS = 120;
/** Какую долю расстояния до указателя кнопка проходит навстречу */
const PULL = 0.35;
/** Сдвиг с клавиатуры и сколько он держится, прежде чем пружина вернёт кнопку */
const NUDGE = 22;
const NUDGE_MS = 650;
const SPRING = { stiffness: 260, damping: 16 };

const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Магнитная кнопка: в радиусе притяжения она тянется к указателю, подпись —
 * ещё чуть сильнее, это даёт глубину. Слушает указатель вся сцена плитки, а
 * не кнопка: магнит начинает тянуть раньше, чем указатель её коснулся.
 * Центр кнопки меряется на входе указателя в сцену, не на каждом движении.
 */
export function MagnetDemo() {
  const say = useSay();
  const reduced = usePrefersReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const center = useRef<{ x: number; y: number } | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING);
  const springY = useSpring(y, SPRING);
  const labelX = useTransform(springX, (value) => value * 0.4);
  const labelY = useTransform(springY, (value) => value * 0.4);
  const [nudges, setNudges] = useState(0);
  const [presses, setPresses] = useState(0);
  const release = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(release.current), []);

  function measure() {
    const button = buttonRef.current;
    if (!button) return null;
    // Центр — без текущего сдвига: иначе магнит тянул бы к уже сдвинутой кнопке
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - x.get(), y: rect.top + rect.height / 2 - y.get() };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reduced) return;
    center.current ??= measure();
    const origin = center.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const near = Math.hypot(dx, dy) < RADIUS;
    x.set(near ? dx * PULL : 0);
    y.set(near ? dy * PULL : 0);
  }

  function onPointerLeave() {
    center.current = null;
    x.set(0);
    y.set(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const direction = KEYS[event.key];
    if (!direction) return;
    event.preventDefault();
    setNudges((count) => count + 1);
    if (reduced) return;
    x.set(direction[0] * NUDGE);
    y.set(direction[1] * NUDGE);
    window.clearTimeout(release.current);
    release.current = window.setTimeout(() => {
      x.set(0);
      y.set(0);
    }, NUDGE_MS);
  }

  return (
    <div
      data-demo-state={`${nudges}:${presses}`}
      onPointerEnter={() => {
        center.current = measure();
      }}
      onPointerMove={onPointerMove}
      // Лист панели прокрутили колесом, пока указатель над плиткой, — центр
      // кнопки уехал вместе с листом, замер устарел
      onWheel={() => {
        center.current = null;
      }}
      onPointerLeave={onPointerLeave}
      className="absolute inset-0 grid place-items-center"
    >
      <motion.button
        ref={buttonRef}
        type="button"
        aria-label={say(UI.demoMagnetLabel)}
        data-demo-control
        data-demo-keys="ArrowRight"
        onKeyDown={onKeyDown}
        onBlur={() => {
          x.set(0);
          y.set(0);
        }}
        onClick={() => setPresses((count) => count + 1)}
        style={reduced ? undefined : { x: springX, y: springY }}
        className="demo-magnet relative touch-none rounded-full px-6 py-3 text-sm font-semibold"
      >
        {/* Круг от нажатия: гаснет и растёт, только opacity и scale */}
        <AnimatePresence>
          {presses > 0 && !reduced ? (
            <motion.span
              key={presses}
              aria-hidden
              className="demo-ring pointer-events-none absolute inset-0 rounded-full"
              initial={{ opacity: 0.7, scale: 1 }}
              animate={{ opacity: 0, scale: 1.7 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          ) : null}
        </AnimatePresence>
        <motion.span
          className="relative block"
          style={reduced ? undefined : { x: labelX, y: labelY }}
        >
          {say(UI.demoMagnet)}
        </motion.span>
      </motion.button>
    </div>
  );
}
