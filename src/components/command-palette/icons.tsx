/**
 * Иконки палитры. Один рисунок на всё: сетка 24, штрих 1.8, круглые концы —
 * как у солнца и луны в переключателе темы, чтобы кнопки панели и строки
 * палитры читались одним набором.
 */

import type { ReactNode } from "react";

type IconProps = { className?: string };

function Frame({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Frame>
  );
}

/** Остановка маршрута — та же звезда-точка, что на карте Скорпиона */
export function StopIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="7.5" opacity="0.45" />
    </Frame>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </Frame>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </Frame>
  );
}

export function GlobeIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5Z" />
    </Frame>
  );
}

export function PageIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M6.5 3.5h7l4 4v13h-11z" />
      <path d="M13.5 3.5v4h4M9.5 12.5h5M9.5 16h5" />
    </Frame>
  );
}

/** Переход на другую страницу — стрелка в правом конце строки */
export function ArrowOutIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M8 16 16 8M9.5 8H16v6.5" />
    </Frame>
  );
}

export function ArrowUpIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M12 18V6M7 11l5-5 5 5" />
    </Frame>
  );
}

export function ArrowDownIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M12 6v12M7 13l5 5 5-5" />
    </Frame>
  );
}

export function EnterIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M18.5 6v5.5a2 2 0 0 1-2 2H6.5M10 10l-3.5 3.5L10 17" />
    </Frame>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Frame>
  );
}

/** Разбор сайта — стопка слоёв */
export function LayersIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d="M12 4 3.5 8.5 12 13l8.5-4.5z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" opacity="0.55" />
    </Frame>
  );
}
