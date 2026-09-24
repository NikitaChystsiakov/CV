"use client";

import { useLenis } from "lenis/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { openXray } from "@/components/xray";
import { UI } from "@/lib/content";
import { dashes, type Lang } from "@/lib/i18n";
import { routeStops } from "@/lib/route";
import { MINIGAME_ACHIEVEMENT, MINIGAME_MASTER, unlock } from "@/lib/unlocked";
import { useLang } from "@/lib/use-lang";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

import { PieceFace } from "./piece-face";
import {
  BOARD_H,
  BOARD_PAD,
  BOARD_W,
  BUGS,
  PHONE_FRAME,
  PIECES,
  isBug,
  mg,
  slotOf,
  type BugId,
  type Level,
  type Piece,
  type PieceId,
  type Rect,
} from "./pieces";

/**
 * Мини-игра «Собери интерфейс» (раздел 6 концепта, этап Э9).
 *
 * Четыре блока в лотке, четыре слота в макете. Блок тащится указателем —
 * мышь, перо и палец идут одним кодом через Pointer Events, отдельной ветки
 * под тач нет. Отпустил рядом со слотом — магнит сажает блок на место; слот
 * чужой — блок мягко едет обратно в лоток, а слот качает головой.
 *
 * Игра никогда не держит маршрут: колесо над ней крутит страницу (обработчика
 * колеса здесь нет вовсе), палец вне блоков листает как обычно, а «Пропустить»
 * стоит в первой строке с первого кадра.
 *
 * Клавиатура — та же игра без перетаскивания: Enter или пробел на блоке берут
 * его, то же на слоте — кладут. Мышью так тоже можно: щелчок по блоку, щелчок
 * по месту. Каждый шаг объявляется строкой состояния (`role="status"`).
 *
 * Движение — только transform и opacity, через Web Animations: полёт блока в
 * слот (FLIP), возврат в лоток, «нет» слота и финальная волна. При
 * `prefers-reduced-motion` ни одна из них не запускается — блок просто
 * оказывается на месте, игра работает так же.
 *
 * Раундов три, доска одного размера во всех (остановка не меняет высоту):
 *   1. сбор страницы — как было с Э9, ачивка «Верстальщик»;
 *   2. адаптив — те же блоки в макет телефона, лица блоков в компактном виде;
 *   3. «найди баг» — слева эталонный макет, справа вёрстка с тремя ошибками;
 *      найденный блок встаёт как в макете. Ачивка «Ревьюер» открывает
 *      «Разбор сайта».
 * «Собрать заново» повторяет текущий раунд, после третьего — начинает с
 * первого. Первый раунд не изменился намеренно: проверки Э9 держат его как есть.
 */

/** Насколько далеко за краем слота ещё срабатывает магнит, px. */
const MAGNET = 28;
/** Сдвиг, после которого нажатие считается перетаскиванием, а не щелчком. */
const DRAG_SLOP = 5;
/** Блок в руке чуть крупнее: он «поднят» над доской. */
const LIFT = 1.04;
/** Экспоненциальный выход — тот же, что у появления остановок. */
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

type Message =
  | { kind: "hint" }
  | { kind: "picked"; piece: PieceId }
  | { kind: "placed"; piece: PieceId; left: number }
  | { kind: "wrong"; piece: PieceId }
  | { kind: "noPick" }
  | { kind: "cancel" }
  | { kind: "bugFound"; bug: BugId; left: number }
  | { kind: "bugNone"; piece: PieceId }
  | { kind: "done"; fresh: boolean };

/**
 * Откуда блок прилетел в слот: его видимый прямоугольник на экране в момент
 * отпускания. Размер нужен второму раунду: блок из лотка крупнее места в
 * телефоне, и полёт сжимает его по пути.
 */
type Flight = { left: number; top: number; width: number; height: number };

const flightOf = (rect: DOMRect): Flight => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
});

