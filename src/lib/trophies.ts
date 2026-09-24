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
      ru: "Кандидат в мастера спорта. Около 30 медалей чемпионатов области и крупных турниров.",
      en: "Candidate Master of Sports. Around 30 medals from regional championships and major tournaments.",
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
      ru: "Медали и кубки областных турниров. Командный спорт, если коротко.",
      en: "Medals and cups from regional tournaments. A team sport, in short.",
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
      ru: "БГУИР",
      en: "BSUIR",
    },
    summary: {
      ru: "Диплом в 2026 году.",
      en: "Degree in 2026.",
    },
  },
];

export function trophyByLandmark(landmark: LandmarkId) {
  const found = trophies.find((trophy) => trophy.landmark === landmark);
  if (!found) throw new Error(`Нет трофея для детали «${landmark}»`);
  return found;
}
