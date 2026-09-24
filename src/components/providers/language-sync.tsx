"use client";

import { useEffect } from "react";

import { useLang } from "@/lib/use-lang";

/**
 * Держит `<html lang>` в согласии с выбранным языком: от него зависят переносы,
 * скринридеры и предложение автоперевода. Ничего не рисует.
 */
export function LanguageSync() {
  const { lang } = useLang();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
