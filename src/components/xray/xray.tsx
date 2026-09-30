"use client";

import {
  animate,
  AnimatePresence,
  cancelFrame,
  frame,
  motion,
  motionValue,
  useMotionValue,
  usePresence,
  type AnimationPlaybackControls,
} from "framer-motion";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { CloseIcon } from "@/components/command-palette/icons";
import { useFocusTrap } from "@/components/room/use-focus-trap";
import { useScrollLock } from "@/components/room/use-scroll-lock";
import { UI } from "@/lib/content";
import { dashes } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

import { captureLayers, clearLayers, contentBox, fillThumb, hidePage, XRAY_LAYERS, type XrayLayerId } from "./snapshot";
import { closeXray, useXrayOpen, xrayReturnFocusTarget } from "./store";

/**
 * «Разбор сайта» — текущий экран, разложенный на слои, как «3D view» в
 * инструментах разработчика. Награда за мини-игру.
 *
 * ── Копии ───────────────────────────────────────────────────────────────────
 * В момент открытия `captureLayers` копирует видимые элементы каждого слоя в
 * свою пластину на их места на экране (почему копии, а не живой DOM, — в
 * `snapshot.ts`). Пластина — прямоугольник размером с экран на момент снимка.
 * Страница под разбором на это время прячется (`hidePage`): её облака, рой и
 * партия на доске иначе заставляли бы перекомпоновывать всю стопку на каждом
 * кадре — при открытом разборе это давало 10 кадров в секунду вместо 60.
 *
 * ── Геометрия без общего 3D-контекста ─────────────────────────────────────────
 * У каждой пластины СВОЯ полная матрица: сдвиг, perspective(), масштаб,
 * наклон, поворот и подъём по Z — а не одна `preserve-3d`-сцена с пластинами
 * внутри. Порядок отрисовки тогда — порядок в DOM, снизу вверх, и для камеры
 * сверху он и есть правильный. Разница в цене кадра кратная: замер на девяти
 * полноэкранных слоях при DPR 2 — 18 кадров в секунду с общим контекстом
 * (браузер сортирует и режет плоскости) и 60 без него. По той же причине у
 * пластин нет рамок: рамка делает текстурой каждый краевой тайл, а сплошная
 * заливка рисуется как один цвет.
 *
 * Ярлыки слоёв — плоские, лицом к зрителю: точка угла пластины проецируется
 * той же формулой (`project`), что строит матрицу, и ярлык ставится туда
 * сдвигом. Та же формула подбирает масштаб и центр под свободную часть окна —
 * без замеров DOM.
 *
 * ── Движение ────────────────────────────────────────────────────────────────
 * Всё, что меняется на кадре, — motion values: `progress` (0 — плоско и
 * совпадает с экраном, 1 — разобрано), наклон и поворот от перетаскивания,
 * подъём выбранного слоя. Любое их изменение планирует одну запись стилей в
 * фазе render у framer (`frame.render`): transform пластин и ярлыков пишется
 * в DOM через ref, React на кадре не перерисовывается. Выход ждёт обратной
 * анимации через `usePresence`.
 *
 * ── Ширины ──────────────────────────────────────────────────────────────────
 * От 768px — 3D: на 1024+ список слоёв слева, на планшете — снизу. Уже 768 —
 * плоский список слоёв с превью: 3D-стопка на телефоне превращается в
 * неразборчивую полоску. Режим меняется на лету, если окно повернули.
 *
 * Слой `z-[60]` — как у комнаты дома: над панелью, под палитрой.
 */

/** Наклон к зрителю и поворот стопки по умолчанию, градусы. */
const TILT = 56;
const TURN = -34;
/** Куда можно наклонить перетаскиванием: почти плашмя стопка не читается, почти стоя — ярлыки налезают. */
const TILT_MIN = 26;
const TILT_MAX = 74;
/** На сколько можно развернуть от исходного поворота в каждую сторону. */
const TURN_SPAN = 80;
/** Градусов поворота на пиксель перетаскивания. */
const DRAG_TURN = 0.3;
const DRAG_TILT = 0.2;
/** Шаг поворота стрелками ←→. */
const KEY_TURN = 15;
/** Подъём выбранного слоя — доля шага между слоями. */
const LIFT = 0.55;
/** Прозрачность приглушённых слоёв. */
const DIM = 0.12;
/** Сколько пластины стоят плоско, пока браузер их растеризует, мс. */
const RASTER_HOLD = 160;
/** Сколько длится шаг показа «по шагам», мс: девять слоёв — около двадцати секунд. */
const TOUR_STEP = 2300;
/** Место под ярлык слева от угла пластины, px экрана. */
const LABEL_ROOM = 136;
/** Ширина списка слоёв на широком экране. */
const PANEL = 340;

