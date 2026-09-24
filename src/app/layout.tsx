import { MotionConfig } from "framer-motion";
import type { Metadata } from "next";
import { JetBrains_Mono, Onest, Unbounded } from "next/font/google";

import { CommandPalette } from "@/components/command-palette";
import { CursorCompanion } from "@/components/cursor-companion";
import { Hud } from "@/components/hud";
import { RouteMap } from "@/components/route/route-map";
import { LanguageSync } from "@/components/providers/language-sync";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Xray } from "@/components/xray";

import "./globals.css";
import "lenis/dist/lenis.css";

// Кириллица обязательна — сайт русскоязычный с переключением на английский.
// Дисплейный Unbounded только для заголовков: в длинном тексте он утомляет.
const display = Unbounded({
  variable: "--font-app-display",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const sans = Onest({
  variable: "--font-app-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-app-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const TITLE = "Никита Чистяков — интерактивное CV";
const DESCRIPTION =
  "Резюме-маршрут: изометрический городок, который разворачивается по мере скролла.";

/**
 * Основание для абсолютных ссылок в метаданных.
 *
 * Домена у проекта пока нет (открытый пункт в docs/нужны-ассеты.md), а
 * придумывать чужой нельзя. Для файловой конвенции `opengraph-image`
 * metadataBase не обязателен: Next подставляет свой запасной вариант
 * (localhost в разработке, переменные Vercel на деплое) и в продакшне пишет
 * предупреждение. Поэтому берём адрес из переменной окружения, а локально
 * падаем на localhost — карточку видно и на дев-сервере.
 * Появится домен — достаточно задать NEXT_PUBLIC_SITE_URL при сборке.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  // Карточка для мессенджеров и соцсетей. Саму картинку рисует
  // src/app/opengraph-image.tsx: по файловой конвенции Next сам добавляет
  // og:image вместе с размерами, типом и подписью, поэтому здесь её нет.
  openGraph: {
    type: "profile",
    title: TITLE,
    description: DESCRIPTION,
    locale: "ru_RU",
  },
  twitter: {
    // Картинка горизонтальная, 1200×630 — под неё нужна большая карточка.
    // twitter:image Next наследует от openGraph, отдельный twitter-image.tsx
    // не нужен.
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      // Язык переключается на клиенте (LanguageProvider): начальный всегда
      // русский, иначе разметка сервера и клиента разойдутся
      lang="ru"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}
    >
      <body className="min-h-svh">
        {/* reducedMotion="user": при prefers-reduced-motion все transform-анимации
            motion-компонентов становятся мгновенными — остановки не въезжают
            снизу через whileInView, а просто появляются на месте. Lenis и
            CSS-анимации выключаются отдельно (SmoothScroll и globals.css). */}
        <MotionConfig reducedMotion="user">
          <ThemeProvider>
            <LanguageSync />
            <SmoothScroll>
              <Hud />
              {/* Палитра ⌘K: слушатель горячей клавиши живёт всегда, диалог
                  монтируется только открытым. Внутри SmoothScroll — ей нужен
                  Lenis, чтобы прыгать к остановкам и глушить скролл */}
              <CommandPalette />
              {/* Разбор сайта: слой монтируется только открытым, замок
                  скролла — через Lenis, как у палитры */}
              <Xray />
              <RouteMap />
              <CursorCompanion />
              {children}
            </SmoothScroll>
          </ThemeProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
