"use client";

import { ReactLenis } from "lenis/react";
import type { ReactNode } from "react";

import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Плавный скролл на Lenis поверх обычного скролла окна (root-инстанс).
 * Синхронизация персонажа со скроллом (итерация 3) будет вешаться на этот же инстанс
 * через useLenis из "lenis/react" — отдельный rAF-цикл заводить не нужно.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const prefersReducedMotion = usePrefersReducedMotion();

  // Пользователю с prefers-reduced-motion отдаём нативный скролл без инерции.
  if (prefersReducedMotion) return <>{children}</>;

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.09,
        wheelMultiplier: 1,
        touchMultiplier: 1.6,
        smoothWheel: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
