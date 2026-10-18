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

/**
 * Группа технологий так, как их делит само резюме: не уровни, а области.
 * Отдельно от `Skill.level`: уровни — для галереи дома навыков, когда владелец
 * их назовёт, группы — для страницы `/cv`.
 */
export type SkillGroupId = "frontend" | "backend" | "tools" | "basic";

export type SkillGroup = {
  id: SkillGroupId;
  /** Названия технологий; `Localized` — только там, где слово переводится */
  items: Localized[];
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
  /** Живая ссылка на работу, если её можно показывать */
  link?: { label: string; href: string };
};

/** Проект резюме: личный или учебный, с пунктами «что именно сделано». */
export type Project = {
  id: string;
  title: Localized;
  /** «личный проект», «учебный проект» */
  kind: Localized;
  year: string;
  /** Чем сделано, в порядке резюме */
  stack: string[];
  /** Пункты с подписью: «Интерфейс», «Сервер» и т. п. */
  points: { label: Localized; text: Localized }[];
  github?: string;
};

export type LanguageSkill = {
  name: Localized;
  /** Уровень как в резюме, на обоих языках одинаково */
  level: string;
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
  /** Строка под именем: роль и главный стек. `null` — берётся `UI.role` */
  headline: Localized | null;
  city: Localized | null;
  /** Абзац о себе: почему фронтенд и куда дальше. `null` — текста нет */
  about: Localized | null;
  /** Тезис о подходе к работе — стена дома технологий. `null` — текста нет */
  approach: Localized | null;
  stack: Skill[];
  skillGroups: SkillGroup[];
  jobs: Job[];
  projects: Project[];
  cases: CaseStudy[];
  contacts: Contact[];
  languages: LanguageSkill[];
  /**
   * Какие трофеи из `trophies.ts` — образование. Резюме показывает их первыми,
   * остальные трофеи идут следом как награды. Только `id`, тексты не копируются.
   */
  education: string[];
};

/** Название технологии одинаково на обоих языках */
const tech = (name: string): Localized => ({ ru: name, en: name });

/**
 * Факты из резюме владельца (`public/cv.pdf`, версия от 13.10.2026). Английские
 * строки — перевод тех же фактов, ждут правки владельца.
 */
