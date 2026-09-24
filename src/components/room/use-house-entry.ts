"use client";

import { animate, useMotionValue, type MotionValue } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type Ref } from "react";

import { useNarrowViewport } from "@/components/room/use-room-layout";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Вход в дом и выход обратно (Э5, раздел 4.2 концепта).
 *
 * ── Что должно получиться ───────────────────────────────────────────────────
 * Камера идёт к дому и входит в дверь. Не окно, всплывающее поверх города, а
 * наезд: дом растёт к зрителю от своего настоящего места, и растёт вокруг
 * двери — дверь остаётся неподвижной относительно дома и уезжает в центр
 * кадра. Дальше камера проходит сквозь дверь: в тёмном проёме видна комната,
 * и она растёт вместе с проёмом, пока рама двери не уйдёт за край кадра, —
 * смена дома комнатой продолжает то же движение, а не проявляется листом
 * поверх фасада. Город вокруг отступает — темнеет под завесой.
 *
 * Выход — обратный путь: комната отступает в дверь, вокруг неё снова
 * вырастает фасад, и дом отъезжает на своё место, пока город светлеет.
 *
 * ── Как это сделано ─────────────────────────────────────────────────────────
 * Три слоя, все порталом на `body` (их рисует `route-stop.tsx`):
 *
 *   1. завеса цветом `--room-veil` на весь экран — только `opacity`;
 *   2. копия дома — ОДНА картинка, та же, что уже показана на маршруте
 *      (`currentSrc`, из кэша и уже декодированная). Нарисована сразу в
 *      конечном размере и в начале уменьшена до размера дома: растр крупный,
 *      поэтому в упор дом не мылится, а движение — чистый `transform`;
 *   3. сама комната (`house-room.tsx`): монтируется в первый же кадр входа
 *      невидимой — фокус, замок скролла и раскладка готовы заранее, и её
 *      рендер не приходится на середину движения. Видимость и масштаб ей
 *      передаются отсюда же.
 *
 * Настоящий дом на маршруте на время входа прячется (`data-house-away` на
 * остановке), иначе под уехавшей копией оставался бы его тусклый двойник.
 *
 * ── Одна шкала времени ──────────────────────────────────────────────────────
 * Анимируется одно время `t` от 0 до 1, линейно; из него кривой выводится
 * положение камеры `c`, а из камеры — всё остальное (`placeCamera`), и пишется
 * в motion values. Ни одного `setState` на кадр, меняются только `transform`
 * и `opacity`. Слои не разъезжаются по таймингам: у них одна камера.
 *
 * ── Где входа нет ───────────────────────────────────────────────────────────
 * При `prefers-reduced-motion` и на узком экране (там комната и так плоская
 * панель) движения нет совсем: завеса и комната просто на месте. Камера,
 * влетающая в дом на 390 пикселях, мешает, а не помогает.
 */

/** Где дом стоит на экране в момент клика и чем его рисовать. */
export type HouseCopy = {
  src: string;
  /** Размер копии в КОНЕЧНОМ масштабе, пиксели */
  width: number;
  height: number;
  /** Точка двери — доля размера картинки */
  doorX: number;
  doorY: number;
};

/** Геометрия наезда: откуда и куда едет дверь, во сколько раз растёт дом. */
type Flight = {
  /** Дверь на экране в момент клика */
  fromX: number;
  fromY: number;
  /** Куда дверь приезжает: центр кадра */
  toX: number;
  toY: number;
  /** Во сколько раз дом вырастает к концу наезда */
  zoom: number;
};

/** Точка двери по умолчанию — чуть ниже середины, где дверь у большинства изо-домов */
const DEFAULT_DOOR = { x: 0.5, y: 0.64 };

/**
 * Длительности. Вход — одна фраза около 700 мс: дольше повторные заходы
 * начинают раздражать, короче наезд не успевает прочитаться как шаг. Выход
 * короче: из дома выходят быстрее, чем заходят.
 */
const ENTER_MS = 650; // при 760 последние ~300 мс комната почти не менялась и вход тянулся
const LEAVE_MS = 560;

/**
 * Какую долю кадра комната занимает в тот миг, когда она видна в дверном
 * проёме. Проём при `zoom` — около шестой части ширины кадра (дом опыта на
 * 1440: ~230 из 1440 пикселей), и комната должна поместиться в него, не
 * залезая на косяки: при 0,22 она уже задевала решётку и арку.
 */
