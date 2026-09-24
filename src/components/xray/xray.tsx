"use client";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  usePresence,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { CloseIcon } from "@/components/command-palette/icons";
import { useFocusTrap } from "@/components/room/use-focus-trap";
import { useScrollLock } from "@/components/room/use-scroll-lock";
import { UI } from "@/lib/content";
import { dashes } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

import { captureLayers, clearLayers, XRAY_LAYERS, type XrayLayerId } from "./snapshot";
import { closeXray, useXrayOpen, xrayReturnFocusTarget, XRAY_MEDIA } from "./store";

/**
 * «Разбор сайта» — текущий экран, разложенный в 3D на слои, как «3D view» в
 * инструментах разработчика. Награда за мини-игру.
 *
 * Устройство:
 * - В момент открытия `captureLayers` копирует видимые элементы каждого слоя
 *   в свою пластину на их места на экране (почему копии, а не живой DOM, — в
 *   `snapshot.ts`). Пластины — полноэкранные плоские слои в общем
 *   `preserve-3d`-контейнере.
 * - Раскрытие — одно значение `progress` от 0 до 1: из него считаются наклон
 *   сцены в изометрию и вынос пластин по Z. При 0 всё лежит плоско и совпадает
 *   с экраном, поэтому переход начинается без скачка. Анимируются только
 *   transform и opacity; React на кадре не перерисовывается.
 * - Выход ждёт обратной анимации через `usePresence`, и только потом слой
 *   размонтируется: снимается замок скролла (страница на том же месте), фокус
 *   возвращается на кнопку, с которой открыли.
 *
 * Слой `z-[60]` — как у комнаты дома: над панелью, под палитрой.
 */

/** На сколько приподнимается выбранный слой, пикселей по Z. */
const LIFT = 56;
/** Ширина панели со списком слоёв. */
const PANEL = 300;

const EASE_OPEN = [0.16, 1, 0.3, 1] as const;
const EASE_CLOSE = [0.65, 0, 0.35, 1] as const;

type Geometry = {
  tiltX: number;
  tiltZ: number;
  gap: number;
  scale: number;
  dx: number;
  dy: number;
  perspective: number;
};

/**
 * Поза разобранной сцены под текущее окно. Пластина размером с экран,
 * повёрнутая и наклонённая, занимает «ромб» — масштаб подбирается так, чтобы
 * ромб со всей стопкой влез справа от панели.
 */
function geometry(): Geometry {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const tiltX = 54;
  const tiltZ = -36;
  const gap = Math.min(92, Math.max(48, H * 0.09));
  const depth = gap * (XRAY_LAYERS.length - 1) + LIFT;
  const rx = (tiltX * Math.PI) / 180;
  const rz = (Math.abs(tiltZ) * Math.PI) / 180;
  const footW = W * Math.cos(rz) + H * Math.sin(rz);
  const footH = (W * Math.sin(rz) + H * Math.cos(rz)) * Math.cos(rx) + depth * Math.sin(rx);
  const aside = PANEL + 48;
  const scale = Math.min((W - aside - 48) / footW, (H - 72) / footH) * 0.92;
  return {
    tiltX,
    tiltZ,
    gap,
    scale,
    dx: aside / 2,
    // Стопка растёт вверх по экрану — центрируем её середину, а не дно
    dy: (scale * depth * Math.sin(rx)) / 2,
    perspective: Math.max(W, H) * 2.2,
  };
}

function stageTransform(g: Geometry, p: number) {
  return `translate3d(${g.dx * p}px, ${g.dy * p}px, 0) scale(${1 + (g.scale - 1) * p}) rotateX(${g.tiltX * p}deg) rotateZ(${g.tiltZ * p}deg)`;
}

/**
 * Подгонка позы замером. Формула в `geometry` не знает перспективы: ближний
 * край стопки выходит крупнее расчёта и срезался краем окна. Поэтому один раз
 * при открытии сцена ставится в конечную позу, её габарит (пластины вместе с
 * ярлыками и приподнятой верхней) меряется, масштаб и сдвиг поправляются, и
 * стили возвращаются как были. Два прохода: сначала масштаб, потом центр.
 */
