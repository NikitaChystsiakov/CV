import type { Lang, Localized } from "@/lib/i18n";

/**
 * Поиск палитры: без библиотек, потому что команд полтора десятка, а правила
 * у нас свои.
 *
 * 1. **Оба языка сразу.** Посетитель с английским интерфейсом может набрать
 *    «кейсы» — искать только по видимой подписи значило бы молча ему отказать.
 * 2. **Без учёта регистра и ё/е.** «Тёмная» и «темная» — одно слово.
 * 3. **Окончания.** Точная подстрока не находит «кейсы» в «Дом кейсов».
 *    Полноценная морфология здесь избыточна, поэтому у слова запроса
 *    срезается окончание (до двух гласных, мягкий знак, английская `s`), и
 *    основа ищется в начале слов подписи: «кейсы» → «кейс» → «кейсов».
 *
 * Нормализация сохраняет длину строки (ё → е, регистр кириллицы и латиницы
 * 1:1), поэтому найденные позиции переносятся на исходную подпись без пересчёта
 * — по ним рисуется подсветка.
 */

export type Range = [start: number, end: number];

export function normalize(text: string) {
  return text.toLocaleLowerCase("ru").replace(/ё/g, "е");
}

/** Что срезается с конца слова запроса: гласные, й, ь и английское множественное */
const ENDING = /[аеиоуыэюяйьs]$/;

function stem(token: string) {
  let base = token;
  for (let i = 0; i < 2 && base.length > 3 && ENDING.test(base); i += 1) {
    base = base.slice(0, -1);
  }
  return base;
}

/** Буква или цифра: всё остальное — граница слова */
const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordStart(text: string, index: number) {
  return index === 0 || !WORD_CHAR.test(text[index - 1]);
}

type TokenHit = { range: Range; score: number };

/**
 * Одно слово запроса против одной строки. Очки: начало строки — 3, начало
 * слова — 2, середина слова или совпадение по основе — 1.
 */
function matchToken(text: string, token: string): TokenHit | null {
  const index = text.indexOf(token);
  if (index !== -1) {
    // Совпадение с начала слова ценнее, чем найденное внутри: ищем его дальше
    for (let at = index; at !== -1; at = text.indexOf(token, at + 1)) {
      if (isWordStart(text, at)) {
        return { range: [at, at + token.length], score: at === 0 ? 3 : 2 };
      }
    }
    return { range: [index, index + token.length], score: 1 };
  }

  const base = stem(token);
  if (base === token) return null;
  for (let at = text.indexOf(base); at !== -1; at = text.indexOf(base, at + 1)) {
    if (isWordStart(text, at)) return { range: [at, at + base.length], score: 1 };
  }
  return null;
}

export type Searchable = {
  label: Localized;
  keywords?: Localized;
};

export type SearchResult = {
  score: number;
  /** Подсветка в подписи на языке интерфейса */
  ranges: Range[];
  /**
   * Совпало только на другом языке: подпись на нём показывается рядом, иначе
   * непонятно, почему «Дом кейсов» нашёлся по запросу «cases».
   */
  alt: { text: string; ranges: Range[] } | null;
};

function merge(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else out.push([range[0], range[1]]);
  }
  return out;
}

/**
 * Совпадает ли команда с запросом. Каждое слово запроса обязано найтись хоть
 * где-нибудь — в подписи на любом языке или в ключевых словах.
 */
export function search(item: Searchable, query: string, lang: Lang): SearchResult | null {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { score: 0, ranges: [], alt: null };

  const other: Lang = lang === "ru" ? "en" : "ru";
  const own = normalize(item.label[lang]);
  const foreign = normalize(item.label[other]);
  const keywords = item.keywords
    ? `${normalize(item.keywords.ru)} ${normalize(item.keywords.en)}`
    : "";

  let score = 0;
  const ownRanges: Range[] = [];
  const foreignRanges: Range[] = [];

  for (const token of tokens) {
    const inOwn = matchToken(own, token);
    const inForeign = matchToken(foreign, token);
    // Ключевые слова весят меньше подписи: команда, чьё название совпало
    // с запросом, должна стоять выше той, что нашлась по синониму
    const inKeywords = keywords ? matchToken(keywords, token) : null;

    if (!inOwn && !inForeign && !inKeywords) return null;

    if (inOwn) ownRanges.push(inOwn.range);
    if (inForeign) foreignRanges.push(inForeign.range);
    score += Math.max(inOwn?.score ?? 0, inForeign?.score ?? 0, inKeywords ? 0.5 : 0);
  }

  const showAlt = ownRanges.length === 0 && foreignRanges.length > 0;
  return {
    score,
    ranges: merge(ownRanges),
    alt: showAlt ? { text: item.label[other], ranges: merge(foreignRanges) } : null,
  };
}
