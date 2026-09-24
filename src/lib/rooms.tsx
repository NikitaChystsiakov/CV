/**
 * КОНТЕНТ КОМНАТ — что лежит на трёх слотах интерьера каждого дома (Э5).
 *
 * Слоты заданы разделом 4.2 концепта и одинаковы для всех домов:
 *   wall  — стена, главное: крупный текст, кейс, скриншот;
 *   shelf — полка на боковой стене, перечисления: стек, инструменты, трофеи;
 *   slate — наклонный планшет, списки и таблицы: таймлайн, короткие факты.
 *
 * Расширение `.tsx`, потому что слоты — это готовый JSX: комната их только
 * раскладывает по плоскостям, а вёрстку содержимого держит этот файл.
 *
 * Два правила проекта, из которых растёт весь этот файл:
 *
 * 1. **Контент не выдумывается.** Если фактов нет, слот остаётся `null`, а
 *    требование к владельцу пишется в `docs/нужны-ассеты.md`. Пустой слот
 *    честнее текста-рыбы: рыбу потом забывают убрать, и она уезжает в прод.
 * 2. **Все видимые строки — парой `{ ru, en }`.** Захардкоженной строки в
 *    разметке быть не должно, это проверяет `verify` переключением языка.
 *
 * Факты сюда не пишутся: слоты собираются из двух источников —
 * `src/lib/profile.ts` (о себе, стек, места работы, кейсы, контакты) и
 * `src/lib/trophies.ts` (образование и награды). Из тех же файлов читает
 * страница `/cv`, поэтому место работы, дописанное в `profile.ts`, появляется
 * сразу и на стене дома опыта, и в резюме одним экраном.
 *
 * Сейчас в `profile.ts` пусто, и комната есть ровно у одного дома — дома
 * опыта, с одной полкой трофеев. У остальных домов `roomFor` возвращает
 * `null` — дом без контента не открывается вовсе, это инвариант («ничего
 * недоделанного на виду»), а не недоработка.
 */

import Image from "next/image";
import type { ReactNode } from "react";

import { UI } from "@/lib/content";
import { dashes, pick, type Lang, type Localized } from "@/lib/i18n";
import {
  caseStack,
  jobPeriod,
  LEVEL_LABEL,
  profile,
  type CaseStudy,
  type Contact,
  type Job,
  type Skill,
} from "@/lib/profile";
import { trophies } from "@/lib/trophies";

export type RoomConfig = {
  /** Стена — главное высказывание дома */
  wall: ReactNode;
  /** Полка — перечисления */
  shelf: ReactNode;
  /** Наклонный планшет — списки и факты */
  slate: ReactNode;
};

/**
 * Остановки, у которых комната есть. `verify` читает этот массив, чтобы
 * проверить обратное утверждение: дом, которого здесь нет, не должен быть
 * кнопкой и не должен показывать курсор-руку.
 *
 * Массив — литерал, а не вычисление из `profile.ts`: `verify` читает его из
 * исходника регулярным выражением. Поэтому, когда в `profile.ts` появятся
 * кейсы, стек или «о себе», сюда надо дописать `"cases"`, `"tech"` или
 * `"about"` — `roomFor` для них уже соберёт слоты. Дом опыта в списке всегда:
 * полка трофеев у него есть при любом наполнении профиля.
 */
export const ROOM_STOP_IDS = ["experience"];

/**
 * Подписи слотов. Это строки интерфейса, а не контент остановки, но в
 * `src/lib/content.ts` они не живут: тот файл общий для всей страницы, а эти
 * подписи имеют смысл только внутри комнаты. Структура та же — `{ ru, en }`.
 */
const LABELS = {
  trophies: { ru: "Трофеи", en: "Trophies" },
  timeline: { ru: "Таймлайн", en: "Timeline" },
  levels: { ru: "Уровень владения", en: "Proficiency" },
} satisfies Record<string, Localized>;

/** Строка контента на языке посетителя, с заменой тире для английского */
const say = (value: Localized, lang: Lang) => dashes(pick(value, lang), lang);

/** Подпись слота — моно, как у полки трофеев */
function SlotLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">{children}</p>
  );
}

