/**
 * ФАКТЫ О ВЛАДЕЛЬЦЕ — единственный источник для всего, что сайт говорит о нём
 * как о специалисте: о себе, стек, места работы, кейсы, контакты.
 *
 * Отсюда читают сразу два места, и в этом весь смысл файла:
 *   - комнаты домов на маршруте (`src/lib/rooms.tsx`): стена дома опыта,
 *     полка дома технологий и так далее;
 *   - страница `/cv` — резюме одним экраном для нанимающего.
 * Владелец дописывает место работы сюда — и оно появляется в обоих местах.
 *
 * Образование и награды здесь НЕ лежат: они уже живут в `src/lib/trophies.ts`
 * (оттуда же читают площадки на маршруте). Здесь только порядок, в котором
 * резюме их показывает, — ссылками на `id`, без копий текста.
 *
 * Правило проекта: **факты не выдумываются.** Сейчас всё пустое, потому что
 * владелец их ещё не прислал (требования — в `docs/нужны-ассеты.md`). Пустой
 * раздел не рендерится ни в комнате, ни на `/cv`: рыба в прод не уезжает.
 *
 * Все видимые строки — парой `{ ru, en }`. Названия технологий (`React`,
 * `TypeScript`) пишутся одной строкой: они на обоих языках одинаковые.
 *
 * ---------------------------------------------------------------------------
 * Как добавить место работы (пример, НЕ настоящие данные):
 *
 *   jobs: [
 *     {
 *       id: "studio",
 *       place: { ru: "Студия N", en: "Studio N" },
 *       role: { ru: "Фронтенд-разработчик", en: "Frontend developer" },
 *       from: "2025-02",
 *       to: null, // null — работаю сейчас
 *       did: [
 *         { ru: "Собрал сайт клиники с онлайн-записью.", en: "Built a clinic site with online booking." },
 *       ],
 *     },
 *   ],
 *
 * Остальные разделы устроены так же: запись в массив — и готово.
 * ---------------------------------------------------------------------------
 */

import { UI } from "@/lib/content";
import type { Localized } from "@/lib/i18n";
import { trophies, type Trophy } from "@/lib/trophies";

/**
 * Честный уровень владения. Три ступени, а не проценты и не звёздочки:
 * «85% React» ничего не значит, а «каждый день в работе» проверяется на
 * собеседовании. Подписи ступеней — в `src/lib/content.ts` (`UI.level*`).
 */
export type SkillLevel = "daily" | "confident" | "familiar";

export type Skill = {
  /** Название технологии — одинаковое на обоих языках */
  name: string;
  level: SkillLevel;
  /** Одна фраза, где и как применял. Необязательно */
  note?: Localized;
};

export type Job = {
  id: string;
  place: Localized;
  role: Localized;
  /** Начало, `ГГГГ-ММ` */
  from: string;
  /** Конец, `ГГГГ-ММ`; `null` — работаю сейчас */
  to: string | null;
  /** Что сделал: коротко, по пункту на результат */
  did: Localized[];
};

/** Скриншот кейса. Настоящий, а не собранный из `div`-ов (инвариант проекта) */
export type Shot = {
  /** Путь от `public`, например `/cases/clinic-after.webp` */
  src: string;
  width: number;
  height: number;
  alt: Localized;
};

export type CaseStudy = {
  id: string;
  title: Localized;
  /** Задача клиента: что у него болело */
  task: Localized;
  /** Решение: что сделано и почему так */
  solution: Localized;
  /** Результат: что изменилось, желательно в цифрах */
  result: Localized;
  /** Чем сделано */
  stack: string[];
  shots: Shot[];
  /** Живая ссылка на проект, если её можно показывать */
  url?: string;
};

export type ContactKind = "email" | "telegram" | "github" | "linkedin" | "phone" | "site";

export type Contact = {
  kind: ContactKind;
  /** Что видно на экране: адрес, ник, номер */
  value: string;
  /** Куда ведёт: `mailto:`, `https://t.me/…` и т. п. */
  href: string;
};

export type Profile = {
  /** Абзац о себе: почему фронтенд и куда дальше. `null` — текста нет */
  about: Localized | null;
  /** Тезис о подходе к работе — стена дома технологий. `null` — текста нет */
  approach: Localized | null;
  stack: Skill[];
  jobs: Job[];
  cases: CaseStudy[];
  contacts: Contact[];
  /**
   * Какие трофеи из `trophies.ts` — образование. Резюме показывает их первыми,
   * остальные трофеи идут следом как награды. Только `id`, тексты не копируются.
   */
  education: string[];
};

export const profile: Profile = {
  about: null,
  approach: null,
  stack: [],
  jobs: [],
  cases: [],
  contacts: [],
  education: ["university", "school"],
};

/**
 * Период работы для подписи: `02.2025 — сейчас`. Возвращает пару `{ ru, en }`,
 * потому что «сейчас» переводится, а даты — нет. Тире в английской паре —
 * дефис (правило проекта).
 */
export function jobPeriod(job: Job): Localized {
  const month = (value: string) => {
    const [year, mm] = value.split("-");
    return mm ? `${mm}.${year}` : year;
  };
  const from = month(job.from);
  const to = (lang: keyof Localized) => (job.to ? month(job.to) : UI.cvPresent[lang]);
  return { ru: `${from} — ${to("ru")}`, en: `${from} - ${to("en")}` };
}

/** Образование — в порядке `profile.education`, тексты из `trophies.ts` */
export function educationTrophies(): Trophy[] {
  return profile.education.flatMap((id) => trophies.filter((trophy) => trophy.id === id));
}

/** Награды — все остальные трофеи, в порядке их файла */
export function awardTrophies(): Trophy[] {
  return trophies.filter((trophy) => !profile.education.includes(trophy.id));
}

/** Подпись ступени владения — из строк интерфейса */
export const LEVEL_LABEL: Record<SkillLevel, Localized> = {
  daily: UI.levelDaily,
  confident: UI.levelConfident,
  familiar: UI.levelFamiliar,
};

/** Все технологии кейсов одним списком, без повторов, в порядке появления */
export function caseStack(cases: CaseStudy[]): string[] {
  return [...new Set(cases.flatMap((item) => item.stack))];
}
