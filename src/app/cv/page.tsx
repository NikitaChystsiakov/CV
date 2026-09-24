import type { Metadata } from "next";
import type { ReactNode } from "react";

import { UI } from "@/lib/content";
import type { Localized } from "@/lib/i18n";
import {
  awardTrophies,
  educationTrophies,
  jobPeriod,
  LEVEL_LABEL,
  profile,
  type SkillLevel,
} from "@/lib/profile";
import type { Trophy } from "@/lib/trophies";

import { Say, Shot } from "./say";

/**
 * Резюме одним экраном — быстрый путь для нанимающего, без прогулки по городку.
 *
 * Отдельная страница, а не режим главной: ссылку можно кинуть рекрутеру
 * напрямую, страница серверная и почти без клиентского JS, и она же — печатная
 * версия резюме (`@media print` в `globals.css`).
 *
 * Порядок разделов — по разделу 1 концепта: нанимают за кейсы, поэтому они
 * сразу под именем, потом стек, опыт, образование и награды, контакты.
 * Все факты — из `src/lib/profile.ts` и `src/lib/trophies.ts`, тех же файлов,
 * из которых наполняются комнаты домов. Раздел без фактов не рендерится вовсе,
 * даже заголовком: «ничего недоделанного на виду». Тексты `summary` из
 * `route.ts` сюда не попадают — это служебные заметки к вывескам.
 */

// Сервер языка посетителя не знает (он в sessionStorage), поэтому метаданные
// русские, как и у главной. openGraph задан целиком: метаданные сегментов
// сливаются неглубоко, и частичный объект затёр бы тип и локаль из layout.
// Картинку карточки этот объект тоже затирает — её возвращает соседний
// `opengraph-image.tsx`, та же картинка городка
export const metadata: Metadata = {
  title: UI.cvMetaTitle.ru,
  description: UI.cvMetaDescription.ru,
  openGraph: {
    type: "profile",
    title: UI.cvMetaTitle.ru,
    description: UI.cvMetaDescription.ru,
    locale: "ru_RU",
  },
  twitter: {
    card: "summary_large_image",
    title: UI.cvMetaTitle.ru,
    description: UI.cvMetaDescription.ru,
  },
};

/** Порядок ступеней в разделе стека: сначала то, чем работаю каждый день */
const LEVEL_ORDER: SkillLevel[] = ["daily", "confident", "familiar"];

