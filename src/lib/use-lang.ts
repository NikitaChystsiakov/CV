"use client";

import { useSyncExternalStore } from "react";

import type { Lang } from "@/lib/i18n";

/**
 * Язык интерфейса живёт в `sessionStorage` — там же, где прогресс и ачивки:
 * это выбор на время визита, а не настройка аккаунта.
 *
 * Хранилище внешнее, поэтому подписка идёт через `useSyncExternalStore`, как у
 * `prefers-reduced-motion`. Так на сервере рендерится русский (серверный
 * снапшот), а сохранённый язык подставляется сразу после гидратации, без
 * состояния в эффекте и без расхождения разметки.
 */

const KEY = "cv-lang";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function readLang(): Lang {
  try {
    return sessionStorage.getItem(KEY) === "en" ? "en" : "ru";
  } catch {
    // Приватный режим и заблокированное хранилище: язык просто не запоминается
    return "ru";
  }
}

export function setLang(lang: Lang) {
  try {
    sessionStorage.setItem(KEY, lang);
  } catch {
    // Не запомнили — не страшно, в этой вкладке язык всё равно переключится
  }
  listeners.forEach((listener) => listener());
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, readLang, () => "ru" as Lang);
  return { lang, setLang, toggle: () => setLang(lang === "ru" ? "en" : "ru") };
}