const EASE_OPEN = [0.16, 1, 0.3, 1] as const;
/**
 * Сборка обратно — ускоряясь, а не плавно в обе стороны: чем ближе к
 * плоскости, тем крупнее пластины и тем дороже кадр (девять слоёв почти во
 * весь экран), поэтому этот участок проходится быстро, а неспешна начальная
 * часть, где стопка ещё маленькая. Раскрытие по той же причине — наоборот.
 */
const EASE_CLOSE = [0.55, 0, 0.9, 0.45] as const;

/** Превью слоя в режиме списка, px. */
const THUMB = { w: 96, h: 60 } as const;

/** С какой ширины разбор объёмный. Ниже — плоский список. */
const WIDE = "(min-width: 768px)";

/** Лист слоя: заливка и края. Толщина края — в пикселях пластины, на экране она в масштабе стопки. */
const SHEET_PARTS = ["fill", "top", "right", "bottom", "left"] as const;
const SHEET_PART_CLASS: Record<(typeof SHEET_PARTS)[number], string> = {
  fill: "inset-0",
  top: "inset-x-0 top-0 h-[3px]",
  right: "inset-y-0 right-0 w-[3px]",
  bottom: "inset-x-0 bottom-0 h-[3px]",
  left: "inset-y-0 left-0 w-[3px]",
};

/** Сверху вниз, как в инструментах разработчика: первой идёт верхняя панель. */
const TOP_DOWN = [...XRAY_LAYERS].reverse();

type Geometry = {
  /** Размер пластины — экран на момент снимка */
  w: number;
  h: number;
  /** Шаг между слоями по Z, px пластины */
  gap: number;
  scale: number;
  dx: number;
  dy: number;
  perspective: number;
};

type Pose = { tilt: number; turn: number; p: number };

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Точка пластины на экране. `x`, `y` — от центра пластины, `z` — подъём.
 * Порядок — ровно как в `plateTransform`, справа налево: подъём, поворот,
 * наклон, масштаб, перспектива, сдвиг.
 */
function project(g: Geometry, pose: Pose, x: number, y: number, z: number) {
  const rx = rad(pose.tilt * pose.p);
  const rz = rad(pose.turn * pose.p);
  const s = 1 + (g.scale - 1) * pose.p;
  const x1 = x * Math.cos(rz) - y * Math.sin(rz);
  const y1 = x * Math.sin(rz) + y * Math.cos(rz);
  const y2 = y1 * Math.cos(rx) - z * Math.sin(rx);
  const z2 = y1 * Math.sin(rx) + z * Math.cos(rx);
  const w = 1 - (s * z2) / g.perspective;
  return { x: g.w / 2 + g.dx * pose.p + (s * x1) / w, y: g.h / 2 + g.dy * pose.p + (s * y2) / w };
}

function plateTransform(g: Geometry, pose: Pose, z: number) {
  const s = (1 + (g.scale - 1) * pose.p).toFixed(4);
  return (
    `translate3d(${(g.dx * pose.p).toFixed(2)}px, ${(g.dy * pose.p).toFixed(2)}px, 0) ` +
    `perspective(${g.perspective.toFixed(0)}px) scale3d(${s}, ${s}, ${s}) ` +
    `rotateX(${(pose.tilt * pose.p).toFixed(3)}deg) rotateZ(${(pose.turn * pose.p).toFixed(3)}deg) ` +
    `translate3d(0, 0, ${z.toFixed(2)}px)`
  );
}

type Area = { left: number; top: number; right: number; bottom: number };

/**
 * Поза разобранной стопки под свободную часть окна: масштаб и центр
 * подбираются по проекции углов всех пластин и места под ярлыки. Проекция с
 * перспективой нелинейна по масштабу, поэтому три прохода.
 */
