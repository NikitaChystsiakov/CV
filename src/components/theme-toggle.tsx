"use client";

import { useTheme } from "next-themes";

import { UI } from "@/lib/content";
import { useLang } from "@/lib/use-lang";

/**
 * Иконки переключаются классом .dark на <html>, а не состоянием React —
 * поэтому кнопка рисуется одинаково на сервере и клиенте, без вспышки и mounted-заглушки.
 * Подпись для скринридера — из content.ts, как у остальных кнопок панели:
 * она переключается вместе с языком интерфейса.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { lang } = useLang();

  return (
    <button
      type="button"
      aria-label={UI.themeTitle[lang]}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="grid size-9 place-items-center rounded-full border border-line bg-surface/80 text-ink backdrop-blur transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <SunIcon className="size-4 dark:hidden" />
      <MoonIcon className="hidden size-4 dark:block" />
    </button>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}
