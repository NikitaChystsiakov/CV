"use client";

import { UI } from "@/lib/content";
import { useLang } from "@/lib/use-lang";

/** Хвост страницы: зона оверскролла собирается на этапе Э11. */
export function RouteFooter() {
  const { lang } = useLang();

  return (
    <footer className="border-t border-dashed border-line py-16 text-center font-mono text-xs text-muted">
      {UI.outro[lang]}
    </footer>
  );
}
