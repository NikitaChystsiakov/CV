/**
 * Язык интерфейса.
 *
 * Все видимые строки хранятся парой `{ ru, en }` с самого начала — так решено в
 * концепте, чтобы переключатель языка не потребовал переписывать тексты.
 * В разметке захардкоженного контента быть не должно: проверка в `verify`
 * ищет кириллицу на странице после переключения на английский.
 */

export type Lang = "ru" | "en";

export type Localized = { ru: string; en: string };

export const LANGS: Lang[] = ["ru", "en"];

export function pick(value: Localized, lang: Lang) {
  return value[lang];
}

/**
 * Длинное тире — нормальная русская пунктуация, а в английской версии его
 * заменяют дефисом (правило проекта). Держим это одной функцией, чтобы не
 * ловить тире по всем текстам вручную.
 */
export function dashes(text: string, lang: Lang) {
  return lang === "en" ? text.replace(/—/g, "-") : text;
}
