"use client";

import { UI } from "@/lib/content";
import { useLang } from "@/lib/use-lang";

import { SearchIcon } from "./icons";
import { openPalette, usePaletteOpen } from "./store";
import { useIsMac } from "./use-is-mac";

/**
 * Кнопка палитры для верхней панели.
 *
 * Горячая клавиша есть не у всех: на телефоне и планшете клавиатуры нет, а
 * кто-то просто не знает про `⌘K`. Кнопка открывает ту же палитру через тот же
 * store и заодно учит сочетанию — подпись клавиш стоит прямо на ней.
 * На сенсорных экранах подписи нет: там она обещала бы клавишу, которой нет,
 * и кнопка становится круглой иконкой, как переключатель темы.
 *
 * Вид — как у остальных кнопок панели (`PILL` в `hud.tsx`).
 */
export function CommandPaletteTrigger({ className = "" }: { className?: string }) {
  const { lang } = useLang();
  const open = usePaletteOpen();
  const isMac = useIsMac();
  const shortcut = isMac ? UI.paletteKeyMac : UI.paletteKeyOther;

  return (
    <button
      type="button"
      data-palette-trigger
      aria-label={UI.paletteTitle[lang]}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
      title={`${UI.paletteTitle[lang]} · ${shortcut[lang]}`}
      // Кнопка передаёт себя: на неё вернётся фокус после закрытия
      onClick={(event) => openPalette(event.currentTarget)}
      className={`flex h-9 min-w-9 items-center justify-center gap-2 rounded-full border border-line bg-surface/80 px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink backdrop-blur transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:px-0 ${className}`}
    >
      <SearchIcon className="size-3.5 shrink-0" />
      <kbd aria-hidden className="font-mono normal-case tracking-[0.06em] pointer-coarse:hidden">
        {shortcut[lang]}
      </kbd>
    </button>
  );
}
