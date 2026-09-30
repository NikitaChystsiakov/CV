"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { UI } from "@/lib/content";
import { dashes, type Lang } from "@/lib/i18n";
import { townSize } from "@/lib/town";
import { trophyByLandmark } from "@/lib/trophies";
import { unlock, VOLLEYBALL_ACHIEVEMENT } from "@/lib/unlocked";
import { useLang } from "@/lib/use-lang";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

import { BALL_BOX, BallArt, SHADOW_BOX } from "./ball";
import { ballCenter, COURT, ground, percent, REST } from "./court";
import type { VolleyControls } from "./game";

/**
 * Код игры — отдельный чанк. Он запрашивается, только когда площадка
 * подъехала к экрану (наблюдатель ниже), а до тех пор на месте стоит
 * статичный корт с мячом: посетитель, который до волейбола не доскроллил,
 * не платит за игру ни байтом.
 */
const VolleyGame = dynamic(() => import("./game"), { ssr: false });

/** Сколько розыгрышей подряд нужно выиграть (дублирует WIN_STREAK из game.tsx:
    импорт значения затащил бы код игры в основной бандл) */
const WIN_STREAK = 3;

/** Запас, с которым начинаем грузить игру: примерно экран до площадки */
const PRELOAD_MARGIN = "600px 0px";

type Announcement = "start" | "won" | "lost" | "stopped" | "victory" | null;

/**
 * Волейбольная площадка у дороги с мини-игрой «Держи мяч».
 *
 * Самодостаточна: корт из ассета владельца, мяч, кнопка запуска, счёт и
 * всплывашка с подписью трофея после победы. Себя по маршруту не ставит —
 * обёртка снаружи (`absolute z-30 hidden xl:block` и `translate(-50%, -50%)`
 * в точке площадки); размер — в масштабе городка, через `townSize`.
 *
 * Игра начинается только по явному действию: кнопка «Сыграть» кликом, тапом
 * или пробелом/Enter из фокуса. Пока игры нет, площадка ничего не
 * перехватывает — колесо и свайп над ней листают страницу как обычно. Во
 * время игры клик и тап по корту — удар; пробел и Enter бьют, пока фокус на
 * кнопке (она же становится кнопкой удара).
 *
 * Со сниженным движением игры нет: статичный корт, мяч у задней линии и кнопка,
 * которая сразу открывает подпись трофея.
 *
 * `assist` — упрощённый соперник для детерминированной проверки; его
 * передаёт только dev-страница превью.
 */