type Drag = {
  id: PieceId;
  pointerId: number;
  startX: number;
  startY: number;
  startScroll: number;
  /** Где блок лежал в момент нажатия — без сдвига */
  origin: DOMRect;
  active: boolean;
};

const pieceOf = (id: PieceId) => PIECES.find((piece) => piece.id === id) as Piece;

function say(message: Message, lang: Lang, level: Level) {
  const fill = (template: string, piece?: PieceId, left?: number) =>
    template
      .replace("{piece}", piece ? pieceOf(piece).name[lang] : "")
      .replace("{left}", String(left ?? ""));

  const text = (() => {
    switch (message.kind) {
      case "hint":
        return [UI.mgHint, UI.mgHintPhone, UI.mgHintBugs][level][lang];
      case "picked":
        return fill(UI.mgPicked[lang], message.piece);
      case "placed":
        return fill(UI.mgPlaced[lang], message.piece, message.left);
      case "wrong":
        return fill(UI.mgWrong[lang], message.piece);
      case "noPick":
        return UI.mgNoPick[lang];
      case "cancel":
        return UI.mgCancel[lang];
      case "bugFound":
        return fill(UI.mgBugFound[lang], undefined, message.left).replace("{bug}", BUGS[message.bug].name[lang]);
      case "bugNone":
        return fill(UI.mgBugNone[lang], message.piece);
      case "done":
        if (level === 1) return UI.mgDonePhone[lang];
        if (level === 2) return UI.mgDoneBugs[lang];
        return message.fresh ? UI.mgDone[lang] : UI.mgDoneAgain[lang];
    }
  })();

  return dashes(text, lang);
}

const boxOf = (rect: Rect) => ({
  left: mg(rect.x),
  top: mg(rect.y),
  width: mg(rect.w),
  height: mg(rect.h),
});

