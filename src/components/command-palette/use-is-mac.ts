"use client";

import { useSyncExternalStore } from "react";

/**
 * macOS или нет — от этого зависит подпись сочетания: `⌘K` или `Ctrl K`.
 *
 * Платформа за визит не меняется, подписываться не на что. Серверный снапшот —
 * мак: на нём сидит большинство тех, кому это резюме адресовано, и у них
 * подпись не мигает после гидратации.
 */

type NavigatorWithHints = Navigator & { userAgentData?: { platform?: string } };

const subscribe = () => () => {};

function readIsMac() {
  const nav = navigator as NavigatorWithHints;
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function useIsMac() {
  return useSyncExternalStore(subscribe, readIsMac, () => true);
}
