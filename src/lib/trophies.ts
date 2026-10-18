import type { Localized } from "@/lib/i18n";

/**
 * Трофеи и достижения — единственный источник правды.
 *
 * Отсюда читают и кликабельные детали на маршруте (шахматная площадка,
 * в будущем — волейбольная), и полка в доме опыта (этап Э6). Дублировать
 * тексты в компонентах нельзя: пользователь просил, чтобы деталь на фоне и
 * полка показывали одно и то же.
 *
 * Тексты — парой `{ ru, en }`, как весь контент проекта. Формат записи
 * многострочный, по одному языку на строку: `verify` читает русскую подпись
 * из этого файла регулярным выражением и сверяет её с тем, что показывает
 * площадка. Не сворачивать в одну строку.
 *
 * Формулировки собраны из фактов, названных владельцем, и ждут его правки —
 * требование записано в docs/нужны-ассеты.md. Английские — перевод тех же
 * служебных строк, длинных тире в них быть не должно.
 */

export type LandmarkId = "chess" | "volleyball";

export type Trophy = {
  id: string;
  title: Localized;
  summary: Localized;
  /** Есть ли у трофея своя деталь на маршруте */
  landmark?: LandmarkId;
};

export const trophies: Trophy[] = [
  {
    id: "chess",
    title: {
      ru: "Шахматы",
      en: "Chess",
    },
    summary: {
      ru: "Кандидат в мастера спорта. 21 медаль: 4 золотых, 6 серебряных, 11 бронзовых. Городские, областные и региональные турниры, матчи между сборными городов.",
      en: "Candidate Master of Sports. 21 medals: 4 gold, 6 silver, 11 bronze. City, regional and oblast tournaments, matches between city teams.",
    },
    landmark: "chess",
  },
  {
    id: "volleyball",
    title: {
      ru: "Волейбол",
      en: "Volleyball",
    },
    summary: {
      ru: "Первый разряд, член сборной БГУИР. Два кубка: пляжный турнир ко Дню пожарной службы в Рогачёве и первое место на чемпионате среди факультетов БГУИР.",
      en: "First sports category, a member of the BSUIR team. Two cups: a beach tournament for Firefighters' Day in Rogachev and first place at the BSUIR faculty championship.",
    },
    landmark: "volleyball",
  },
  {
    id: "school",
    title: {
      ru: "Золотая медаль школы",
      en: "School gold medal",
    },
    summary: {
      ru: "Школа окончена с золотой медалью.",
      en: "Graduated from school with a gold medal.",
    },
  },
  {
    id: "university",
    title: {
      ru: "БГУИР, инженерно-экономический факультет",
      en: "BSUIR, Faculty of Engineering and Economics",
    },
    summary: {
      ru: "Инженер-программист, выпуск 2027. Информационные системы и технологии (цифровой маркетинг).",
      en: "Software engineer, class of 2027. Information systems and technologies (digital marketing).",
    },
  },
];

export function trophyByLandmark(landmark: LandmarkId) {
  const found = trophies.find((trophy) => trophy.landmark === landmark);
  if (!found) throw new Error(`Нет трофея для детали «${landmark}»`);
  return found;
}
