"use client";

import { useSyncExternalStore } from "react";

/**
 * Узкий экран для комнаты.
 *
 * Ниже этой ширины сцена в перспективе не помещается без ужимания до нечитаемого:
 * три плоскости рассчитаны на 820 пикселей, а на 390 от них остаётся полоска.
 * Поэтому комната отдаётся плоской панелью — тем же контентом без перспективы.
 *
 * Подписка через `useSyncExternalStore`, как у `prefers-reduced-motion`:
 * состояние в эффекте линтер проекта запрещает, а серверный снапшот («широкий»)
 * удерживает разметку от расхождения при гидратации.
 */
const QUERY = "(max-width: 899.98px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useNarrowViewport() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/**
 * Тесный экран для полной комнаты: уже 1200 или ниже 800 пикселей.
 *
 * Все три слота живут на задней стене (стена, полка, планшет перед ней), и на
 * ноутбуке 1280×720 или окне 1024 им достаётся по полоске в полсотни пикселей
 * с прокруткой — читать это нельзя. Правило раздела 4.2 «читаемость важнее
 * эффекта» разворачивает такую комнату в плоскую панель. Комнате с одним-двумя
 * слотами места хватает и здесь, она остаётся объёмной.
 */
const COMPACT_QUERY = "(max-width: 1199.98px), (max-height: 799.98px)";

function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia(COMPACT_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useCompactViewport() {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

/**
 * Комната рисуется в портале на `body`, поэтому рендеру нужен признак браузера.
 * Тот же приём: серверный снапшот `false`, клиентский `true`, без состояния.
 */
function subscribeNever() {
  return () => {};
}

export function useIsClient() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