function fitGeometry(w: number, h: number, area: Area): Geometry {
  const gap = clamp(h * 0.17, 84, 170);
  const g: Geometry = { w, h, gap, scale: 1, dx: 0, dy: 0, perspective: Math.max(w, h) * 2 };
  const pose: Pose = { tilt: TILT, turn: TURN, p: 1 };
  const top = (XRAY_LAYERS.length - 1) * gap + gap * LIFT;

  const bounds = (geo: Geometry) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const z of [0, top]) {
      for (const [x, y] of [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ]) {
        const point = project(geo, pose, x, y, z);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
      // Ярлык стоит левее угла пластины
      const corner = project(geo, pose, -w / 2, -h / 2, z);
      minX = Math.min(minX, corner.x - LABEL_ROOM);
      minY = Math.min(minY, corner.y - 16);
    }
    return { minX, maxX, minY, maxY };
  };

  const width = Math.max(120, area.right - area.left);
  const height = Math.max(120, area.bottom - area.top);
  let geo = g;
  for (let pass = 0; pass < 3; pass += 1) {
    const b = bounds(geo);
    const k = Math.min(width / (b.maxX - b.minX), height / (b.maxY - b.minY));
    geo = { ...geo, scale: geo.scale * k };
  }
  const b = bounds(geo);
  return {
    ...geo,
    dx: (area.left + area.right) / 2 - (b.minX + b.maxX) / 2,
    dy: (area.top + area.bottom) / 2 - (b.minY + b.maxY) / 2,
  };
}

/**
 * Поза под текущее окно. Свободная часть окна — всё, кроме списка слоёв:
 * слева на 1024+, снизу на планшете (там его высота зависит от содержимого,
 * поэтому верх берётся замером — разово, на открытие и resize).
 */
function geometryFor(size: { w: number; h: number }, panel: HTMLElement | null) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (W >= 1024) {
    return fitGeometry(size.w, size.h, { left: 24 + PANEL + 32, top: 28, right: W - 24, bottom: H - 24 });
  }
  const panelTop = panel?.getBoundingClientRect().top ?? H * 0.58;
  return fitGeometry(size.w, size.h, { left: 16, top: 20, right: W - 16, bottom: Math.max(H * 0.4, panelTop - 12) });
}

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Объёмный режим или список. Разбор монтируется только на клиенте, серверный снимок не нужен. */
function useWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

export function Xray() {
  const open = useXrayOpen();
  return <AnimatePresence>{open ? <XrayScene key="xray" /> : null}</AnimatePresence>;
}