const ROOM_IN_DOOR = 0.18;

/**
 * Во сколько раз дом вырастает к концу входа. Ширина дома к этому моменту —
 * полторы ширины экрана (дом заполнил кадр), но не больше шести: растр
 * копии рисуется в конечном размере, и больше — это уже лишние мегабайты
 * текстуры ради кадра, который и так гаснет.
 */
function zoomFor(houseWidth: number) {
  return clamp((window.innerWidth * 1.5) / houseWidth, 3.5, 6);
}

type Phase = "closed" | "entering" | "open" | "leaving";

export type HouseEntry = {
  /** Вешается на каждую кнопку-дом: их две — узкий экран и городок */
  triggerRef: Ref<HTMLButtonElement>;
  phase: Phase;
  /** Комната смонтирована: от первого кадра входа до последнего кадра выхода */
  mounted: boolean;
  /** Вход упрощён: узкий экран или системная настройка «меньше движения» */
  simple: boolean;
  enter: () => void;
  leave: () => void;
  /** Копия дома для наезда; `null` — лететь неоткуда (дом за кадром, простой режим) */
  copy: HouseCopy | null;
  veil: { opacity: MotionValue<number> };
  house: {
    x: MotionValue<number>;
    y: MotionValue<number>;
    scale: MotionValue<number>;
    opacity: MotionValue<number>;
  };
  room: { opacity: MotionValue<number>; scale: MotionValue<number> };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Доля пройденного отрезка [a, b] шкалы времени */
function seg(t: number, a: number, b: number) {
  return clamp((t - a) / (b - a), 0, 1);
}

/** Кубическое замедление: основное движение в начале, мягкая посадка в конце */
function easeOut(x: number) {
  return 1 - (1 - x) ** 3;
}

/** Кубическое «разгон — торможение»: для выхода, где важны оба конца */
function easeInOut(x: number) {
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Видимая кнопка-дом: на узком экране и в городке они разные. */
function visible(all: Set<HTMLButtonElement>) {
  for (const element of all) {
    // `display: none` (вторая кнопка всегда скрыта медиазапросом) не имеет
    // предка раскладки — так отличается показанная кнопка от спрятанной
    if (element.offsetParent !== null) return element;
  }
  return null;
}

/**
 * Картинка дома, которую посетитель видит прямо сейчас. Берётся её
 * `currentSrc` — вариант, уже выбранный браузером под плотность экрана, уже
 * скачанный и декодированный: копия появится в первый же кадр, без мигания.
 */
function shownHouseSrc(trigger: HTMLElement) {
  const stop = trigger.closest("[data-stop]");
  if (!stop) return null;
  for (const img of stop.querySelectorAll<HTMLImageElement>("[data-scene-object] img")) {
    const box = img.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) return img.currentSrc || img.src;
  }
  return null;
}

/** Экранный прямоугольник дома → копия и траектория наезда. */
function measure(
  trigger: HTMLElement | null,
  door: { x: number; y: number },
): { copy: HouseCopy; flight: Flight } | null {
  if (!trigger) return null;
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (rect.width === 0 || rect.height === 0) return null;
  // Дом целиком за кадром (успели прокрутить): полёт к нему был бы промахом
  // мимо экрана — тогда комната просто проявляется из центра
  if (rect.bottom <= 0 || rect.top >= vh) return null;

  const src = shownHouseSrc(trigger);
  if (!src) return null;

  const zoom = zoomFor(rect.width);
  // Округление — не косметика: координаты уходят в `transform`, а дробные
  // хвосты в двадцатом знаке дают дрожание растра на остановке
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    copy: {
      src,
      width: round(rect.width * zoom),
      height: round(rect.height * zoom),
      doorX: door.x,
      doorY: door.y,
    },
    flight: {
      fromX: round(rect.left + rect.width * door.x),
      fromY: round(rect.top + rect.height * door.y),
      toX: round(vw / 2),
      toY: round(vh / 2),
      zoom,
    },
  };
}