export const profile: Profile = {
  headline: {
    ru: "Frontend-разработчик · React, Next.js, TypeScript",
    en: "Frontend developer · React, Next.js, TypeScript",
  },
  city: { ru: "Минск", en: "Minsk" },
  about: {
    ru: "Разрабатываю сайты и веб-приложения для бизнеса под ключ: от макета до деплоя, домена и интеграций с Telegram и почтой. Знаю бэкенд (Java / Spring Boot, Node.js, PostgreSQL), поэтому проектирую интерфейс вместе с API, а цены, роли и доступ к данным проверяю на сервере.",
    en: "I build websites and web apps for businesses end to end: from the mockup to deployment, domain setup and Telegram and email integrations. I know the backend (Java / Spring Boot, Node.js, PostgreSQL), so I design the interface together with the API, and check prices, roles and data access on the server.",
  },
  approach: null,
  stack: [],
  skillGroups: [
    {
      id: "frontend",
      items: [
        tech("JavaScript"),
        tech("TypeScript"),
        tech("React"),
        tech("Next.js"),
        tech("HTML / CSS"),
        tech("Tailwind CSS"),
        tech("Zustand"),
        tech("i18n"),
        { ru: "Адаптивная вёрстка", en: "Responsive layout" },
      ],
    },
    {
      id: "backend",
      items: [
        tech("Java"),
        tech("Spring Boot"),
        tech("Node.js"),
        tech("PostgreSQL"),
        tech("Prisma"),
        tech("Spring Data JPA"),
        tech("JWT"),
      ],
    },
    {
      id: "tools",
      items: [
        tech("Git"),
        tech("Docker Compose"),
        tech("Vitest"),
        tech("Vercel"),
        tech("Telegram Bot API"),
      ],
    },
    {
      id: "basic",
      items: [tech("Python"), tech("PHP"), tech("Linux"), tech("React Query")],
    },
  ],
  jobs: [
    {
      id: "freelance",
      place: { ru: "Фриланс", en: "Freelance" },
      role: { ru: "Frontend-разработчик", en: "Frontend developer" },
      from: "2026-08",
      to: null,
      link: { label: "32dent.by", href: "https://32dent.by/" },
      did: [
        {
          ru: "Сеть стоматологий «32Дент»: в одиночку сделал сайт сети на Next.js от дизайна до запуска: хаб, страницы трёх клиник (Минск, Рогачёв, Жлобин) и посадочные страницы для соседних городов.",
          en: "32Dent dental network: built the network's website alone in Next.js, from design to launch: a hub, pages for three clinics (Minsk, Rogachev, Zhlobin) and landing pages for neighboring cities.",
        },
        {
          ru: "Формы записи: заявки уходят в Telegram-группу клиники через бот и дублируются на почту; обработчик на PHP, чтобы хостингу клиента не требовался Node.js.",
          en: "Booking forms: requests go to the clinic's Telegram group through a bot and are duplicated by email; the handler is in PHP, so the client's hosting doesn't need Node.js.",
        },
        {
          ru: "Деплой: развернул сайт на хостинге клиента, настроил домен и DNS; вёл заказчика от оценки до сдачи.",
          en: "Deployment: set up the site on the client's hosting, configured the domain and DNS; guided the client from estimate to handover.",
        },
      ],
    },
    {
      id: "arte",
      place: { ru: "ARTE (artegifts.by)", en: "ARTE (artegifts.by)" },
      role: { ru: "Маркетолог, производственная практика", en: "Marketer, internship" },
      from: "2026-06",
      to: "2026-07",
      did: [
        {
          ru: "B2B-производитель корпоративных подарков: email-маркетинг, контент для соцсетей, CRM Битрикс24.",
          en: "A B2B corporate gifts manufacturer: email marketing, social media content, Bitrix24 CRM.",
        },
      ],
    },
  ],
  projects: [
    {
      id: "zaezd",
      title: {
        ru: "Заезд — модуль бронирования для усадеб",
        en: "Zaezd: a booking module for guest estates",
      },
      kind: { ru: "личный проект", en: "personal project" },
      year: "2026",
      stack: ["Next.js 16", "React 19", "TypeScript", "Tailwind", "PostgreSQL", "Prisma", "Vitest"],
      github: "https://github.com/NikitaChystsiakov/zaezd-booking",
      points: [
        {
          label: { ru: "Интерфейс", en: "Interface" },
          text: {
            ru: "календарь свободных дат, расчёт стоимости по правилам площадки (дни недели, праздники, тарифы для малых компаний, допуслуги), заявка на бронь, встраиваемая форма для сайта усадьбы, панель владельца.",
            en: "a calendar of free dates, price calculation by the venue's rules (weekdays, holidays, small-company rates, extras), a booking request, an embeddable form for the estate's site, an owner panel.",
          },
        },
        {
          label: { ru: "Целостность данных", en: "Data integrity" },
          text: {
            ru: "двойная бронь исключена на уровне БД (EXCLUDE USING gist по диапазону дат); цену от браузера не принимаю, сервер пересчитывает её чистой функцией.",
            en: "double booking is ruled out at the database level (EXCLUDE USING gist on the date range); I never accept the price from the browser, the server recalculates it with a pure function.",
          },
        },
        {
          label: { ru: "Интеграции и доступ", en: "Integrations and access" },
          text: {
            ru: "синхронизация календарей по iCal (RFC 5545, собственная реализация), роли owner / admin / staff, изоляция данных между усадьбами. 72 теста, в том числе интеграционные с БД.",
            en: "calendar sync over iCal (RFC 5545, my own implementation), owner / admin / staff roles, data isolation between estates. 72 tests, including integration tests against the database.",
          },
        },
      ],
    },
    {
      id: "olympiad",
      title: {
        ru: "Платформа онлайн-олимпиад с прокторингом",
        en: "An online olympiad platform with proctoring",
      },
      kind: { ru: "учебный проект", en: "study project" },
      year: "2026",
      stack: ["React 18", "TypeScript", "Java 21", "Spring Boot 3.5", "PostgreSQL", "Docker"],
      github: "https://github.com/NikitaChystsiakov/Olympiad-platform",
      points: [
        {
          label: { ru: "Интерфейс", en: "Interface" },
          text: {
            ru: "три роли, индивидуальный таймер, пять типов вопросов (в том числе код с проверкой через Judge0), рейтинг, интерфейс на русском и английском.",
            en: "three roles, an individual timer, five question types (including code checked through Judge0), a leaderboard, the interface in Russian and English.",
          },
        },
        {
          label: { ru: "Прокторинг в браузере", en: "Proctoring in the browser" },
          text: {
            ru: "контроль вкладки, полноэкранного режима и буфера обмена, детекция лиц с камеры на клиенте (видео не покидает браузер); сервер считает уровень риска по каждому участнику.",
            en: "tracking of the tab, full-screen mode and clipboard, face detection from the camera on the client (the video never leaves the browser); the server computes a risk level for every participant.",
          },
        },
        {
          label: { ru: "Сервер", en: "Server" },
          text: {
            ru: "попытка закрывается по дедлайну на сервере; JWT с refresh-токенами, роли на уровне URL и сервисов; миграции Flyway, запуск через Docker Compose.",
            en: "an attempt is closed by the deadline on the server; JWT with refresh tokens, roles at the URL and service level; Flyway migrations, started through Docker Compose.",
          },
        },
      ],
    },
  ],
  cases: [],
  contacts: [
    { kind: "telegram", value: "@nik_chisty", href: "https://t.me/nik_chisty" },
    { kind: "phone", value: "+375 29 175-36-44", href: "tel:+375291753644" },
    { kind: "email", value: "nikitachystsiakov@icloud.com", href: "mailto:nikitachystsiakov@icloud.com" },
    { kind: "github", value: "github.com/NikitaChystsiakov", href: "https://github.com/NikitaChystsiakov" },
  ],
  languages: [{ name: { ru: "Английский", en: "English" }, level: "B1+ (Intermediate)" }],
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

/** Подпись группы технологий — из строк интерфейса */
export const GROUP_LABEL: Record<SkillGroupId, Localized> = {
  frontend: UI.groupFrontend,
  backend: UI.groupBackend,
  tools: UI.groupTools,
  basic: UI.groupBasic,
};

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