export function VolleyballLandmark({ assist = false }: { assist?: boolean }) {
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();

  const holder = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const controls = useRef<VolleyControls | null>(null);
  const wantStart = useRef(false);
  const lastKeyHit = useRef(0);

  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [streak, setStreak] = useState(0);
  const [open, setOpen] = useState(false);
  const [earned, setEarned] = useState(false);
  const [said, setSaid] = useState<Announcement>(null);

  // Грузим игру заранее, на подъезде: к моменту, когда площадка в кадре,
  // чанк уже на месте. Со сниженным движением игра не грузится вовсе
  useEffect(() => {
    const el = holder.current;
    if (!el || reduced || near) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true);
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, near]);

  // Всплывашка закрывается по Escape (фокус возвращается на кнопку) и по
  // клику мимо неё — как у шахматной площадки
  useEffect(() => {
    if (!open) return;

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointer = (event: globalThis.PointerEvent) => {
      if (holder.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const start = useCallback(() => {
    setOpen(false);
    setStreak(0);
    setSaid("start");
    setPlaying(true);
    // Фокус — на кнопку, она же кнопка удара: пробел дальше бьёт по мячу,
    // даже если игру запустили мышью (Safari по клику кнопку не фокусирует)
    trigger.current?.focus({ preventScroll: true });
    if (controls.current) controls.current.start();
    else {
      // Нажали раньше, чем доехал чанк: стартуем, как только он загрузится
      wantStart.current = true;
      setNear(true);
    }
  }, []);

  const stop = useCallback(() => {
    wantStart.current = false;
    controls.current?.stop();
    setPlaying(false);
    setStreak(0);
    setSaid("stopped");
  }, []);

  // Escape останавливает игру, если фокус на площадке. Чужой Escape — закрыть
  // дом, палитру, разбор — партию не трогает: слушатели висят на одном
  // document, и остановить их друг от друга нельзя. Пробел так не ловим:
  // вне кнопки он листает страницу, и отбирать его у посетителя нельзя
  useEffect(() => {
    if (!playing) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!holder.current?.contains(document.activeElement)) return;
      stop();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [playing, stop]);

  const onReady = useCallback(() => {
    setReady(true);
    if (wantStart.current) {
      wantStart.current = false;
      controls.current?.start();
    }
  }, []);

  const onPoint = useCallback((won: boolean, next: number) => {
    setStreak(next);
    setSaid(won ? "won" : "lost");
  }, []);

  const onWin = useCallback(() => {
    setPlaying(false);
    // unlock() сам отвечает «впервые или уже было»: повторная победа ачивку
    // не дублирует, но подпись трофея показывает снова
    setEarned(unlock(VOLLEYBALL_ACHIEVEMENT));
    setSaid("victory");
    setOpen(true);
  }, []);

  const onButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (reduced) {
      setOpen((value) => !value);
      return;
    }
    if (!playing) {
      start();
      return;
    }
    // Во время игры удар мышью и пальцем уже засчитан на pointerdown корта,
    // а клавиатурный — на keydown. Сюда доходит только активация без того и
    // другого: например, из экранного диктора
    const fromKey = performance.now() - lastKeyHit.current < 1000;
    if (event.detail === 0 && !fromKey) controls.current?.hit();
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (reduced || !playing) return;
    if (event.key !== " " && event.key !== "Enter") return;
    // Удар — на keydown, а не на click: у пробела click приходит на отпускании,
    // и лишние ~100 мс в игре на время чувствуются
    event.preventDefault();
    if (event.repeat) return;
    lastKeyHit.current = performance.now();
    controls.current?.hit();
  };

  // Удар мышью и пальцем — на pointerdown, и по корту, и по самой кнопке:
  // click приходит на отпускании, а в игре на время это заметная задержка
  const onPointerHit = (event: PointerEvent<HTMLElement>) => {
    if (reduced || !playing || event.button !== 0) return;
    controls.current?.hit();
    // Клик по корту снял бы фокус с кнопки, и следующий пробел листал бы
    // страницу вместо удара: игра идёт — фокус остаётся на кнопке удара
    if (event.currentTarget !== trigger.current) trigger.current?.focus({ preventScroll: true });
  };

  const trophy = trophyByLandmark("volleyball");
  const title = trophy.title[lang];
  const summary = dashes(trophy.summary[lang], lang);

  const buttonText = reduced ? UI.volleyTrophy : playing ? UI.volleyHit : UI.volleyPlay;
  const buttonLabel = reduced
    ? `${title}: ${UI.more[lang]}`
    : playing
      ? UI.volleyHitLabel[lang]
      : UI.volleyPlayLabel[lang];

  // Победу диктор читает вместе с подписью трофея: всплывашку он сам не заметит
  const announcement =
    said === "victory" ? `${UI.volleyAchievement[lang]}. ${title}: ${summary}` : announce(said, streak, lang);

  // Статичный мяч — до того, как подъехал код игры (и всегда со сниженным
  // движением). Дальше мяч рисует игра, в той же точке
  const rest = ballCenter(REST);
  const restGround = ground(REST.u, REST.v);

  return (
    <div
      ref={holder}
      data-landmark="volleyball"
      className="relative select-none"
      // manipulation: без задержки двойного тапа, но вертикальная прокрутка
      // пальцем над кортом остаётся за страницей — и в игре, и вне её
      style={{ width: townSize(COURT.display), maxWidth: "100%", touchAction: "manipulation" }}
    >
      <div
        className={playing ? "relative cursor-pointer" : "relative"}
        onPointerDown={onPointerHit}
        // Иначе mousedown по корту уведёт фокус с кнопки уже после
        // pointerdown — и вернуть его там не получится
        onMouseDown={playing ? (event) => event.preventDefault() : undefined}
      >
        <div
          aria-hidden
          className="absolute inset-x-[6%] bottom-[2%] -z-10 h-[16%]"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 45%, transparent), transparent)",
          }}
        />
        <Image
          src={COURT.src}
          alt=""
          width={COURT.width}
          height={COURT.height}
          sizes={`${COURT.display}px`}
          draggable={false}
          className="scene-art h-auto w-full select-none"
        />

        {(!ready || reduced) && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ ...percent(restGround.x, restGround.y), ...SHADOW_BOX }}
            />
            <div
              data-volley-ball
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ ...percent(rest.x, rest.y), ...BALL_BOX }}
            >
              <BallArt />
            </div>
          </div>
        )}

        {near && !reduced && (
          <VolleyGame
            assist={assist}
            controlsRef={controls}
            onReady={onReady}
            onPoint={onPoint}
            onWin={onWin}
          />
        )}
      </div>

      <div className="absolute left-1/2 top-full mt-1 flex -translate-x-1/2 flex-col items-center gap-1 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <button
            ref={trigger}
            type="button"
            data-volley-start
            aria-label={buttonLabel}
            aria-expanded={reduced ? open : undefined}
            onClick={onButtonClick}
            onPointerDown={onPointerHit}
            onKeyDown={onButtonKey}
            className="cursor-pointer rounded-full border border-line bg-surface/90 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink shadow-sm shadow-ink/5 transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {buttonText[lang]}
          </button>

          {!reduced && (
            <span data-volley-score={streak} aria-hidden className="flex items-center gap-1">
              {Array.from({ length: WIN_STREAK }, (_, i) => (
                <span
                  key={i}
                  className={`size-1.5 rounded-full transition-colors ${i < streak ? "bg-accent" : "bg-line"}`}
                />
              ))}
            </span>
          )}
        </div>

        {playing && (
          <p className="font-mono text-[10px] tracking-[0.08em] text-muted">{UI.volleyHint[lang]}</p>
        )}
      </div>

      {/* Счёт для экранного диктора: вежливо, только на смене розыгрыша */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <AnimatePresence>
        {open && (
          <motion.div
            data-volley-trophy
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-full z-20 mt-9 w-56 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-lg shadow-ink/5"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{title}</p>
            <p className="mt-1 text-sm text-pretty">{summary}</p>
            {earned && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                {UI.volleyAchievement[lang]}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function announce(said: Exclude<Announcement, "victory">, streak: number, lang: Lang) {
  const n = String(streak);
  switch (said) {
    case "start":
      return UI.volleySaidStart[lang];
    case "won":
      return UI.volleySaidWon[lang].replace("{n}", n);
    case "lost":
      return UI.volleySaidLost[lang];
    case "stopped":
      return UI.volleySaidStopped[lang];
    default:
      return "";
  }
}