function fitStage(stage: HTMLElement, first: Geometry): Geometry {
  const plates = Array.from(stage.querySelectorAll<HTMLElement>("[data-xray-plate]"));
  const parts = [...plates, ...stage.querySelectorAll<HTMLElement>("[data-xray-tag]")];
  const before = [stage, ...plates].map((el) => el.style.transform);

  const W = window.innerWidth;
  const H = window.innerHeight;
  const area = { left: PANEL + 72, right: W - 24, top: 24, bottom: H - 24 };

  const measure = (g: Geometry) => {
    stage.style.transform = stageTransform(g, 1);
    plates.forEach((plate, index) => {
      const lift = index === plates.length - 1 ? LIFT : 0;
      plate.style.transform = `translateZ(${index * g.gap + lift}px)`;
    });
    const rects = parts.map((el) => el.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
  };

  let g = first;
  const box = measure(g);
  const k = Math.min(
    (area.right - area.left) / (box.right - box.left),
    (area.bottom - area.top) / (box.bottom - box.top),
  );
  g = { ...g, scale: g.scale * k };
  const fitted = measure(g);
  g = {
    ...g,
    dx: g.dx + (area.left + area.right) / 2 - fitted.cx,
    dy: g.dy + (area.top + area.bottom) / 2 - fitted.cy,
  };

  [stage, ...plates].forEach((el, index) => {
    el.style.transform = before[index];
  });
  return g;
}

/** Слушатель ширины: ниже 1024 разбор закрывается сам. */
/** Сколько пластины стоят плоско, пока браузер их растеризует, мс. */
const RASTER_HOLD = 160;

export function Xray() {
  const open = useXrayOpen();

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia(XRAY_MEDIA);
    const onChange = () => {
      if (!media.matches) closeXray();
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [open]);

  return <AnimatePresence>{open ? <XrayScene key="xray" /> : null}</AnimatePresence>;
}

function XrayScene() {
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const [isPresent, safeToRemove] = usePresence();
  const [geo] = useState(geometry);
  // Поза уточняется замером после снимка (`fitStage`) — читается из ref,
  // потому что нужна только внутри вычисления transform, а не в разметке
  const geoRef = useRef(geo);
  const stageRef = useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);

  const [hovered, setHovered] = useState<XrayLayerId | null>(null);
  const [pinned, setPinned] = useState<XrayLayerId | null>(null);
  const [grid, setGrid] = useState(false);
  // На выходе подсветка снимается сразу: слои должны лечь обратно ровно
  const active = isPresent ? (hovered ?? pinned) : null;

  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const groundRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const hostRefs = useRef<Partial<Record<XrayLayerId, HTMLDivElement | null>>>({});
  const readyRef = useRef<Promise<void>>(Promise.resolve());

  const titleId = useId();

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
    if (stageRef.current) geoRef.current = fitStage(stageRef.current, geo);
    return () => clearLayers(hosts, gridHost);
    // geo из useState и не меняется: снимок делается один раз на открытие
  }, [geo]);

  useScrollLock();
  useFocusTrap(panelRef);

  // Возврат фокуса — после снятия ловушки (эффекты снимаются по порядку)
  useEffect(() => () => xrayReturnFocusTarget()?.focus({ preventScroll: true }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeXray();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Раскрытие и сборка обратно. При reduced-motion — сразу в конечное состояние
  useEffect(() => {
    let cancelled = false;
    let controls: AnimationPlaybackControls | undefined;
    let hold: number | undefined;
    readyRef.current.then(() => {
      if (cancelled) return;
      if (isPresent) {
        if (rootRef.current) rootRef.current.style.opacity = "1";
        if (reduced) {
          progress.set(1);
          return;
        }
        // Пауза перед раскрытием. Пока корень стоял с opacity 0, браузер
        // пластины не растеризовал, и растр восьми полноэкранных слоёв на
        // Retina (около 80 тайлов на каждый) приходился на первые кадры
        // анимации: 11–12 кадров длиннее 20 мс. В плоском положении пластины
        // совпадают со страницей, поэтому пауза не видна — видно только, что
        // раскрытие идёт ровно
        hold = window.setTimeout(() => {
          if (!cancelled) controls = animate(progress, 1, { duration: 0.7, ease: EASE_OPEN });
        }, RASTER_HOLD);
      } else if (reduced) {
        safeToRemove?.();
      } else {
        controls = animate(progress, 0, {
          duration: 0.55,
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
  }, [isPresent, progress, reduced, safeToRemove]);

  const stage = useTransform(progress, (p) => stageTransform(geoRef.current, p));
  const panelX = useTransform(progress, [0, 1], [-24, 0]);

  const hostRef = (id: XrayLayerId) => (node: HTMLDivElement | null) => {
    hostRefs.current[id] = node;
  };

  return (
    <div ref={rootRef} data-xray data-xray-state={isPresent ? "open" : "closing"} className="fixed inset-0 z-[60] overflow-hidden bg-bg-2">
      {/* Сцена — только картинка: копии инертны, скринридер читает список слоёв */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ perspective: geo.perspective }}>
        <motion.div ref={stageRef} data-xray-stage className="absolute inset-0" style={{ transform: stage, transformStyle: "preserve-3d", willChange: "transform" }}>
          {XRAY_LAYERS.map((layer, index) => (
            <Plate
              key={layer.id}
              id={layer.id}
              index={index}
              label={layer.name[lang]}
              gap={geo.gap}
              progress={progress}
              active={active === layer.id}
              dimmed={active !== null && active !== layer.id}
              reduced={reduced}
              hostRef={hostRef(layer.id)}
              onHover={setHovered}
              ground={layer.id === "ground" ? groundRef : undefined}
            >
              {layer.id === "town" ? (
                <div ref={gridRef} data-xray-grid hidden={!grid} className="absolute inset-0" />
              ) : null}
            </Plate>
          ))}
        </motion.div>
      </div>

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-xray-panel
        style={{ opacity: progress, x: panelX, width: PANEL }}
        className="absolute left-6 top-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-2 text-ink shadow-2xl shadow-shadow/30 outline-none"
      >
        <div className="flex items-center justify-between gap-3 py-1 pl-3 pr-1">
          <h2 id={titleId} className="font-display text-base font-bold tracking-tight">
            {UI.xrayTitle[lang]}
          </h2>
          <button
            type="button"
            onClick={closeXray}
            aria-label={UI.xrayClose[lang]}
            data-xray-close
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-accent/10 hover:text-accent"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <ul aria-label={UI.xrayLayers[lang]} className="mt-1 grid gap-0.5" onPointerLeave={() => setHovered(null)}>
          {/* Сверху вниз, как в инструментах разработчика: первой идёт верхняя панель */}
          {[...XRAY_LAYERS].reverse().map((layer) => {
            const on = active === layer.id;
            return (
              <li key={layer.id}>
                <button
                  type="button"
                  data-xray-layer={layer.id}
                  data-active={on ? "" : undefined}
                  aria-pressed={pinned === layer.id}
                  onPointerEnter={() => setHovered(layer.id)}
                  onFocus={() => setHovered(layer.id)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setPinned((current) => (current === layer.id ? null : layer.id))}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-150 ${
                    on ? "bg-accent/12" : "hover:bg-accent/6"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-[7px] size-2 shrink-0 rounded-full transition-colors duration-150 ${
                      on ? "bg-accent" : "bg-line"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{layer.name[lang]}</span>
                    <span data-xray-note className="block font-mono text-[11px] leading-snug text-muted">
                      {dashes(layer.note[lang], lang)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-1 border-t border-line px-1 pt-2">
          <button
            type="button"
            data-xray-grid-toggle
            aria-pressed={grid}
            onClick={() => setGrid((value) => !value)}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-accent/6"
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
      </motion.div>
    </div>
  );
}

type PlateProps = {
  id: XrayLayerId;
  index: number;
  label: string;
  gap: number;
  progress: MotionValue<number>;
  active: boolean;
  dimmed: boolean;
  reduced: boolean;
  hostRef: (node: HTMLDivElement | null) => void;
  onHover: (id: XrayLayerId | null) => void;
  ground?: RefObject<HTMLDivElement | null>;
  children?: ReactNode;
};

/**
 * Одна пластина. Своя глубина — `index × gap`, выбранная приподнимается ещё
 * на `LIFT`. Всё умножено на `progress`, поэтому при сборке обратно слои
 * ложатся ровно в плоскость экрана, даже если один был приподнят.
 */
function Plate({ id, index, label, gap, progress, active, dimmed, reduced, hostRef, onHover, ground, children }: PlateProps) {
  const lift = useMotionValue(0);

  useEffect(() => {
    if (reduced) {
      lift.set(active ? LIFT : 0);
      return;
    }
    const controls = animate(lift, active ? LIFT : 0, { duration: 0.3, ease: EASE_OPEN });
    return () => controls.stop();
  }, [active, lift, reduced]);

  const transform = useTransform(() => `translateZ(${((index * gap + lift.get()) * progress.get()).toFixed(2)}px)`);

  return (
    <motion.div
      data-xray-plate={id}
      data-active={active ? "" : undefined}
      // will-change держит растр пластины на всё раскрытие: без него Chrome
      // перерисовывал копии (дорога, дома) при каждом шаге перспективы, и
      // раскрытие шло рывками — 11 длинных кадров при обычном CPU
      style={{ transform, opacity: dimmed ? 0.16 : 1, willChange: "transform" }}
      className="absolute inset-0 transition-opacity duration-300 ease-out motion-reduce:transition-none"
    >
      {/* Сами копии обрезаются по экрану: дорога и облака тянутся на весь маршрут */}
      <div className="absolute inset-0 overflow-hidden">
        {ground ? <div ref={ground} className="iso-grid absolute inset-0 bg-bg" /> : null}
        <div ref={hostRef} inert data-xray-host className="absolute inset-0 [&_*]:pointer-events-none!" />
        {children}
      </div>

      {/* Рамка и ярлык проявляются по мере раскрытия */}
      <motion.div
        style={{ opacity: progress }}
        className={`absolute inset-0 rounded-[6px] border transition-colors duration-200 ${
          active ? "border-accent" : "border-muted/30"
        } ${active && id !== "ground" ? "bg-accent/8" : ""}`}
      />
      <motion.div
        style={{ opacity: progress }}
        onPointerEnter={() => onHover(id)}
        onPointerLeave={() => onHover(null)}
        data-xray-tag
        className={`pointer-events-auto absolute -top-9 left-0 rounded-md border px-2.5 py-1 font-mono text-[22px] uppercase tracking-[0.12em] ${
          active ? "border-accent bg-accent text-bg" : "border-line bg-surface text-ink"
        }`}
      >
        {label}
      </motion.div>
    </motion.div>
  );
}
