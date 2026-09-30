"use client";

import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Achievements } from "@/components/achievements";
import { CommandPaletteTrigger } from "@/components/command-palette";
import { LanguageToggle } from "@/components/language-toggle";
import { RouteMenu } from "@/components/route/route-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { UI } from "@/lib/content";
import { RESUME_PDF_READY } from "@/lib/flags";
import { useLang } from "@/lib/use-lang";
import { routeStops } from "@/lib/route";

/**
 * Верхняя панель маршрута.
 *
 * Слева имя и роль, в центре — где ты сейчас находишься на маршруте, справа
 * быстрый путь, PDF, язык и тема. По самому верху идёт тонкая линия прогресса —
 * она одна и показывает, сколько пройдено: процент рядом с ней и номер
 * остановки дублировали то же самое числами, и нумерация расползлась по
 * четырём местам сразу.
 *
 * Панель живёт в корневом layout и поэтому стоит и на `/cv` — резюме одним
 * экраном. Там маршрута нет: прогресс, «где мы» и меню остановок пропадают, а
 * кнопка «CV» меняется на «В город» — на то же место, чтобы обратная дорога
 * была там же, где прямая. При печати панели нет вовсе.
 */

/** Общий вид кнопок панели: ссылка PDF и skip-link выглядят одинаково */
const PILL =
  "flex h-9 items-center rounded-full border border-line bg-surface/80 px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink backdrop-blur transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Тот же вид для двухбуквенной подписи — кружок, как у переключателя языка */
const PILL_ROUND = PILL.replace("px-3", "min-w-9 justify-center px-2.5");

export function Hud() {
  const { lang } = useLang();
  const onCv = usePathname() === "/cv";
  const { scrollYProgress } = useScroll();
  const [stopIndex, setStopIndex] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    // Номер остановки меняется считанные разы за весь маршрут — здесь состояние
    // уместно, но обновлять его стоит только когда он действительно другой
    const next = Math.min(
      routeStops.length - 1,
      Math.floor(value * routeStops.length),
    );
    setStopIndex((current) => (current === next ? current : next));
  });

  const current = routeStops[stopIndex];

  // Адрес следует за маршрутом: ссылку «/#skills» можно отправить прямо на
  // дом (приезд по ней — deep-link.tsx). replaceState, а не новая запись в
  // истории: кнопка «назад» не должна листать остановки. Первый проход
  // пропускаем — на загрузке адрес задаёт посетитель, а не панель
  const settled = useRef(false);
  useEffect(() => {
    if (onCv) return;
    if (!settled.current) {
      settled.current = true;
      return;
    }
    const hash = stopIndex === 0 ? "" : `#${current.id}`;
    if (window.location.hash === hash) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
  }, [current.id, onCv, stopIndex]);

  return (
    <header data-hud className="pointer-events-none fixed inset-x-0 top-0 z-50 print:hidden">
      {/* Линия прогресса по самому верху экрана. На /cv маршрута нет — и
          прогресса нет: место под линию остаётся, чтобы панель не прыгала */}
      <motion.div
        aria-hidden
        style={{ scaleX: onCv ? 0 : scrollYProgress }}
        className="h-0.5 origin-left bg-accent"
      />

      {/* Первый фокусируемый элемент страницы: с клавиатуры маршрут начинается
          сразу, минуя кнопки панели. Без фокуса уведён за верхний край экрана
          трансформом (а не `display: none` — иначе фокус на него не встанет),
          по фокусу выезжает поверх панели на место имени. */}
      <a
        href={onCv ? "#cv" : "#route"}
        data-skip-link
        className={`${PILL} pointer-events-auto absolute left-4 top-1.5 z-10 translate-y-[-200%] opacity-0 transition-[transform,opacity] focus-visible:translate-y-0 focus-visible:opacity-100 sm:left-8`}
        // Непрозрачный фон: ссылка ложится на имя в панели, сквозь
        // полупрозрачную подложку оно просвечивало
        style={{ background: "var(--color-surface)" }}
      >
        {onCv ? UI.skipToCv[lang] : UI.skipToRoute[lang]}
      </a>

      {/* Узкий экран — самое тесное место: имя, меню, CV, язык и тема в одну
          строку. Поля, зазоры и кегль имени ужаты ровно настолько, чтобы на
          390px английское имя (оно длиннее) не уходило на вторую строку, а на
          360px — русское и английское с кеглем поменьше. Проверяет verify */}
      <div className="flex items-center justify-between gap-3 border-b border-line/60 bg-bg/70 px-4 py-3 backdrop-blur sm:gap-4 sm:px-8">
        <div className="pointer-events-auto flex items-baseline gap-2">
          <span className="font-display text-xs font-bold tracking-tight min-[380px]:text-[13px] sm:text-sm">
            {UI.name[lang]}
          </span>
          <span className="hidden text-xs text-muted sm:inline">
            {UI.role[lang]}
          </span>
        </div>

        {/* Где мы сейчас на маршруте */}
        {!onCv && (
          <p className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-muted lg:block">
            {current.title[lang]}
          </p>
        )}

        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-3">
          {!onCv && <RouteMenu activeIndex={stopIndex} />}

          {/* Быстрый путь для нанимающего: резюме одним экраном. На самой /cv
              на этом месте обратная дорога в город. Подпись короткая намеренно:
              на 390px в панели уже имя, меню, язык и тема */}
          {onCv ? (
            <Link href="/" data-town-link title={UI.toTownTitle[lang]} className={PILL}>
              {UI.toTown[lang]}
            </Link>
          ) : (
            <Link href="/cv" data-cv-link title={UI.cvLinkTitle[lang]} className={PILL_ROUND}>
              {UI.cvLink[lang]}
            </Link>
          )}

          {/* Резюме одним файлом: главное, ради чего сюда приходит наниматель,
              не должно требовать прогулки по всему маршруту. Кнопки нет, пока в
              public лежит заглушка — см. `flags.ts` */}
          {RESUME_PDF_READY && (
            <a
              href="/cv.pdf"
              download
              data-pdf-link
              title={UI.pdfTitle[lang]}
              className={PILL}
            >
              {UI.pdf[lang]}
            </a>
          )}

          {/* Палитра ⌘K. Кнопка — от md: на узком экране панель уже занята
              именем, меню, CV, языком и темой, а на телефоне тот же прыжок по
              остановкам даёт меню. Горячая клавиша работает на любой ширине.
              Обёртка `contents`, а не класс на кнопке: у неё свой `flex`, и
              `hidden` рядом с ним проигрывал бы по порядку утилит */}
          <span className="hidden md:contents">
            <CommandPaletteTrigger />
          </span>

          {/* Находки — от md, как палитра: на телефоне панель уже полна */}
          {!onCv && (
            <span className="hidden md:contents">
              <Achievements className={PILL} />
            </span>
          )}

          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
