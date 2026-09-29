"use client";

import { useCallback } from "react";

import { dashes, pick, type Localized } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";

/**
 * Строка на языке посетителя, с заменой длинного тире в английской версии.
 * Одна функция на обе галереи блока 3: пары `{ ru, en }` приходят и из
 * `content.ts`, и из `skills-demos.ts`, и из `profile.ts`.
 */
export function useSay() {
  const { lang } = useLang();
  return useCallback((value: Localized) => dashes(pick(value, lang), lang), [lang]);
}

/** Подстановка `{name}` в строку интерфейса: «Кейс {n} из {total}» */
export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