/** Полка дома опыта: трофеи из общего источника, без дублирования текстов. */
function trophyShelf(lang: Lang) {
  return (
    <div data-room-shelf-trophies>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
        {pick(LABELS.trophies, lang)}
      </p>
      <ul className="mt-3 space-y-3">
        {trophies.map((trophy) => (
          <li key={trophy.id}>
            <p className="font-display text-sm font-bold tracking-tight">
              {dashes(pick(trophy.title, lang), lang)}
            </p>
            <p className="mt-0.5 max-w-[34ch] text-sm text-muted">
              {dashes(pick(trophy.summary, lang), lang)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Стена дома опыта: где и кем работал и что сделал */
function jobsWall(jobs: Job[], lang: Lang) {
  return (
    <div data-room-wall-jobs>
      <SlotLabel>{pick(UI.cvJobs, lang)}</SlotLabel>
      <ul className="mt-4 space-y-6">
        {jobs.map((job) => (
          <li key={job.id}>
            <p className="font-display text-lg font-bold tracking-tight">{say(job.place, lang)}</p>
            <p className="mt-0.5 text-sm text-room-muted">{say(job.role, lang)}</p>
            {job.did.length > 0 && (
              <ul className="mt-2 max-w-[52ch] list-disc space-y-1 pl-5 text-sm">
                {job.did.map((line, index) => (
                  <li key={index}>{say(line, lang)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Планшет дома опыта: таймлайн с датами */
function jobsTimeline(jobs: Job[], lang: Lang) {
  return (
    <div data-room-slate-timeline>
      <SlotLabel>{pick(LABELS.timeline, lang)}</SlotLabel>
      <ol className="mt-3 space-y-2">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono text-xs tabular-nums text-room-muted">
              {say(jobPeriod(job), lang)}
            </span>
            <span className="text-sm font-medium">{say(job.place, lang)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Стена дома кейсов: задача клиента, решение и скриншот каждого кейса */
function casesWall(cases: CaseStudy[], lang: Lang) {
  return (
    <div data-room-wall-cases className="space-y-8">
      {cases.map((item) => (
        <article key={item.id}>
          <p className="font-display text-lg font-bold tracking-tight">{say(item.title, lang)}</p>
          <p className="mt-2 max-w-[52ch] text-sm">
            <span className="text-room-muted">{pick(UI.cvTask, lang)}: </span>
            {say(item.task, lang)}
          </p>
          <p className="mt-1 max-w-[52ch] text-sm">
            <span className="text-room-muted">{pick(UI.cvSolution, lang)}: </span>
            {say(item.solution, lang)}
          </p>
          {item.shots[0] && (
            // Скриншот один на кейс — через оптимизатор, как дома
            <Image
              src={item.shots[0].src}
              width={item.shots[0].width}
              height={item.shots[0].height}
              alt={say(item.shots[0].alt, lang)}
              sizes="28rem"
              className="mt-3 h-auto w-full max-w-md rounded-md border border-room-line"
            />
          )}
        </article>
      ))}
    </div>
  );
}

/** Полка: стек тегами — для кейсов «чем сделано», для технологий весь стек */
function stackShelf(names: string[], lang: Lang) {
  return (
    <div data-room-shelf-stack>
      <SlotLabel>{pick(UI.cvStack, lang)}</SlotLabel>
      <ul className="mt-3 flex flex-wrap gap-2">
        {names.map((name) => (
          <li
            key={name}
            className="rounded-full border border-room-line px-2.5 py-0.5 font-mono text-xs"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Планшет дома кейсов: что изменилось у клиента */
function casesResults(cases: CaseStudy[], lang: Lang) {
  return (
    <div data-room-slate-results>
      <SlotLabel>{pick(UI.cvResult, lang)}</SlotLabel>
      <ul className="mt-3 space-y-3">
        {cases.map((item) => (
          <li key={item.id}>
            <p className="text-sm font-medium">{say(item.title, lang)}</p>
            <p className="mt-0.5 text-sm text-room-muted">{say(item.result, lang)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Планшет дома технологий: честный уровень владения по пунктам */
function levelsSlate(stack: Skill[], lang: Lang) {
  return (
    <div data-room-slate-levels>
      <SlotLabel>{pick(LABELS.levels, lang)}</SlotLabel>
      <dl className="mt-3 space-y-2">
        {stack.map((skill) => (
          <div key={skill.name} className="flex flex-wrap items-baseline justify-between gap-x-4">
            <dt className="text-sm font-medium">{skill.name}</dt>
            <dd className="font-mono text-xs text-room-muted">
              {pick(LEVEL_LABEL[skill.level], lang)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Стена: одна крупная мысль — «о себе» или тезис о подходе */
function statementWall(text: Localized, lang: Lang) {
  return (
    <p data-room-wall-statement className="max-w-[40ch] text-pretty font-display text-xl font-bold leading-snug tracking-tight">
      {say(text, lang)}
    </p>
  );
}

/** Полка дома «о себе»: контакты ссылками */
function contactsShelf(contacts: Contact[], lang: Lang) {
  return (
    <div data-room-shelf-contacts>
      <SlotLabel>{pick(UI.cvContacts, lang)}</SlotLabel>
      <ul className="mt-3 space-y-2">
        {contacts.map((contact) => (
          <li key={contact.href}>
            <a href={contact.href} className="text-sm underline decoration-room-line hover:decoration-accent">
              {contact.value}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Комната без единого заполненного слота — это `null`, дом не открывается */
function orNull(config: RoomConfig): RoomConfig | null {
  return config.wall || config.shelf || config.slate ? config : null;
}

/**
 * Контент комнаты дома. `null` — контента ещё нет, дом не открывается.
 *
 * Как слоты наполнятся, когда придёт контент от владельца (раздел 4.1
 * концепта, таблица «снаружи / внутри»); требования записаны в
 * `docs/нужны-ассеты.md`:
 *
 *   experience — wall: где и кем работал; slate: таймлайн с датами.
 *   cases      — wall: скриншот «было/стало», задача клиента и решение;
 *                shelf: чем сделано; slate: результат. Плюс переключение
 *                между кейсами внутри комнаты (этап Э7).
 *   tech       — wall: тезис о подходе; shelf: стек тегами;
 *                slate: честный уровень владения по пунктам.
 *   about      — wall: почему фронтенд и куда дальше; shelf: контакты и
 *                ссылки; slate: PDF и короткие факты.
 *
 * Остальные остановки комнаты не получают по замыслу: `skills` — плоская
 * галерея (раздел 4.3), `minigame` играется у дороги, `fork` — боковая сцена,
 * `hero` и `outro` — вход и конец маршрута.
 */
export function roomFor(stopId: string, lang: Lang): RoomConfig | null {
  const { about, approach, stack, jobs, cases, contacts } = profile;

  switch (stopId) {
    case "experience":
      // Полка трофеев есть всегда — это единственные факты, что уже в проекте.
      // Стена и планшет ждут места работы в `profile.jobs`: пока их нет, оба
      // слота пустые и комната показывает только полку
      return {
        wall: jobs.length > 0 ? jobsWall(jobs, lang) : null,
        shelf: trophyShelf(lang),
        slate: jobs.length > 0 ? jobsTimeline(jobs, lang) : null,
      };

    case "cases":
      return orNull({
        wall: cases.length > 0 ? casesWall(cases, lang) : null,
        shelf: caseStack(cases).length > 0 ? stackShelf(caseStack(cases), lang) : null,
        slate: cases.length > 0 ? casesResults(cases, lang) : null,
      });

    case "tech":
      return orNull({
        wall: approach ? statementWall(approach, lang) : null,
        shelf: stack.length > 0 ? stackShelf(stack.map((skill) => skill.name), lang) : null,
        slate: stack.length > 0 ? levelsSlate(stack, lang) : null,
      });

    case "about":
      // Планшет «PDF и короткие факты» в модели пока не заведён: коротких
      // фактов (город, занятость, языки) владелец ещё не называл
      return orNull({
        wall: about ? statementWall(about, lang) : null,
        shelf: contacts.length > 0 ? contactsShelf(contacts, lang) : null,
        slate: null,
      });

    default:
      return null;
  }
}
