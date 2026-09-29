import type { CSSProperties } from "react";

import { townSize } from "@/lib/town";

import { BALL_BASE } from "./court";

/**
 * Мяч и тень — одна разметка для статичной площадки и для игры, чтобы при
 * подгрузке игры мяч не мигал и не менял вид.
 *
 * Геометрия мяча — та же, что у `VolleyBall` в `route/landmarks.tsx` (круг и
 * две дуги швов, токены `--ball` и `--ball-line`): это одобренный «мяч кодом»,
 * новой графики здесь нет. Сам landmarks.tsx не трогаем — у него своя
 * зацикленная анимация на keyframes.
 */
export function BallArt() {
  return (
    <svg viewBox="-10 -10 20 20" className="block size-full overflow-visible" aria-hidden>
      <circle r="9" fill="var(--color-ball)" stroke="var(--color-ball-line)" strokeWidth="1.2" />
      <path d="M-9 0 A 12 12 0 0 1 9 0" fill="none" stroke="var(--color-ball-line)" strokeWidth="1.2" />
      <path
        d="M-6 6 A 12 12 0 0 0 6 6"
        fill="none"
        stroke="var(--color-ball-line)"
        strokeWidth="1"
        opacity="0.7"
      />
    </svg>
  );
}

/** Размер мяча на экране — в масштабе городка */
export const BALL_BOX: CSSProperties = { width: townSize(BALL_BASE), height: townSize(BALL_BASE) };

/**
 * Тень мяча на земле: радиальный градиент токеном `--shadow`, как у всех теней
 * городка. Сплющена в изометрический эллипс.
 */
export const SHADOW_BOX: CSSProperties = {
  width: townSize(18),
  height: townSize(9),
  background:
    "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 70%, transparent), transparent)",
};
