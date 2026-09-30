"use client";

import { AnimatePresence, motion, type PanInfo, type Variants } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { PanelOverlay } from "@/components/skills/house-panel";
import { fill, useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import type { CaseStudy, Shot } from "@/lib/profile";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Экспозиция дома кейсов (блок 3). Ассет дома — галерея с картинами в рамах,
 * и внутри то же: кейс — картина на стене, рядом табличка, как в музее.
 *
 *   картина   — первый скриншот кейса в раме; клик — крупный просмотр;
 *   табличка  — название, задача → решение → результат, стек, ссылка;
 *   под ней   — остальные скриншоты кейса маленькими рамами;
 *   внизу     — все кейсы рядком маленьких картин: где я и что ещё есть.
 *
 * Листать — стрелками на экране, стрелками клавиатуры и свайпом по картине.
 * Крупный просмотр — второй слой панели (`PanelOverlay`): внутри те же
 * стрелки и свайп, Escape закрывает сначала его, потом дом.
 *
 * Скриншоты — только настоящие (`Shot` в `profile.ts`). Кадр картины —
 * 16:10, скриншот вписывается в него обрезкой сверху (`object-top`): шапка
 * сайта в кадре важнее подвала. Целиком он виден в крупном просмотре.
 *
 * Контракт для проверок (`scripts/verify/b3-houses.mjs`):
 *   [data-case-gallery] [data-case="<id>"][data-case-index]
 *   [data-case-prev] [data-case-next] [data-case-shot-open]
 *   [data-case-lightbox][data-case-shot-index] [data-case-lightbox-close]
 */

const SLIDE: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: 32 * direction }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: -32 * direction }),
};

/** Порог свайпа, px: смещение плюс доля скорости, чтобы короткий бросок тоже считался */
const SWIPE = 80;