function XrayScene() {
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const wide = useWide();
  const [isPresent, safeToRemove] = usePresence();
  // Пластина — экран на момент снимка. Разбор монтируется только открытым, на клиенте
  const [size] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  const progress = useMotionValue(0);
  const tiltBy = useMotionValue(0);
  const turnBy = useMotionValue(0);
  const [lifts] = useState(() => XRAY_LAYERS.map(() => motionValue(0)));
  // Приглушение слоёв — тоже motion values: одна прозрачность на пластину,
  // её лист и ярлык, пишется в том же кадре, что и поза
  const [dims] = useState(() => XRAY_LAYERS.map(() => motionValue(1)));
  const geoRef = useRef<Geometry | null>(null);

  const [hovered, setHovered] = useState<XrayLayerId | null>(null);
  const [focused, setFocused] = useState<XrayLayerId | null>(null);
  const [selected, setSelected] = useState<XrayLayerId | null>(null);
  // Какая кнопка списка сейчас в порядке таба (roving tabindex)
  const [current, setCurrent] = useState<XrayLayerId>(TOP_DOWN[0].id);
  const [grid, setGrid] = useState(false);
  const [touring, setTouring] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  // На выходе подсветка снимается сразу: слои должны лечь обратно ровно
  const active = isPresent ? (hovered ?? focused ?? selected) : null;

  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const hostRefs = useRef<Partial<Record<XrayLayerId, HTMLDivElement | null>>>({});
  const clipRefs = useRef<Partial<Record<XrayLayerId, HTMLDivElement | null>>>({});
  const plateRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sheetPartRefs = useRef<(HTMLDivElement | null)[][]>(XRAY_LAYERS.map(() => []));
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const thumbRefs = useRef<Partial<Record<XrayLayerId, HTMLDivElement | null>>>({});
  const emptyRefs = useRef<Partial<Record<XrayLayerId, HTMLParagraphElement | null>>>({});
  const buttonRefs = useRef<Partial<Record<XrayLayerId, HTMLButtonElement | null>>>({});
  const readyRef = useRef<Promise<void>>(Promise.resolve());
  const restorePageRef = useRef<(() => void) | null>(null);
  const spinRef = useRef<AnimationPlaybackControls[]>([]);

  const titleId = useId();
  const listId = useId();

  // Запись стилей на кадр: одна на все изменения motion values за кадр
  const applyRef = useRef<() => void>(() => undefined);
  const scheduleRef = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    let scheduled = false;
    // Последнее записанное значение: на вращении прозрачности не меняются,
    // и писать их заново значило бы гонять пересчёт стилей зря
    const written = new WeakMap<HTMLElement, Record<string, string>>();
    const write = (el: HTMLElement | null | undefined, prop: "transform" | "opacity", value: string) => {
      if (!el) return;
      const last = written.get(el) ?? {};
      if (last[prop] === value) return;
      last[prop] = value;
      written.set(el, last);
      el.style[prop] = value;
    };
    const apply = () => {
      scheduled = false;
      const g = geoRef.current;
      if (!g) return;
      const p = progress.get();
      const pose: Pose = {
        p,
        tilt: clamp(TILT + tiltBy.get(), TILT_MIN, TILT_MAX),
        turn: TURN + turnBy.get(),
      };
      // Ярлыки и листы проявляются во второй половине раскрытия. Пока лист
      // прозрачен совсем, браузер его не рисует — а в начале раскрытия, когда
      // пластины почти во весь экран, каждый лишний слой стоит дорого
      const labelOpacity = clamp((p - 0.55) / 0.45, 0, 1);
      const sheetOpacity = clamp((p - 0.45) / 0.55, 0, 1);
      XRAY_LAYERS.forEach((_, index) => {
        const z = (index * g.gap + lifts[index].get()) * p;
        const dim = dims[index].get();
        const transform = plateTransform(g, pose, z);
        write(plateRefs.current[index], "transform", transform);
        write(plateRefs.current[index], "opacity", dim.toFixed(3));
        write(sheetRefs.current[index], "transform", transform);
        for (const part of sheetPartRefs.current[index]) write(part, "opacity", (sheetOpacity * dim).toFixed(3));
        const label = labelRefs.current[index];
        const corner = project(g, pose, -g.w / 2, -g.h / 2, z);
        write(label, "transform", `translate3d(${corner.x.toFixed(1)}px, ${corner.y.toFixed(1)}px, 0)`);
        write(label, "opacity", labelOpacity.toFixed(3));
      });
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      frame.render(apply);
    };
    applyRef.current = apply;
    scheduleRef.current = schedule;
    const unsubscribe = [progress, tiltBy, turnBy, ...lifts, ...dims].map((value) => value.on("change", schedule));
    return () => {
      unsubscribe.forEach((off) => off());
      cancelFrame(apply);
    };
  }, [dims, lifts, progress, tiltBy, turnBy]);

  // Снимок — до замка скролла и до первой отрисовки: копии встают по тем
  // прямоугольникам, что посетитель видит прямо сейчас
  useLayoutEffect(() => {
    const hosts = hostRefs.current as Record<XrayLayerId, HTMLDivElement>;
    const ground = groundRef.current;
    const gridHost = gridRef.current;
    const root = rootRef.current;
    if (!ground || !gridHost || !root) return;
    // Невидим, пока картинки копий не декодированы, но фокусируем: opacity, а не visibility
    root.style.opacity = "0";
    readyRef.current = captureLayers(hosts, ground, gridHost);
    // Пустой на этом экране слой (карта уже 1280, созвездия днём) честно
    // говорит об этом в «подробнее»
    for (const layer of XRAY_LAYERS) {
      const note = emptyRefs.current[layer.id];
      if (note) note.hidden = hosts[layer.id].childElementCount > 0;
    }
    geoRef.current = geometryFor(size, panelRef.current);
    applyRef.current();
    return () => clearLayers(hosts, gridHost);
  }, [size]);

  // Смена режима и размера окна: пересчитать позу. Не на кадр — на resize
  useEffect(() => {
    if (!wide) return;
    const refit = () => {
      geoRef.current = geometryFor(size, panelRef.current);
      scheduleRef.current();
    };
    refit();
    let timer: number | undefined;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refit, 120);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [size, wide]);

  // Превью в списке — копии пластин, уменьшенные до карточки. Только в режиме
  // списка: в 3D их никто не видит, а сорок лишних картинок не бесплатны
  useEffect(() => {
    if (wide) return;
    const thumbs = { ...thumbRefs.current };
    let cancelled = false;
    readyRef.current.then(() => {
      if (cancelled) return;
      for (const layer of XRAY_LAYERS) {
        const thumb = thumbs[layer.id];
        const clip = clipRefs.current[layer.id];
        const host = hostRefs.current[layer.id];
        if (!thumb || !clip || !host) continue;
        fillThumb(thumb, clip);
        // Превью наезжает на то, что в слое есть: панель — полосой во всю
        // карточку, персонаж — фигурой, а не точкой. Земля — экран целиком
        const box = layer.id === "ground" ? null : contentBox(host, size.w, size.h);
        const full = { left: 0, top: 0, right: size.w, bottom: size.h };
        const b = box ?? full;
        const k = Math.min((THUMB.w - 8) / (b.right - b.left), (THUMB.h - 8) / (b.bottom - b.top), box ? 0.5 : Infinity);
        const x = THUMB.w / 2 - ((b.left + b.right) / 2) * k;
        const y = THUMB.h / 2 - ((b.top + b.bottom) / 2) * k;
        thumb.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${k.toFixed(4)})`;
      }
    });
    return () => {
      cancelled = true;
      Object.values(thumbs).forEach((thumb) => thumb?.replaceChildren());
    };
  }, [size, wide]);

  useScrollLock();
  useFocusTrap(panelRef);

  // Страница возвращается до возврата фокуса: на спрятанный элемент фокус не встанет
  useEffect(
    () => () => {
      restorePageRef.current?.();
      restorePageRef.current = null;
      xrayReturnFocusTarget()?.focus({ preventScroll: true });
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeXray();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Раскрытие и сборка обратно. При reduced-motion и в режиме списка — сразу в
  // конечное состояние
  const animated = wide && !reduced;
  useEffect(() => {
    let cancelled = false;
    let controls: AnimationPlaybackControls | undefined;
    let hold: number | undefined;
    readyRef.current.then(() => {
      if (cancelled) return;
      if (isPresent) {
        // Разбор становится видимым и прячет страницу в одном кадре — иначе
        // мигнул бы пустой фон
        if (rootRef.current) rootRef.current.style.opacity = "1";
        if (!restorePageRef.current) restorePageRef.current = hidePage();
        if (!animated) {
          progress.set(1);
          return;
        }
        // Пауза перед раскрытием. Пока корень стоял с opacity 0, браузер
        // пластины не растеризовал, и растр девяти полноэкранных слоёв на
        // Retina приходился бы на первые кадры анимации. В плоском положении
        // пластины совпадают со страницей, поэтому пауза не видна — видно
        // только, что раскрытие идёт ровно
        hold = window.setTimeout(() => {
          if (!cancelled) controls = animate(progress, 1, { duration: 0.9, ease: EASE_OPEN });
        }, RASTER_HOLD);
      } else if (!animated) {
        safeToRemove?.();
      } else {
        spinRef.current.forEach((spin) => spin.stop());
        controls = animate(progress, 0, {
          duration: 0.5,
          ease: EASE_CLOSE,
          onComplete: () => safeToRemove?.(),
        });
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(hold);
      controls?.stop();
    };
  }, [animated, isPresent, progress, safeToRemove]);

  // Выбранный слой приподнимается, остальные приглушаются
  useEffect(() => {
    const gap = geoRef.current?.gap ?? 120;
    const controls = XRAY_LAYERS.flatMap((layer, index) => {
      const lift = active === layer.id ? gap * LIFT : 0;
      const dim = active === null || active === layer.id ? 1 : DIM;
      if (reduced) {
        lifts[index].set(lift);
        dims[index].set(dim);
        return [];
      }
      return [
        animate(lifts[index], lift, { duration: 0.35, ease: EASE_OPEN }),
        animate(dims[index], dim, { duration: 0.2, ease: "easeOut" }),
      ];
    });
    return () => controls.forEach((control) => control.stop());
  }, [active, dims, lifts, reduced]);

  // Показ по шагам: снизу вверх, как собирается страница. Первый шаг ставит
  // кнопка, дальше — таймер
  useEffect(() => {
    if (!touring) return;
    let step = 1;
    const timer = window.setInterval(() => {
      if (step >= XRAY_LAYERS.length) {
        setTouring(false);
        setSelected(null);
        return;
      }
      setSelected(XRAY_LAYERS[step].id);
      step += 1;
    }, TOUR_STEP);
    return () => window.clearInterval(timer);
  }, [touring]);

  // Выбранный слой — в видимой части списка (на планшете список прокручивается)
  useEffect(() => {
    if (!selected) return;
    buttonRefs.current[selected]?.closest("li")?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const stopTour = () => setTouring(false);

  const toggle = (id: XrayLayerId) => {
    stopTour();
    setSelected((value) => (value === id ? null : id));
  };

  const rotate = (by: number) => {
    if (!animated) return;
    spinRef.current.forEach((spin) => spin.stop());
    const target = clamp(turnBy.get() + by, -TURN_SPAN, TURN_SPAN);
    spinRef.current = [animate(turnBy, target, { duration: 0.45, ease: EASE_OPEN })];
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    const index = TOP_DOWN.findIndex((layer) => layer.id === current);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (index + 1) % TOP_DOWN.length;
    else if (event.key === "ArrowUp") next = (index - 1 + TOP_DOWN.length) % TOP_DOWN.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TOP_DOWN.length - 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      stopTour();
      rotate(event.key === "ArrowLeft" ? -KEY_TURN : KEY_TURN);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    stopTour();
    const id = TOP_DOWN[next].id;
    setCurrent(id);
    buttonRefs.current[id]?.focus();
  };

  // Перетаскивание: поворот по горизонтали, наклон по вертикали. Захват
  // указателя — только когда палец или мышь действительно поехали, иначе
  // клик по ярлыку ушёл бы в сцену
  const dragRef = useRef<{ id: number; x: number; y: number; turn: number; tilt: number; moved: boolean } | null>(null);

  const onScenePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!animated || event.button !== 0) return;
    spinRef.current.forEach((spin) => spin.stop());
    stopTour();
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      turn: turnBy.get(),
      tilt: tiltBy.get(),
      moved: false,
    };
  };

  const onScenePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "";
    }
    turnBy.set(clamp(drag.turn + dx * DRAG_TURN, -TURN_SPAN, TURN_SPAN));
    tiltBy.set(clamp(drag.tilt - dy * DRAG_TILT, TILT_MIN - TILT, TILT_MAX - TILT));
  };

  const onScenePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    delete event.currentTarget.dataset.dragging;
    if (!drag.moved) return;
    // Инерция: стопка докручивается и мягко упирается в край диапазона
    spinRef.current = [
      animate(turnBy, turnBy.get(), {
        type: "inertia",
        velocity: turnBy.getVelocity(),
        power: 0.25,
        timeConstant: 320,
        min: -TURN_SPAN,
        max: TURN_SPAN,
      }),
      animate(tiltBy, tiltBy.get(), {
        type: "inertia",
        velocity: tiltBy.getVelocity(),
        power: 0.2,
        timeConstant: 280,
        min: TILT_MIN - TILT,
        max: TILT_MAX - TILT,
      }),
    ];
  };

  const hostRef = (id: XrayLayerId) => (node: HTMLDivElement | null) => {
    hostRefs.current[id] = node;
  };

  const say = (text: { ru: string; en: string }) => dashes(text[lang], lang);

  return (
    <div
      ref={rootRef}
      data-xray
      data-xray-state={isPresent ? "open" : "closing"}
      data-xray-mode={wide ? "3d" : "list"}
      className="fixed inset-0 z-[60] overflow-hidden bg-bg-2"
    >
      {/* Сцена — только картинка: копии инертны, скринридер читает список
          слоёв. Её же тянут, чтобы повернуть */}
      <div
        aria-hidden
        data-xray-scene
        hidden={!wide}
        onPointerDown={onScenePointerDown}
        onPointerMove={onScenePointerMove}
        onPointerUp={onScenePointerUp}
        onPointerCancel={onScenePointerUp}
        className={`absolute inset-0 touch-none select-none ${animated ? "cursor-grab data-[dragging]:cursor-grabbing" : ""}`}
      >
        <div data-xray-stage className="absolute left-0 top-0">
          {XRAY_LAYERS.map((layer, index) => {
            const on = active === layer.id;
            return (
              <div key={layer.id} className="contents">
                {/* Лист слоя — заливка и четыре тонких края. Каждый кусок —
                    свой маленький слой композиции: рамка у самой пластины
                    сделала бы текстурой каждый краевой тайл полноэкранного
                    слоя, а прозрачность у общего родителя потребовала бы
                    отдельной поверхности на каждом кадре */}
                <div
                  ref={(node) => {
                    sheetRefs.current[index] = node;
                  }}
                  data-xray-sheet={layer.id}
                  className="pointer-events-none absolute left-0 top-0"
                  style={{ width: size.w, height: size.h, willChange: "transform" }}
                >
                  {SHEET_PARTS.map((part, k) => (
                    <div
                      key={part}
                      ref={(node) => {
                        sheetPartRefs.current[index][k] = node;
                      }}
                      className={`absolute transition-colors duration-200 ${SHEET_PART_CLASS[part]} ${
                        part === "fill"
                          ? layer.id === "ground"
                            ? on
                              ? "bg-accent/10"
                              : ""
                            : on
                              ? "bg-accent/14"
                              : "bg-surface/12 dark:bg-surface/30"
                          : on
                            ? "bg-accent"
                            : "bg-ink/25"
                      }`}
                      style={{ opacity: 0, willChange: "opacity" }}
                    />
                  ))}
                </div>
                <div
                  ref={(node) => {
                    plateRefs.current[index] = node;
                  }}
                  data-xray-plate={layer.id}
                  data-active={on ? "" : undefined}
                  // will-change держит растр пластины на всё раскрытие и вращение:
                  // без него браузер перерисовывал бы копии на каждом шаге перспективы
                  style={{ width: size.w, height: size.h, willChange: "transform" }}
                  className="pointer-events-none absolute left-0 top-0"
                >
                  {/* Копии обрезаются по экрану: дорога и облака тянутся на весь маршрут */}
                  <div
                    ref={(node) => {
                      clipRefs.current[layer.id] = node;
                    }}
                    className="absolute inset-0 overflow-hidden"
                  >
                    {layer.id === "ground" ? <div ref={groundRef} className="iso-grid absolute inset-0 bg-bg" /> : null}
                    <div ref={hostRef(layer.id)} inert data-xray-host className="absolute inset-0 [&_*]:pointer-events-none!" />
                    {layer.id === "town" ? (
                      <div ref={gridRef} data-xray-grid hidden={!grid} className="absolute inset-0" />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Ярлыки — плоские, лицом к зрителю, у левого угла своей пластины */}
          {XRAY_LAYERS.map((layer, index) => {
            const on = active === layer.id;
            const dimmed = active !== null && !on;
            return (
              <div
                key={layer.id}
                ref={(node) => {
                  labelRefs.current[index] = node;
                }}
                data-xray-label={layer.id}
                className="absolute left-0 top-0"
                style={{ opacity: 0, willChange: "transform" }}
              >
                <div
                  onPointerEnter={() => setHovered(layer.id)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={() => toggle(layer.id)}
                  className={`flex -translate-x-full -translate-y-1/2 cursor-pointer items-center transition-opacity duration-200 motion-reduce:transition-none ${
                    dimmed ? "opacity-35" : "opacity-100"
                  }`}
                >
                  <span
                    className={`whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-200 ${
                      on ? "border-accent bg-accent text-bg" : "border-line bg-surface text-ink"
                    }`}
                  >
                    {layer.name[lang]}
                  </span>
                  <span className={`h-px w-4 ${on ? "bg-accent" : "bg-muted/60"}`} />
                  <span className={`size-1.5 rounded-full ${on ? "bg-accent" : "bg-muted"}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-xray-panel
        // Свой слой композиции: иначе список рисовался бы в слой фона разбора,
        // и проявление перерастрировало бы его на каждом кадре раскрытия
        style={{ opacity: wide ? progress : 1, willChange: "opacity" }}
        className="absolute inset-0 flex flex-col bg-surface text-ink outline-none md:inset-auto md:bottom-4 md:left-4 md:right-4 md:max-h-[46%] md:rounded-2xl md:border md:border-line md:shadow-2xl md:shadow-shadow/30 lg:bottom-auto lg:left-6 lg:right-auto lg:top-1/2 lg:max-h-[calc(100%-48px)] lg:w-[340px] lg:-translate-y-1/2"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4 md:px-4 md:pt-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-base font-bold tracking-tight">
              {UI.xrayTitle[lang]}
            </h2>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{say(UI.xraySubtitle)}</p>
          </div>
          <button
            type="button"
            onClick={closeXray}
            aria-label={UI.xrayClose[lang]}
            data-xray-close
            className="-mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-accent/10 hover:text-accent"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 md:px-2">
          <ul
            id={listId}
            aria-label={UI.xrayLayers[lang]}
            className="grid gap-0.5"
            onKeyDown={onListKeyDown}
            onPointerLeave={() => setHovered(null)}
          >
            {TOP_DOWN.map((layer) => {
              const on = active === layer.id;
              const open = selected === layer.id;
              const detailId = `${listId}-${layer.id}`;
              return (
                <li key={layer.id} className={`rounded-xl transition-colors duration-150 ${open ? "bg-accent/6" : ""}`}>
                  <button
                    ref={(node) => {
                      buttonRefs.current[layer.id] = node;
                    }}
                    type="button"
                    data-xray-layer={layer.id}
                    data-active={on ? "" : undefined}
                    tabIndex={current === layer.id ? 0 : -1}
                    aria-expanded={open}
                    aria-controls={detailId}
                    onPointerEnter={() => setHovered(layer.id)}
                    onFocus={() => {
                      setFocused(layer.id);
                      setCurrent(layer.id);
                    }}
                    onBlur={() => setFocused(null)}
                    onClick={() => toggle(layer.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150 ${
                      on ? "bg-accent/12" : "hover:bg-accent/6"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={`size-2 shrink-0 rounded-full transition-colors duration-150 ${on ? "bg-accent" : "bg-line"}`}
                        />
                        <span className="block text-sm font-medium">{layer.name[lang]}</span>
                      </span>
                      <span data-xray-note className="mt-0.5 block font-mono text-[11px] leading-snug text-muted">
                        {say(layer.note)}
                      </span>
                    </span>
                    {/* Превью слоя в режиме списка. В разметке после подписи —
                        первый .font-medium кнопки должен быть её именем */}
                    <span
                      aria-hidden
                      hidden={wide}
                      className="relative order-first block shrink-0 overflow-hidden rounded-md border border-line bg-bg"
                      style={{ width: THUMB.w, height: THUMB.h }}
                    >
                      <span
                        ref={(node) => {
                          thumbRefs.current[layer.id] = node as HTMLDivElement | null;
                        }}
                        inert
                        data-xray-thumb={layer.id}
                        className="absolute left-0 top-0 block origin-top-left [&_*]:pointer-events-none!"
                        style={{ width: size.w, height: size.h }}
                      />
                    </span>
                    <span
                      aria-hidden
                      className={`shrink-0 font-mono text-xs text-muted transition-transform duration-200 motion-reduce:transition-none ${
                        open ? "rotate-90" : ""
                      }`}
                    >
                      ›
                    </span>
                  </button>
                  <div id={detailId} data-xray-detail={layer.id} hidden={!open} className="px-3 pb-3 pt-1 md:pl-8">
                    <p className="text-[13px] leading-relaxed">{say(layer.more)}</p>
                    <p
                      ref={(node) => {
                        emptyRefs.current[layer.id] = node;
                      }}
                      className="mt-1.5 text-[13px] text-muted"
                    >
                      {say(UI.xrayEmpty)}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-accent">{layer.files}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-1 border-t border-line px-1 pt-1">
            <button
              type="button"
              data-xray-how
              aria-expanded={howOpen}
              aria-controls={`${listId}-how`}
              onClick={() => setHowOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-accent/6"
            >
              {say(UI.xrayHow)}
              <span
                aria-hidden
                className={`font-mono text-xs text-muted transition-transform duration-200 motion-reduce:transition-none ${
                  howOpen ? "rotate-90" : ""
                }`}
              >
                ›
              </span>
            </button>
            <p id={`${listId}-how`} hidden={!howOpen} className="px-2 pb-2 text-[13px] leading-relaxed text-muted">
              {say(UI.xrayHowText)}
            </p>
          </div>
        </div>

        {wide ? (
          <div className="border-t border-line px-3 pb-3 pt-2 md:px-2">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                data-xray-tour
                aria-pressed={touring}
                onClick={() => {
                  if (touring) {
                    setTouring(false);
                    setSelected(null);
                    return;
                  }
                  setSelected(XRAY_LAYERS[0].id);
                  setTouring(true);
                }}
                className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
                  touring ? "border-accent bg-accent/12 text-accent" : "border-line hover:border-accent hover:text-accent"
                }`}
              >
                {say(touring ? UI.xrayTourStop : UI.xrayTour)}
              </button>
              <button
                type="button"
                data-xray-grid-toggle
                aria-pressed={grid}
                onClick={() => setGrid((value) => !value)}
                className="ml-auto flex items-center gap-2 rounded-full px-2 py-1.5 text-[13px] transition-colors hover:bg-accent/6"
              >
                {UI.xrayGrid[lang]}
                <span
                  aria-hidden
                  className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
                    grid ? "border-accent bg-accent/25" : "border-line bg-bg"
                  }`}
                >
                  <span
                    className={`absolute left-0 top-1/2 size-3 -translate-y-1/2 rounded-full transition-transform duration-200 motion-reduce:transition-none ${
                      grid ? "translate-x-[19px] bg-accent" : "translate-x-[3px] bg-muted"
                    }`}
                  />
                </span>
              </button>
            </div>
            <p data-xray-hint className="mt-2 px-1 font-mono text-[10.5px] leading-snug text-muted">
              {say(animated ? UI.xrayHint : UI.xrayHintStatic)}
            </p>
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