export function useHouseEntry(door: { x: number; y: number } = DEFAULT_DOOR): HouseEntry {
  const [phase, setPhase] = useState<Phase>("closed");
  // Копия нужна разметке — картинка встаёт на место дома, — поэтому она в
  // состоянии. Меняется раз на вход или выход, а не на кадр: всё покадровое
  // живёт ниже в motion values
  const [copy, setCopy] = useState<HouseCopy | null>(null);
  const flight = useRef<Flight | null>(null);

  // Фаза дублируется в ref: обработчики читают её синхронно, а состояние
  // приезжает только к следующему рендеру — иначе второй клик по дому
  // во время наезда камеры проскакивает охрану
  const phaseRef = useRef<Phase>("closed");
  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const triggers = useRef(new Set<HTMLButtonElement>());
  const triggerRef = useCallback((element: HTMLButtonElement | null) => {
    if (!element) return;
    const all = triggers.current;
    all.add(element);
    return () => {
      all.delete(element);
    };
  }, []);

  const reducedMotion = usePrefersReducedMotion();
  const narrow = useNarrowViewport();
  const simple = reducedMotion || narrow;
  const simpleRef = useRef(simple);
  const doorRef = useRef(door);
  useEffect(() => {
    simpleRef.current = simple;
    doorRef.current = door;
  }, [simple, door]);

  const veilOpacity = useMotionValue(0);
  const houseX = useMotionValue(0);
  const houseY = useMotionValue(0);
  const houseScale = useMotionValue(1);
  const houseOpacity = useMotionValue(0);
  const roomOpacity = useMotionValue(0);
  const roomScale = useMotionValue(1);

  /**
   * Камера — одно число `c` от 0 до 1 на весь путь от улицы до комнаты.
   *
   * Путь в два отрезка, но одним движением. Сначала камера идёт к дому: дом
   * растёт вокруг двери до `zoom`, дверь приезжает в центр кадра. Потом камера
   * проходит В дверь: дом продолжает расти, а комната стоит внутри тёмного
   * проёма — сначала маленькая, размером с проём (`ROOM_IN_DOOR`), — и растёт
   * ровно вместе с ним, пока рама двери не уйдёт за край кадра. Поэтому смена
   * дома комнатой читается как «увидел комнату в двери и вошёл», а не как
   * проявление листа поверх дома.
   *
   * Масштаб ведётся в логарифме: при равном шаге `c` камера на глаз движется
   * с постоянной скоростью, а не «сначала ползёт, потом прыгает». Прозрачности
   * — от доли прохода сквозь дверь `q`, а не от времени: вход и выход идут по
   * одному пути в пространстве, меняется только кривая по времени.
   */
  const placeCamera = useCallback(
    (c: number) => {
      const f = flight.current;
      // Дом за кадром — лететь неоткуда, но комната выходит из той же точки
      // по той же кривой, как если бы дверь была в центре
      const zoom = f?.zoom ?? 4;
      const toDoor = Math.log(zoom);
      const total = Math.log(zoom / ROOM_IN_DOOR);
      const logScale = c * total;
      // Доля прохода сквозь дверь: < 0 — ещё на улице, 1 — в комнате
      const q = (logScale - toDoor) / (total - toDoor);

      if (f) {
        // Дверь доезжает до центра к моменту, когда дом дорос до `zoom`, и
        // тормозит к этому моменту до нуля — без рывка на стыке отрезков
        const toCenter = easeOut(clamp(logScale / toDoor, 0, 1));
        houseX.set(f.fromX + (f.toX - f.fromX) * toCenter);
        houseY.set(f.fromY + (f.toY - f.fromY) * toCenter);
        // Копия нарисована в размере `zoom`, отсюда деление
        houseScale.set(Math.exp(logScale) / zoom);
      }
      // Копия гаснет, когда рама двери уже почти за краем кадра
      houseOpacity.set(1 - seg(q, 0.45, 0.85));
      // Комната проявляется, пока она ещё внутри тёмного проёма: там под ней
      // тень за дверью, а не фасад, и полупрозрачного листа поверх дома нет
      roomOpacity.set(seg(q, -0.05, 0.2));
      roomScale.set(ROOM_IN_DOOR ** (1 - clamp(q, 0, 1)));
    },
    [houseOpacity, houseScale, houseX, houseY, roomOpacity, roomScale],
  );

  /**
   * Кадр входа: камера — экспоненциальное замедление. Подход к двери быстрый
   * (около 170 мс — клик отзывается сразу), проход сквозь дверь и посадка
   * комнаты — остальное время, с мягкой остановкой. Город уходит под завесу
   * за первую треть.
   */
  const enterFrame = useCallback(
    (t: number) => {
      placeCamera(easeOut(t));
      veilOpacity.set(seg(t, 0, 0.3));
    },
    [placeCamera, veilOpacity],
  );

  /**
   * Кадр выхода — тот же путь назад. Кривая другая: зеркало замедления — это
   * разгон, и дом с размаху впечатывался бы в своё место. Здесь комната
   * отступает в дверь плавно, а дом так же плавно садится на место.
   */
  const leaveFrame = useCallback(
    (t: number) => {
      placeCamera(1 - easeInOut(t));
      veilOpacity.set(1 - seg(t, 0.35, 1));
    },
    [placeCamera, veilOpacity],
  );

  const running = useRef<{ stop: () => void } | null>(null);
  useEffect(
    () => () => {
      running.current?.stop();
    },
    [],
  );

  // Закрытие, пришедшее во время входа (Escape на середине наезда), не рвёт
  // движение пополам, а ждёт его конца и сразу разворачивает камеру
  const pendingLeave = useRef(false);

  const focusTrigger = useCallback(() => {
    visible(triggers.current)?.focus({ preventScroll: true });
  }, []);

  // Фокус возвращается на дом ПОСЛЕ того, как комната размонтирована. Пока она
  // на экране (а на выходе она ещё гаснет), её фокус-ловушка перехватывает
  // любой фокус снаружи и уводит его обратно в диалог — а затем диалог
  // исчезает, и фокус падает на `body`. Эффект срабатывает после коммита
  // фазы `closed`: ловушки уже нет, кнопка-дом снова на месте
  const returnFocus = useRef(false);
  useEffect(() => {
    if (phase !== "closed" || !returnFocus.current) return;
    returnFocus.current = false;
    focusTrigger();
  }, [focusTrigger, phase]);

  /** Всё на месте без движения: комната открыта, завеса плотная. */
  const settleOpen = useCallback(() => {
    veilOpacity.set(1);
    houseOpacity.set(0);
    roomOpacity.set(1);
    roomScale.set(1);
  }, [houseOpacity, roomOpacity, roomScale, veilOpacity]);

  const leaveRef = useRef<() => void>(() => {});

  const enter = useCallback(() => {
    // Повторный клик во время анимации: второго входа быть не должно
    if (phaseRef.current !== "closed") return;
    pendingLeave.current = false;

    if (simpleRef.current) {
      flight.current = null;
      setCopy(null);
      settleOpen();
      go("open");
      return;
    }

    const measured = measure(visible(triggers.current), doorRef.current);
    flight.current = measured?.flight ?? null;
    setCopy(measured?.copy ?? null);
    enterFrame(0);
    go("entering");

    running.current?.stop();
    const run = animate(0, 1, {
      duration: ENTER_MS / 1000,
      ease: "linear",
      onUpdate: enterFrame,
    });
    running.current = run;
    void run.then(() => {
      if (phaseRef.current !== "entering") return;
      go("open");
      if (pendingLeave.current) leaveRef.current();
    });
  }, [enterFrame, go, settleOpen]);

  const leave = useCallback(() => {
    if (phaseRef.current === "closed" || phaseRef.current === "leaving") return;
    if (phaseRef.current === "entering") {
      pendingLeave.current = true;
      return;
    }
    pendingLeave.current = false;
    returnFocus.current = true;

    if (simpleRef.current) {
      veilOpacity.set(0);
      roomOpacity.set(0);
      go("closed");
      return;
    }

    // Дом мог уехать, пока комната была открыта (сменили ширину окна), —
    // меряем заново, чтобы выход вернулся туда, где дом стоит сейчас
    const measured = measure(visible(triggers.current), doorRef.current);
    flight.current = measured?.flight ?? null;
    setCopy(measured?.copy ?? null);
    leaveFrame(0);
    go("leaving");

    running.current?.stop();
    const run = animate(0, 1, {
      duration: LEAVE_MS / 1000,
      ease: "linear",
      onUpdate: leaveFrame,
    });
    running.current = run;
    void run.then(() => {
      if (phaseRef.current !== "leaving") return;
      go("closed");
      setCopy(null);
    });
  }, [go, leaveFrame, roomOpacity, veilOpacity]);

  useEffect(() => {
    leaveRef.current = leave;
  }, [leave]);

  return {
    triggerRef,
    phase,
    mounted: phase !== "closed",
    simple,
    enter,
    leave,
    copy,
    veil: { opacity: veilOpacity },
    house: { x: houseX, y: houseY, scale: houseScale, opacity: houseOpacity },
    room: { opacity: roomOpacity, scale: roomScale },
  };
}