export function CasesGallery({ cases }: { cases: CaseStudy[] }) {
  const say = useSay();
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [shot, setShot] = useState<number | null>(null);

  const total = cases.length;
  const current = cases[Math.min(index, total - 1)];

  const galleryRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (step: number) => {
      if (total < 2) return;
      // Фокус внутри уходящего кейса (картина, ссылка) пропал бы вместе с ним
      // и упал на body — клавиатура потеряла бы место. Переводим его на
      // экспозицию: она остаётся, и следующий Tab идёт по новому кейсу
      const gallery = galleryRef.current;
      const active = document.activeElement;
      if (gallery && active && gallery.querySelector("[data-case]")?.contains(active)) {
        gallery.focus({ preventScroll: true });
      }
      setDirection(step);
      setIndex((value) => (value + step + total) % total);
    },
    [total],
  );

  const goShot = useCallback(
    (step: number) => {
      const count = current?.shots.length ?? 0;
      if (count < 2) return;
      setShot((value) => (value === null ? value : (value + step + count) % count));
    },
    [current],
  );

  // Стрелки клавиатуры листают, где бы ни стоял фокус внутри дома: открытый
  // крупный просмотр — скриншоты, иначе — кейсы. Escape здесь не ловится, им
  // распоряжается панель дома
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      if (shot !== null) goShot(step);
      else go(step);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, goShot, shot]);

  // Фокус возвращается на картину, открывшую крупный просмотр, когда слой снят
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (shot !== null || !returnTo.current) return;
    returnTo.current.focus({ preventScroll: true });
    returnTo.current = null;
  }, [shot]);

  const openShot = (at: number, opener: HTMLElement) => {
    returnTo.current = opener;
    setShot(at);
  };
  const closeShot = useCallback(() => setShot(null), []);

  if (!current) return null;

  const [cover, ...rest] = current.shots;

  return (
    <div ref={galleryRef} data-case-gallery tabIndex={-1} className="mt-6 outline-none">
      <div className="flex items-center justify-between gap-4">
        <p aria-live="polite" className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          {fill(say(UI.caseOf), { n: index + 1, total })}
        </p>
        {total > 1 ? (
          <div className="flex gap-2">
            <ArrowButton data-case-prev label={say(UI.casePrev)} onClick={() => go(-1)} flip />
            <ArrowButton data-case-next label={say(UI.caseNext)} onClick={() => go(1)} />
          </div>
        ) : null}
      </div>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.article
          key={current.id}
          data-case={current.id}
          data-case-index={index}
          custom={direction}
          variants={SLIDE}
          initial={reduced ? false : "enter"}
          animate="center"
          exit={reduced ? undefined : "exit"}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className={`mt-4 grid gap-6 lg:gap-10 ${cover ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : ""}`}
        >
          {cover ? (
            <figure className="min-w-0">
              <Swipe onPrev={() => go(-1)} onNext={() => go(1)} enabled={total > 1}>
                <button
                  type="button"
                  data-case-shot-open
                  aria-haspopup="dialog"
                  aria-label={fill(say(UI.caseShotOpen), { alt: say(cover.alt) })}
                  onClick={(event) => openShot(0, event.currentTarget)}
                  className="case-frame block w-full cursor-zoom-in rounded-sm"
                >
                  <span className="relative block aspect-[16/10] overflow-hidden">
                    <Image
                      src={cover.src}
                      alt={say(cover.alt)}
                      fill
                      sizes="(min-width: 1024px) 620px, 92vw"
                      className="object-cover object-top"
                      draggable={false}
                    />
                  </span>
                </button>
              </Swipe>
              {rest.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-3">
                  {rest.map((item, restIndex) => (
                    <li key={item.src}>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-label={fill(say(UI.caseShotOpen), { alt: say(item.alt) })}
                        onClick={(event) => openShot(restIndex + 1, event.currentTarget)}
                        className="case-frame case-frame--small block w-24 cursor-zoom-in rounded-sm sm:w-28"
                      >
                        <span className="relative block aspect-[16/10] overflow-hidden">
                          <Image src={item.src} alt="" fill sizes="112px" className="object-cover object-top" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </figure>
          ) : null}

          <div data-case-plaque className="min-w-0">
            <h3 className="text-balance font-display text-xl font-bold tracking-tight sm:text-2xl">
              {say(current.title)}
            </h3>
            <dl className="mt-5 space-y-4 text-sm leading-relaxed">
              <Fact label={say(UI.cvTask)}>{say(current.task)}</Fact>
              <Fact label={say(UI.cvSolution)}>{say(current.solution)}</Fact>
              <Fact label={say(UI.cvResult)} accent>
                {say(current.result)}
              </Fact>
            </dl>
            {current.stack.length > 0 ? (
              <ul aria-label={say(UI.cvStack)} className="mt-5 flex flex-wrap gap-2">
                {current.stack.map((name) => (
                  <li key={name} className="demo-chip rounded-full px-2.5 py-0.5 font-mono text-xs">
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
            {current.url ? (
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                data-case-link
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
              >
                {say(UI.caseLink)}
                <span aria-hidden>↗</span>
              </a>
            ) : null}
          </div>
        </motion.article>
      </AnimatePresence>

      {/* Вся экспозиция рядком маленьких картин. Выбор — без стрелок: клик
          ведёт прямо к кейсу. Кейс без скриншота — рама с названием */}
      {total > 1 ? (
        <nav aria-label={say(UI.caseList)} className="mt-8 border-t border-line pt-5">
          <ul className="flex flex-wrap gap-3">
            {cases.map((item, itemIndex) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-case-pick={item.id}
                  aria-current={itemIndex === index ? "true" : undefined}
                  aria-label={say(item.title)}
                  onClick={() => {
                    if (itemIndex === index) return;
                    setDirection(itemIndex > index ? 1 : -1);
                    setIndex(itemIndex);
                  }}
                  className="case-frame case-frame--small case-pick block w-20 rounded-sm sm:w-24"
                >
                  <span className="relative block aspect-[16/10] overflow-hidden">
                    {item.shots[0] ? (
                      <Image
                        src={item.shots[0].src}
                        alt=""
                        fill
                        sizes="96px"
                        className="object-cover object-top"
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center p-1 text-center text-[10px] leading-tight">
                        {say(item.title)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {shot !== null && current.shots[shot] ? (
        <Lightbox
          shots={current.shots}
          at={shot}
          onStep={goShot}
          onClose={closeShot}
        />
      ) : null}
    </div>
  );
}

/** Строка таблички: подпись моно и текст. Результат — с акцентной чертой */
function Fact({ label, accent = false, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className={accent ? "border-l-2 border-accent pl-3" : ""}>
      <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">{label}</dt>
      <dd className="mt-1 max-w-[56ch] text-pretty">{children}</dd>
    </div>
  );
}

function ArrowButton({
  label,
  onClick,
  flip = false,
  ...rest
}: {
  label: string;
  onClick: () => void;
  flip?: boolean;
} & Record<`data-${string}`, boolean | string | undefined>) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="demo-chip grid size-10 place-items-center rounded-full"
      {...rest}
    >
      <svg aria-hidden viewBox="0 0 24 24" className={`size-4 ${flip ? "-scale-x-100" : ""}`} fill="none">
        <path
          d="M5 12h14M13 6l6 6-6 6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * Свайп по горизонтали. Картина тянется за пальцем с сопротивлением и
 * пружиной возвращается на место; решает смещение плюс доля скорости. После
 * перетаскивания клик по картине не должен открывать крупный просмотр —
 * поэтому клик, пришедший после сдвига, гасится на фазе захвата.
 */
function Swipe({
  onPrev,
  onNext,
  enabled = true,
  className = "",
  children,
}: {
  onPrev: () => void;
  onNext: () => void;
  enabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const moved = useRef(false);

  function onDragEnd(_: unknown, info: PanInfo) {
    const swipe = info.offset.x + info.velocity.x * 0.2;
    if (swipe <= -SWIPE) onNext();
    else if (swipe >= SWIPE) onPrev();
  }

  return (
    <motion.div
      data-case-swipe
      drag={enabled ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.35}
      dragSnapToOrigin
      onPointerDownCapture={() => {
        moved.current = false;
      }}
      onDragStart={() => {
        moved.current = true;
      }}
      onDragEnd={onDragEnd}
      onClickCapture={(event) => {
        if (!moved.current) return;
        event.stopPropagation();
        event.preventDefault();
      }}
      className={`touch-pan-y ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** Крупный просмотр скриншотов кейса: второй слой панели дома */
function Lightbox({
  shots,
  at,
  onStep,
  onClose,
}: {
  shots: Shot[];
  at: number;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const say = useSay();
  const closeRef = useRef<HTMLButtonElement>(null);
  const shot = shots[at];
  const counter = fill(say(UI.caseShotOf), { n: at + 1, total: shots.length });

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <PanelOverlay
      onClose={onClose}
      label={counter}
      data-case-lightbox=""
      className="house-overlay flex flex-col items-center justify-center gap-3 p-3 sm:p-6"
    >
      <Swipe
        onPrev={() => onStep(-1)}
        onNext={() => onStep(1)}
        enabled={shots.length > 1}
        className="relative min-h-0 w-full max-w-6xl flex-1"
      >
        <Image
          key={shot.src}
          src={shot.src}
          alt={say(shot.alt)}
          fill
          sizes="100vw"
          data-case-shot-index={at}
          className="pointer-events-none select-none object-contain"
          draggable={false}
        />
      </Swipe>
      <div className="house-sheet relative flex max-w-full items-center gap-1 rounded-full p-1.5">
        {shots.length > 1 ? (
          <ArrowButton label={say(UI.caseShotPrev)} onClick={() => onStep(-1)} flip data-case-shot-prev />
        ) : null}
        <p className="min-w-0 truncate px-2 text-xs">
          <span className="font-mono">{counter}</span>
          {/* Подпись скриншота — от 640px: на телефоне строка уже занята
              счётчиком и тремя кнопками, а alt и так у картинки */}
          <span className="hidden text-muted sm:inline"> · {say(shot.alt)}</span>
        </p>
        {shots.length > 1 ? (
          <ArrowButton label={say(UI.caseShotNext)} onClick={() => onStep(1)} data-case-shot-next />
        ) : null}
        <button
          ref={closeRef}
          type="button"
          data-case-lightbox-close
          onClick={onClose}
          aria-label={say(UI.caseShotClose)}
          className="demo-chip grid size-10 shrink-0 place-items-center rounded-full"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </PanelOverlay>
  );
}
