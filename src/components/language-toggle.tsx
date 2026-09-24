"use client";

import { UI } from "@/lib/content";
import { useLang } from "@/lib/use-lang";

/**
 * Переключатель языка показывает текущий язык. Пробовали наоборот — подпись
 * «на какой переключит» — владелец прочитал это как ошибку: при русском
 * интерфейсе на кнопке стояло EN.
 */
export function LanguageToggle() {
  const { lang, toggle } = useLang();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={UI.langTitle[lang]}
      data-lang-toggle
      className="grid h-9 min-w-9 place-items-center rounded-full border border-line bg-surface/80 px-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink backdrop-blur transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {lang === "ru" ? "RU" : "EN"}
    </button>
  );
}
