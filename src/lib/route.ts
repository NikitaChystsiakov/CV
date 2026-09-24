/**
 * Конфиг маршрута — порядок остановок по скроллу (п.6 концепта).
 *
 * Пока это плейсхолдеры: арт и контент подключаются итерациями 2–8.
 * Порядок домов — открытый вопрос концепта (п.12), меняется правкой этого массива:
 * весь маршрут строится из него, руками в разметке ничего дублировать не нужно.
 *
 * Тексты лежат парой `{ ru, en }`. Английский здесь — перевод служебных
 * плейсхолдеров, а не контент резюме: настоящие тексты обеих версий ждём от
 * владельца (`docs/нужны-ассеты.md`).
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
      ru: "Hero-приглашение: имя, роль, зов к скроллу. Впереди по пути видны первые дома — не весь город сразу.",
      en: "Hero invitation: name, role, a nudge to scroll. The first houses show up ahead, not the whole town at once.",
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
      ru: "Библиотека анимаций: 10–15 изолированных демо-блоков с подписями, ленивая подгрузка по Intersection Observer.",
      en: "An animation library: 10-15 isolated demos with short captions, lazily mounted via Intersection Observer.",
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
      ru: "Передышка между первыми домами: drag-and-drop блоков UI по слотам макета, шутливая реакция персонажа в конце.",
      en: "A breather between the first houses: drag UI blocks into layout slots, with a joking reaction at the end.",
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
      ru: "Стек с честным уровнем владения по каждому пункту. Раскрытие — инлайн прямо на маршруте.",
      en: "The stack with an honest level for every item. It opens inline, right on the route.",
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
      ru: "Реальные проекты: «было/стало», задача клиента и почему выбрано такое решение. Кандидат на полноэкранный заход внутрь.",
      en: "Real projects: before and after, the client's task and why this solution won. A candidate for a full-screen walk-in.",
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
      ru: "Таймлайн: даты, места, ключевые точки роста.",
      en: "A timeline: dates, places, the turning points.",
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
      ru: "Почему фронтенд, откуда путь, что дальше. Контакты, CTA и PDF-версия резюме — здесь маршрут логически заканчивается.",
      en: "Why frontend, where the path started, what comes next. Contacts, a CTA and the PDF resume - the route logically ends here.",
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
      ru: "Дальше — только оверскролл: resistance-эффект, бонусная сцена, ачивки и секундомер времени на сайте.",
      en: "Beyond this point only overscroll: a resistance effect, a bonus scene, achievements and the time-on-site counter.",
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