export default function CvPage() {
  const { about, stack, jobs, cases, contacts } = profile;
  const education = educationTrophies();
  const awards = awardTrophies();

  const levels = LEVEL_ORDER.map((level) => ({
    level,
    names: stack.filter((skill) => skill.level === level).map((skill) => skill.name),
  })).filter((group) => group.names.length > 0);

  return (
    <main
      id="cv"
      data-cv-page
      className="iso-grid min-h-svh px-4 pb-24 pt-28 sm:px-8 sm:pt-36 print:bg-none print:p-0"
    >
      <div className="mx-auto max-w-3xl">
        <header data-cv-hero className="pb-12 sm:pb-16 print:pb-8">
          <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl print:text-4xl">
            <Say text={UI.name} />
          </h1>
          <p className="mt-3 text-lg text-muted sm:text-xl">
            <Say text={UI.role} />
          </p>
          {about && (
            <p className="mt-8 max-w-[62ch] text-pretty text-base leading-relaxed sm:text-lg">
              <Say text={about} />
            </p>
          )}
        </header>

        {cases.length > 0 && (
          <Section id="cases" title={UI.cvCases}>
            <div className="space-y-12">
              {cases.map((item) => (
                <article key={item.id} className="print:break-inside-avoid">
                  <h3 className="text-balance font-display text-lg font-bold tracking-tight">
                    <Say text={item.title} />
                  </h3>
                  <dl className="mt-4 space-y-3">
                    <Fact label={UI.cvTask} text={item.task} />
                    <Fact label={UI.cvSolution} text={item.solution} />
                    <Fact label={UI.cvResult} text={item.result} />
                  </dl>
                  {item.stack.length > 0 && (
                    <p className="mt-4 font-mono text-xs text-muted">{item.stack.join(" · ")}</p>
                  )}
                  {item.shots[0] && (
                    <Shot
                      {...item.shots[0]}
                      className="mt-5 h-auto w-full rounded-lg border border-line print:hidden"
                    />
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      className="mt-3 inline-block font-mono text-xs text-accent underline decoration-line hover:decoration-accent"
                    >
                      {item.url.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </article>
              ))}
            </div>
          </Section>
        )}

        {levels.length > 0 && (
          <Section id="stack" title={UI.cvStack}>
            <dl className="space-y-3">
              {levels.map(({ level, names }) => (
                <div key={level} className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
                  <dt className="font-mono text-xs uppercase tracking-[0.14em] text-muted sm:pt-1">
                    <Say text={LEVEL_LABEL[level]} />
                  </dt>
                  <dd>{names.join(", ")}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {jobs.length > 0 && (
          <Section id="jobs" title={UI.cvJobs}>
            <ol className="space-y-8">
              {jobs.map((job) => (
                <li key={job.id} className="print:break-inside-avoid">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">
                      <Say text={job.place} />
                      <span className="text-muted">
                        {" · "}
                        <Say text={job.role} />
                      </span>
                    </p>
                    <p className="font-mono text-xs tabular-nums text-muted">
                      <Say text={jobPeriod(job)} />
                    </p>
                  </div>
                  {job.did.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-pretty marker:text-line">
                      {job.did.map((line, index) => (
                        <li key={index}>
                          <Say text={line} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Учёба и спорт — отдельными разделами: под общим заголовком шахматы
            читались как продолжение образования, а это разные вопросы
            нанимающего («что закончил» и «какой человек») */}
        {education.length > 0 && (
          <Section id="education" title={UI.cvEducation}>
            <TrophyList items={education} />
          </Section>
        )}

        {awards.length > 0 && (
          <Section id="awards" title={UI.cvAwards}>
            <TrophyList items={awards} />
          </Section>
        )}

        {contacts.length > 0 && (
          <Section id="contacts" title={UI.cvContacts}>
            <ul className="space-y-2">
              {contacts.map((contact) => (
                <li key={contact.href}>
                  <a
                    href={contact.href}
                    className="underline decoration-line underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
                  >
                    {contact.value}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </main>
  );
}

/**
 * Раздел резюме: заголовок слева узкой колонкой, содержимое справа. Так
 * резюме пробегается глазами сверху вниз по заголовкам, как оглавление.
 * На узком экране колонки складываются в одну.
 */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: Localized;
  children: ReactNode;
}) {
  return (
    <section
      data-cv-section={id}
      aria-labelledby={`cv-${id}`}
      className="grid gap-4 border-t border-line py-10 sm:grid-cols-[11rem_1fr] sm:gap-10 print:py-6"
    >
      <h2
        id={`cv-${id}`}
        className="text-balance font-display text-sm font-bold leading-snug tracking-tight sm:pt-0.5 print:break-after-avoid"
      >
        <Say text={title} />
      </h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Часть кейса: задача, решение, результат — подпись и текст */
function Fact({ label, text }: { label: Localized; text: Localized }) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        <Say text={label} />
      </dt>
      <dd className="mt-1 max-w-[62ch] text-pretty">
        <Say text={text} />
      </dd>
    </div>
  );
}

/** Трофеи из `trophies.ts`: название и одна строка фактов */
function TrophyList({ items, className = "" }: { items: Trophy[]; className?: string }) {
  return (
    <ul className={`space-y-5 ${className}`}>
      {items.map((trophy) => (
        <li key={trophy.id} data-cv-trophy={trophy.id} className="print:break-inside-avoid">
          <p className="font-medium">
            <Say text={trophy.title} />
          </p>
          <p className="mt-0.5 max-w-[62ch] text-pretty text-muted">
            <Say text={trophy.summary} />
          </p>
        </li>
      ))}
    </ul>
  );
}