export function Minigame() {
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const lenis = useLenis();
  const keysId = useId();

  const [placed, setPlaced] = useState<PieceId[]>([]);
  const [picked, setPicked] = useState<PieceId | null>(null);
  const [dragging, setDragging] = useState<PieceId | null>(null);
  const [target, setTarget] = useState<PieceId | null>(null);
  const [message, setMessage] = useState<Message>({ kind: "hint" });
  const [finale, setFinale] = useState<{ fresh: boolean } | null>(null);
  // Номер захода: «Собрать заново» и «Дальше» перемонтируют блоки в лотке
  const [round, setRound] = useState(0);
  const [level, setLevel] = useState<Level>(0);
  // Третий раунд: какие баги уже найдены
  const [found, setFound] = useState<BugId[]>([]);

  const rootRef = useRef<HTMLDivElement>(null);
  const pieceEls = useRef<Partial<Record<PieceId, HTMLButtonElement | null>>>({});
  const slotEls = useRef<Partial<Record<PieceId, HTMLElement | null>>>({});
  const flights = useRef<Partial<Record<PieceId, Flight>>>({});
  const bugEls = useRef<Partial<Record<PieceId, HTMLButtonElement | null>>>({});
  const drag = useRef<Drag | null>(null);
  const hovered = useRef<PieceId | null>(null);
  const suppressClick = useRef(false);
  // Куда перевести фокус после перерисовки: слот, на котором стоял фокус,
  // превращается в поставленный блок и перестаёт быть кнопкой
  const focusAfter = useRef<"next" | "again" | null>(null);

  // Следующая остановка — от собственного места в маршруте, а не хардкодом:
  // порядок остановок живёт только в route.ts
  const nextStopId = routeStops[routeStops.findIndex((stop) => stop.id === "minigame") + 1]?.id;

  useEffect(() => {
    const want = focusAfter.current;
    if (!want) return;
    focusAfter.current = null;
    if (want === "again") {
      rootRef.current?.querySelector<HTMLElement>("[data-minigame-again]")?.focus();
      return;
    }
    if (level === 2) {
      bugEls.current[PIECES[0].id]?.focus();
      return;
    }
    const next = PIECES.find((piece) => !placed.includes(piece.id));
    if (next) pieceEls.current[next.id]?.focus();
  }, [placed, round, level, finale]);

  // Финал: одна авторская волна по собранной странице и выход ачивки.
  // Волна ждёт, пока долетит последний блок, — иначе новая анимация перебила
  // бы его полёт на середине
  useEffect(() => {
    const root = rootRef.current;
    if (!finale || reduced || !root) return;

    const faces = [...root.querySelectorAll<HTMLElement>("[data-placed], [data-bug-target]")];
    const animations = faces.map((el, index) =>
      el.animate(
        [{ transform: "none" }, { transform: "translateY(-5px)" }, { transform: "none" }],
        { duration: 520, delay: 460 + index * 70, easing: EASE_OUT },
      ),
    );
    const badge = root.querySelector<HTMLElement>("[data-minigame-achievement]");
    if (badge) {
      animations.push(
        badge.animate(
          [
            { opacity: 0, transform: "translateY(6px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 480, delay: 760, easing: EASE_OUT, fill: "backwards" },
        ),
      );
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [finale, reduced]);

  // Новый заход: блоки проявляются в лотке, а не выскакивают
  useEffect(() => {
    const root = rootRef.current;
    if (round === 0 || reduced || !root) return;
    const animations = [...root.querySelectorAll<HTMLElement>("[data-block], [data-bug-target]")].map((el, index) =>
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 320,
        delay: index * 50,
        easing: EASE_OUT,
        fill: "backwards",
      }),
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [round, reduced]);

  // Полёт забирается один раз: блок, вставший в слот, читает его при монтировании
  const takeFlight = useCallback((id: PieceId) => {
    const flight = flights.current[id];
    delete flights.current[id];
    return flight;
  }, []);

  const place = (id: PieceId, flight: Flight) => {
    flights.current[id] = flight;
    const next = [...placed, id];
    setPlaced(next);
    setPicked(null);

    if (next.length < PIECES.length) {
      setMessage({ kind: "placed", piece: id, left: PIECES.length - next.length });
      return;
    }

    // Ачивка — через общий журнал сессии. `unlock` возвращает false, если она
    // уже была: повторный сбор даёт реакцию, но не вторую ачивку. У адаптива
    // своей ачивки нет — это ступенька к третьему раунду
    const fresh = level === 0 ? unlock(MINIGAME_ACHIEVEMENT) : false;
    setFinale({ fresh });
    setMessage({ kind: "done", fresh });
  };

  const refuse = (slot: PieceId, piece: PieceId) => {
    setMessage({ kind: "wrong", piece });
    if (reduced) return;
    slotEls.current[slot]?.animate(
      [
        { transform: "none" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(4px)" },
        { transform: "translateX(-2px)" },
        { transform: "none" },
      ],
      { duration: 340, easing: "ease-out" },
    );
  };

  /**
   * Магнит: слот, в зону которого попал центр блока. Зона — сам слот плюс
   * `MAGNET` с каждой стороны. Если зон несколько, берётся та, в центр
   * которой попали точнее (расстояние нормировано на размер слота — иначе
   * большая карточка перетягивала бы всё на себя).
   */
  const slotUnder = (x: number, y: number): PieceId | null => {
    let best: PieceId | null = null;
    let bestScore = Infinity;
    for (const piece of PIECES) {
      const el = slotEls.current[piece.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const reachX = r.width / 2 + MAGNET;
      const reachY = r.height / 2 + MAGNET;
      const dx = Math.abs(x - (r.left + r.width / 2)) / reachX;
      const dy = Math.abs(y - (r.top + r.height / 2)) / reachY;
      const score = Math.max(dx, dy);
      if (score <= 1 && score < bestScore) {
        best = piece.id;
        bestScore = score;
      }
    }
    return best;
  };

  const dragOffset = (d: Drag, e: ReactPointerEvent) => ({
    // Страница могла уехать под пальцем: блок держится за указатель, а не за
    // своё место в разметке
    x: e.clientX - d.startX,
    y: e.clientY - d.startY + (window.scrollY - d.startScroll),
    // Центр блока на экране — по указателю, без чтения раскладки на кадр
    cx: d.origin.left + d.origin.width / 2 + (e.clientX - d.startX),
    cy: d.origin.top + d.origin.height / 2 + (e.clientY - d.startY),
  });

  const onPointerDown = (id: PieceId) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScroll: window.scrollY,
      origin: e.currentTarget.getBoundingClientRect(),
      active: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const offset = dragOffset(d, e);

    if (!d.active) {
      if (Math.hypot(offset.x, offset.y) < DRAG_SLOP) return;
      d.active = true;
      setDragging(d.id);
      setPicked(null);
    }

    // Чтение раскладки слотов — до записи трансформа, чтобы не форсировать
    // пересчёт на каждом кадре
    const hit = slotUnder(offset.cx, offset.cy);
    // Позиция на каждый кадр — прямо в DOM, не через состояние (правило проекта)
    e.currentTarget.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)${
      reduced ? "" : ` scale(${LIFT})`
    }`;
    if (hit !== hovered.current) {
      hovered.current = hit;
      setTarget(hit);
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;

    // Щелчок, который браузер пришлёт следом за отпусканием, — не выбор блока
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);

    const el = e.currentTarget;
    const offset = dragOffset(d, e);
    const hit = cancelled ? null : slotUnder(offset.cx, offset.cy);
    hovered.current = null;
    setTarget(null);
    setDragging(null);
    el.style.transform = "";

    if (hit === d.id) {
      // Видимый прямоугольник блока в руке: он поднят масштабом вокруг центра
      const lift = reduced ? 1 : LIFT;
      const width = d.origin.width * lift;
      const height = d.origin.height * lift;
      place(d.id, {
        left: d.origin.left + (e.clientX - d.startX) - (width - d.origin.width) / 2,
        top: d.origin.top + (e.clientY - d.startY) - (height - d.origin.height) / 2,
        width,
        height,
      });
      return;
    }

    // Мимо или в чужой слот — блок едет домой от того места, где его отпустили.
    // Всю дорогу он остаётся над макетом: иначе, сняв «в руке», он проезжал
    // бы под ним
    if (!reduced) {
      el.style.zIndex = "20";
      const home = el.animate(
        [
          { transform: `translate(${offset.x}px, ${offset.y}px) scale(${LIFT})` },
          { transform: "none" },
        ],
        { duration: 480, easing: EASE_OUT },
      );
      const land = () => {
        el.style.zIndex = "";
      };
      home.onfinish = land;
      home.oncancel = land;
    }
    if (hit) refuse(hit, d.id);
  };

  const onPieceClick = (id: PieceId) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (picked === id) {
      setPicked(null);
      setMessage({ kind: "cancel" });
      return;
    }
    setPicked(id);
    setMessage({ kind: "picked", piece: id });
  };

  const onSlotClick = (slot: PieceId) => {
    if (!picked) {
      setMessage({ kind: "noPick" });
      return;
    }
    if (picked !== slot) {
      refuse(slot, picked);
      return;
    }
    const from = pieceEls.current[picked]?.getBoundingClientRect();
    focusAfter.current = placed.length + 1 === PIECES.length ? "again" : "next";
    place(picked, from ? flightOf(from) : { left: 0, top: 0, width: 0, height: 0 });
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== "Escape" || !picked) return;
    // Escape кладёт взятый блок обратно и возвращает на него фокус. Дальше
    // событие не идёт: иначе тот же Escape закрыл бы что-то ещё
    e.stopPropagation();
    const id = picked;
    setPicked(null);
    setMessage({ kind: "cancel" });
    pieceEls.current[id]?.focus();
  };

  /** Третий раунд: щелчок по блоку вёрстки. Баг — чиним, верный блок — «нет». */
  const onBugClick = (id: PieceId) => {
    if (finale) return;
    if (!isBug(id) || found.includes(id)) {
      setMessage({ kind: "bugNone", piece: id });
      if (!reduced) {
        bugEls.current[id]?.animate(
          [
            { transform: "none" },
            { transform: "translateX(-4px)" },
            { transform: "translateX(4px)" },
            { transform: "translateX(-2px)" },
            { transform: "none" },
          ],
          { duration: 340, easing: "ease-out" },
        );
      }
      return;
    }

    const el = bugEls.current[id];
    if (el) flights.current[id] = flightOf(el.getBoundingClientRect());
    const next = [...found, id];
    setFound(next);
    const left = Object.keys(BUGS).length - next.length;
    if (left > 0) {
      setMessage({ kind: "bugFound", bug: id, left });
      return;
    }
    const fresh = unlock(MINIGAME_MASTER);
    focusAfter.current = "again";
    setFinale({ fresh });
    setMessage({ kind: "done", fresh });
  };

  /** Новый заход в раунд `to`: всё сбрасывается, блоки проявляются заново. */
  const startLevel = (to: Level) => {
    setLevel(to);
    setPlaced([]);
    setFound([]);
    setFinale(null);
    setPicked(null);
    setMessage({ kind: "hint" });
    focusAfter.current = "next";
    setRound((value) => value + 1);
  };

  // После третьего раунда «заново» — это с самого начала
  const again = () => startLevel(level === 2 ? 0 : level);
  const next = () => startLevel(level === 0 ? 1 : 2);

  const skip = () => {
    if (!nextStopId) return;
    const stop = document.getElementById(nextStopId);
    if (!stop) return;
    // Без Lenis (статичный режим) — нативный мгновенный прыжок
    if (lenis) lenis.scrollTo(stop, { immediate: reduced });
    else stop.scrollIntoView({ block: "start", behavior: "instant" });
    // Фокус уходит вслед за экраном, как у ссылки «К маршруту»: иначе
    // следующий Tab вернул бы клавиатуру обратно в игру
    const heading = stop.querySelector<HTMLElement>("h2, h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  };

  const busy = Boolean(picked || dragging);

  return (
    <div
      ref={rootRef}
      data-minigame
      data-complete={finale ? "" : undefined}
      role="group"
      aria-label={UI.mgGame[lang]}
      onKeyDown={onKeyDown}
      // z-30: кликабельное на маршруте поднимается над слоями остановки
      // (грабли площадок и созвездий). Игра и так внутри блока текста, но
      // правило одно на все интерактивные детали
      className="minigame relative z-30 mt-5 text-left"
    >
      {/* Первая строка: состояние игры и «Пропустить». Высота строки
          состояния постоянная — две строки текста при любом сообщении: колонка
          остановки центрируется по высоте, и лишняя строка сдвинула бы доску
          прямо под пальцем. Поэтому и сами сообщения короткие */}
      <div className="flex items-start justify-between gap-4">
        <p
          data-minigame-status
          role="status"
          className="h-10 text-pretty text-sm leading-5 text-muted"
        >
          {say(message, lang, level)}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <LevelDots level={level} label={UI.mgLevel[lang].replace("{n}", String(level + 1))} />
        <button
          type="button"
          data-minigame-skip
          aria-label={UI.mgSkipLabel[lang]}
          onClick={skip}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink hover:border-accent hover:text-accent motion-safe:transition-colors"
        >
          {UI.mgSkip[lang]}
          <ArrowDown />
        </button>
        </div>
      </div>

      <span id={keysId} className="sr-only">
        {dashes(UI.mgKeysHint[lang], lang)}
      </span>

      <div className="minigame-board mt-3">
        {/* Лоток: блоки лежат вперемешку. После сбора на его месте —
            ачивка и «Собрать заново»: отдельного экрана результатов нет */}
        <div
          data-minigame-tray
          role="group"
          aria-label={level === 2 ? UI.mgReference[lang] : UI.mgTray[lang]}
          data-minigame-reference={level === 2 ? "" : undefined}
          className="relative shrink-0 rounded-xl bg-bg-2/60"
          style={{ width: mg(BOARD_W + BOARD_PAD * 2), height: mg(BOARD_H + BOARD_PAD * 2) }}
        >
          <div className="absolute" style={{ inset: mg(BOARD_PAD) }}>
            {/* Третий раунд: в лотке — эталон, как страница должна выглядеть.
                Это картинка для сравнения, не кнопки: скринридер получает
                подпись группы. После финала эталон уступает место ачивке */}
            {level === 2
              ? finale
                ? null
                : PIECES.map((piece) => (
                    <div
                      key={piece.id}
                      aria-hidden
                      className={`absolute ${piece.radius}`}
                      style={boxOf(piece.slot)}
                    >
                      <PieceFace id={piece.id} lang={lang} />
                    </div>
                  ))
              : PIECES.map((piece) =>
              placed.includes(piece.id) ? null : (
                <button
                  key={`${piece.id}-${round}`}
                  ref={(el) => {
                    pieceEls.current[piece.id] = el;
                  }}
                  type="button"
                  data-block={piece.id}
                  data-dragging={dragging === piece.id ? "" : undefined}
                  aria-pressed={picked === piece.id}
                  aria-label={piece.name[lang]}
                  aria-describedby={keysId}
                  onPointerDown={onPointerDown(piece.id)}
                  onPointerMove={onPointerMove}
                  onPointerUp={(e) => endDrag(e, false)}
                  onPointerCancel={(e) => endDrag(e, true)}
                  onLostPointerCapture={(e) => endDrag(e, true)}
                  onClick={() => onPieceClick(piece.id)}
                  // touch-none только на самих блоках: палец на блоке тащит
                  // его, палец мимо листает маршрут
                  className={`group/piece absolute cursor-grab touch-none select-none ${piece.radius} shadow-sm shadow-ink/5 data-[dragging]:z-20 data-[dragging]:cursor-grabbing data-[dragging]:shadow-lg data-[dragging]:shadow-ink/15 aria-pressed:-translate-y-[3px] aria-pressed:shadow-md aria-pressed:shadow-ink/10`}
                  style={boxOf(piece.tray)}
                >
                  <PieceFace id={piece.id} lang={lang} />
                  {/* Взятый с клавиатуры или щелчком блок обведён акцентом */}
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute -inset-[3px] ${piece.radius} border-2 border-accent opacity-0 group-aria-pressed/piece:opacity-100`}
                  />
                </button>
              ),
            )}
          </div>

          {finale ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              {finale.fresh ? (
                <span
                  data-minigame-achievement
                  className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink shadow-sm shadow-ink/5"
                >
                  <Star />
                  {UI.mgAchievement[lang]} ·{" "}
                  {level === 2 ? UI.mgAchievementMaster[lang] : UI.mgAchievementName[lang]}
                </span>
              ) : null}
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  data-minigame-again
                  onClick={again}
                  className={PILL}
                >
                  <Replay />
                  {level === 2 ? UI.mgRestart[lang] : UI.mgAgain[lang]}
                </button>
                {level < 2 ? (
                  <button
                    type="button"
                    data-minigame-next
                    aria-label={UI.mgNextLabel[lang]}
                    onClick={next}
                    className={`flex ${PILL_ACCENT}`}
                  >
                    {UI.mgNext[lang]}
                    <ArrowRight />
                  </button>
                ) : (
                  // Награда за третий раунд — разбор сайта на слои. Только от
                  // 1024px (lg): ниже разбор не открывается, и кнопка обещала бы
                  // пустоту
                  <button
                    type="button"
                    data-minigame-xray
                    onClick={(e) => openXray(e.currentTarget)}
                    className={`hidden lg:flex ${PILL_ACCENT}`}
                  >
                    {UI.mgXray[lang]}
                    <ArrowRight />
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Макет: страница с пустыми местами. Форма места — подсказка,
            подписей нет */}
        <div
          data-minigame-layout
          role="group"
          aria-label={[UI.mgLayout, UI.mgLayoutPhone, UI.mgBuild][level][lang]}
          data-level={level}
          className="relative shrink-0 rounded-xl border border-line bg-surface shadow-lg shadow-ink/5"
          style={{ width: mg(BOARD_W + BOARD_PAD * 2), height: mg(BOARD_H + BOARD_PAD * 2) }}
        >
          <div className="absolute" style={{ inset: mg(BOARD_PAD) }}>
            {/* Корпус телефона во втором раунде: рамка вокруг колонки мест */}
            {level === 1 ? (
              <div
                aria-hidden
                data-minigame-phone
                className="absolute border-2 border-line bg-bg"
                style={{ ...boxOf(PHONE_FRAME), borderRadius: mg(14) }}
              />
            ) : null}
            {level === 2
              ? PIECES.map((piece) => (
                  <BugTarget
                    key={`${piece.id}-${round}`}
                    piece={piece}
                    lang={lang}
                    fixed={!isBug(piece.id) || found.includes(piece.id)}
                    takeFlight={takeFlight}
                    reduced={reduced}
                    register={(el) => {
                      bugEls.current[piece.id] = el;
                    }}
                    onPress={() => onBugClick(piece.id)}
                  />
                ))
              : PIECES.map((piece) =>
              placed.includes(piece.id) ? (
                <PlacedPiece
                  key={piece.id}
                  piece={piece}
                  rect={slotOf(piece, level)}
                  compact={level === 1}
                  lang={lang}
                  takeFlight={takeFlight}
                  reduced={reduced}
                  register={(el) => {
                    slotEls.current[piece.id] = el;
                  }}
                />
              ) : (
                <button
                  key={piece.id}
                  ref={(el) => {
                    slotEls.current[piece.id] = el;
                  }}
                  type="button"
                  data-slot={piece.id}
                  aria-label={piece.slotLabel[lang]}
                  onClick={() => onSlotClick(piece.id)}
                  className={`absolute cursor-pointer border border-dashed border-muted/50 bg-bg/60 ${piece.radius}`}
                  style={boxOf(slotOf(piece, level))}
                >
                  {/* Подсветка места: под блоком в руке — полная, пока блок
                      взят — намёк, куда его можно деть */}
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute -inset-px ${piece.radius} border-2 border-accent motion-safe:transition-opacity motion-safe:duration-150`}
                    style={{ opacity: target === piece.id ? 1 : busy ? 0.3 : 0 }}
                  />
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Блок, вставший в слот. Прилетает из того места, где его отпустили (FLIP):
 * раскладка уже финальная, а видимый путь рисует одна анимация transform.
 */
function PlacedPiece({
  piece,
  rect,
  compact,
  lang,
  takeFlight,
  reduced,
  register,
}: {
  piece: Piece;
  rect: Rect;
  compact: boolean;
  lang: Lang;
  takeFlight: (id: PieceId) => Flight | undefined;
  reduced: boolean;
  register: (el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const from = takeFlight(piece.id);
    if (!el || !from || reduced) return;
    flyFrom(el, from);
  }, [takeFlight, piece.id, reduced]);

  return (
    <div
      ref={(el) => {
        ref.current = el;
        register(el);
      }}
      data-slot={piece.id}
      data-filled=""
      data-placed={piece.id}
      className={`absolute ${piece.radius}`}
      style={boxOf(rect)}
    >
      <PieceFace id={piece.id} lang={lang} compact={compact} />
    </div>
  );
}

/**
 * FLIP: элемент уже стоит на финальном месте, а видимый путь от прямоугольника
 * `from` рисует одна анимация transform. Масштаб по осям раздельно — блок из
 * лотка крупнее места в телефоне; начало координат масштаба — левый верхний
 * угол, тогда сдвиг считается от левых верхних углов без поправок.
 */
function flyFrom(el: HTMLElement, from: Flight) {
  const to = el.getBoundingClientRect();
  if (to.width === 0 || to.height === 0) return;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;

  el.animate(
    [
      { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: "0 0", transform: "none" },
    ],
    { duration: 420, easing: EASE_OUT },
  );
}

/**
 * Блок вёрстки в третьем раунде. Пока баг не найден, блок стоит «как свёрстан»
 * (`BUGS`); найденный — переезжает на место из макета тем же FLIP-полётом.
 * Скругление при этом меняется сразу: его трансформом не анимировать.
 */
function BugTarget({
  piece,
  lang,
  fixed,
  takeFlight,
  reduced,
  register,
  onPress,
}: {
  piece: Piece;
  lang: Lang;
  fixed: boolean;
  takeFlight: (id: PieceId) => Flight | undefined;
  reduced: boolean;
  register: (el: HTMLButtonElement | null) => void;
  onPress: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const bug = isBug(piece.id) ? BUGS[piece.id] : null;
  const rect = fixed || !bug ? piece.slot : bug.rect;
  const radius = fixed || !bug ? piece.radius : bug.radius;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!fixed || !el) return;
    const from = takeFlight(piece.id);
    if (!from || reduced) return;
    flyFrom(el, from);
  }, [fixed, takeFlight, piece.id, reduced]);

  return (
    <button
      ref={(el) => {
        ref.current = el;
        register(el);
      }}
      type="button"
      data-bug-target={piece.id}
      data-fixed={fixed && bug ? "" : undefined}
      aria-label={piece.name[lang]}
      onClick={onPress}
      // text-left: кнопка по умолчанию центрирует текст, и у карточки
      // появлялся четвёртый, нечаянный «баг» — заголовок по центру
      className={`absolute cursor-pointer text-left outline-offset-2 hover:ring-2 hover:ring-accent/40 ${radius}`}
      style={boxOf(rect)}
    >
      <PieceFace id={piece.id} lang={lang} radius={radius} />
    </button>
  );
}

/** Три точки раунда: пройденные и текущий залиты акцентом. */
function LevelDots({ level, label }: { level: Level; label: string }) {
  return (
    <span data-minigame-level={level} role="img" aria-label={label} className="flex items-center gap-1">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className={`block size-1.5 rounded-full ${dot <= level ? "bg-accent" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

// Без display: его добавляет каждый вариант сам — у кнопки разбора это
// `hidden lg:flex`, и `flex` в общей базе спорил бы с `hidden`
const PILL_BASE =
  "h-8 cursor-pointer items-center gap-1.5 rounded-full border bg-surface/80 px-3 font-mono text-[11px] uppercase tracking-[0.14em] motion-safe:transition-colors";
const PILL = `flex ${PILL_BASE} border-line text-ink hover:border-accent hover:text-accent`;
// «Дальше» — главное действие финала, поэтому сразу акцентом
const PILL_ACCENT = `${PILL_BASE} border-accent text-accent hover:bg-accent hover:text-bg`;

/* Иконки — свой SVG одним штрихом 1.5, как у панели сайта */

function ArrowDown() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
      <path
        d="M8 3v10m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
      <path
        d="M3 8h10m0 0-4-4m4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Replay() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
      <path
        d="M3 8a5 5 0 1 0 1.5-3.6M3 3v3h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 text-accent" fill="none" aria-hidden>
      <path
        d="m8 2.2 1.75 3.55 3.9.57-2.83 2.76.67 3.89L8 11.13l-3.49 1.84.67-3.89-2.83-2.76 3.9-.57L8 2.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
