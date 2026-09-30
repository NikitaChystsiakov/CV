/**
 * Конфиг маршрута — порядок остановок по скроллу (п.6 концепта).
 *
 * Пока это плейсхолдеры: арт и контент подключаются итерациями 2–8.
 * Порядок домов — открытый вопрос концепта (п.12), меняется правкой этого массива:
 * весь маршрут строится из него, руками в разметке ничего дублировать не нужно.
 *
 * Тексты лежат парой `{ ru, en }`. `summary` — одна строка для читателя под
 * заголовком дома: что внутри, без фактов о владельце (факты — в profile.ts).
 * Служебные заметки разработчика здесь были и уезжали посетителю — не
 * возвращать. Черновик развилки не рендерится, его заметка осталась как есть.
 */

import type { Localized } from "@/lib/i18n";

export type RouteStopKind =
  | "hero" // выход на маршрут
  | "house" // дом с контентом
  | "interlude" // передышка (мини-игра)
  | "fork" // развилка в неблагополучный район
  | "outro"; // конец маршрута + зона оверскролла

export type RouteStopConfig = {
  id: string;
  /** Подпись остановки на маршруте */
  title: Localized;
  /** Короткое пояснение — что здесь будет */
  summary: Localized;
  kind: RouteStopKind;
  /** С какой стороны от дорожки стоит объект */
  side: "left" | "right";
  /** Итерация дорожной карты, которая наполнит остановку (п.14 концепта) */
  iteration: number;
  /** Оттенок плейсхолдера, чтобы блоки различались на глаз */
  hue: number;
  /**
   * Черновик: остановка описана в концепте, но ассета для неё нет, а показывать
   * посетителю плейсхолдер с подписью «плейсхолдер» нельзя. Черновики не попадают
   * в `routeStops` и не рендерятся — ни в dev, ни в prod, флаг от окружения не
   * зависит. Когда придёт ассет, флаг снимается, и остановка встаёт на своё место.
   */
  draft?: boolean;
};

/**
 * Полный маршрут по концепту, включая черновики. Потребителям нужен
 * `routeStops` — то, что реально стоит на улице.
 */
export const routeStopsAll: RouteStopConfig[] = [
  {
    id: "hero",
    title: {
      ru: "Выход на маршрут",
      en: "Start of the route",
    },
    summary: {
      ru: "Каждый дом у дороги — раздел резюме. В некоторые можно зайти.",
      en: "Every house by the road is a section of the resume. Some of them you can walk into.",
    },
    kind: "hero",
    side: "right",
    iteration: 2,
    hue: 168,
  },
  {
    id: "skills",
    title: {
      ru: "Дом навыков",
      en: "House of skills",
    },
    summary: {
      ru: "Живые демо анимаций и интерактива. Зайдите и потрогайте.",
      en: "Live demos of motion and interaction. Step inside and try them.",
    },
    kind: "house",
    side: "left",
    iteration: 8,
    hue: 196,
  },
  {
    id: "minigame",
    title: {
      ru: "Мини-игра «Собери интерфейс»",
      en: "Mini-game: assemble the interface",
    },
    summary: {
      ru: "Передышка: соберите интерфейс из блоков.",
      en: "A breather: assemble an interface from blocks.",
    },
    kind: "interlude",
    side: "right",
    iteration: 4,
    hue: 42,
  },
  {
    id: "tech",
    title: {
      ru: "Дом технологий",
      en: "House of technologies",
    },
    summary: {
      ru: "Стек: чем пользуюсь и насколько уверенно.",
      en: "The stack: what I use and how confidently.",
    },
    kind: "house",
    side: "left",
    iteration: 5,
    hue: 262,
  },
  {
    id: "cases",
    title: {
      ru: "Дом кейсов",
      en: "House of case studies",
    },
    summary: {
      ru: "Проекты: задача, решение и результат — на настоящих скриншотах.",
      en: "Projects: the task, the solution and the result, on real screenshots.",
    },
    kind: "house",
    side: "right",
    iteration: 5,
    hue: 12,
  },
  {
    id: "fork",
    title: {
      ru: "Развилка в неблагополучный район",
      en: "Turn into the rough district",
    },
    summary: {
      ru: "Необязательное ответвление: пиксель-арт и киберпанк-неон, «глюк» персонажа на входе, ачивка за смелость и возврат в ту же точку.",
      en: "An optional detour: pixel art and cyberpunk neon, a glitching character at the entrance, an achievement for nerve and a way back to the same spot.",
    },
    kind: "fork",
    side: "left",
    iteration: 6,
    hue: 318,
    // Ассета развилки нет (docs/нужны-ассеты.md) — до его появления остановка
    // остаётся черновиком и на маршруте не показывается
    draft: true,
  },
  {
    id: "experience",
    title: {
      ru: "Дом опыта",
      en: "House of experience",
    },
    summary: {
      ru: "Путь и награды. Зайдите внутрь.",
      en: "The path so far and the trophies. Step inside.",
    },
    kind: "house",
    side: "right",
    iteration: 5,
    hue: 148,
  },
  {
    id: "about",
    title: {
      ru: "Дом «о себе» и контакты",
      en: "About me and contacts",
    },
    summary: {
      ru: "Почему фронтенд и как со мной связаться.",
      en: "Why frontend, and how to get in touch.",
    },
    kind: "house",
    side: "left",
    iteration: 5,
    hue: 88,
  },
  {
    id: "outro",
    title: {
      ru: "Конец маршрута",
      en: "End of the route",
    },
    summary: {
      ru: "Конец маршрута. Спасибо, что дошли.",
      en: "The end of the route. Thanks for walking it.",
    },
    kind: "outro",
    side: "right",
    iteration: 7,
    hue: 222,
  },
];

/**
 * Остановки, которые реально стоят на маршруте: без черновиков.
 * Единственный источник правды для панели, дорожки, карты, меню и декора —
 * все они получают один и тот же отфильтрованный список.
 */
export const routeStops: RouteStopConfig[] = routeStopsAll.filter(
  (stop) => !stop.draft,
);
