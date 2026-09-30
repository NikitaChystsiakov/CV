"use client";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, type ReactElement, type ReactNode } from "react";

import { useFocusTrap } from "@/components/room/use-focus-trap";
import {
  useCompactViewport,
  useIsClient,
  useNarrowViewport,
} from "@/components/room/use-room-layout";
import { useScrollLock } from "@/components/room/use-scroll-lock";
import { UI } from "@/lib/content";
import type { RoomArt, Spot } from "@/lib/room-art";
import { useLang } from "@/lib/use-lang";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Интерьер дома: угол комнаты из плоскостей на CSS 3D, весь контент — обычный
 * HTML (раздел 4.2 концепта).
 *
 * ── Что в кадре ─────────────────────────────────────────────────────────────
 * Не окно поверх города, а разрез дома: зритель стоит в проёме передней стены
 * и смотрит внутрь. Видны задняя стена, левая боковая стена и пол, уходящий в
 * глубину, а по переднему краю — срез стены и перекрытия тоном камня, из
 * которого сложены дома владельца. Стыки (угол, плинтус, линия пола) — тоном,
 * без рамок. Ни шапки, ни карточки: название дома — вывеска на задней стене,
 * кнопка закрытия — в углу кадра, отдельно от комнаты.
 *
 * ── Геометрия ───────────────────────────────────────────────────────────────
 * Задняя стена стоит в плоскости экрана (z = 0) и фронтально к камере: весь
 * текст живёт на ней, в настоящем размере, без ракурса. Боковая стена и пол
 * идут от неё НА зрителя, под прямым углом, как в настоящей комнате: текста
 * на них нет, поэтому им можно быть честной коробкой, а не веером плоскостей,
 * развёрнутых к камере ради читаемости. Размеры — в `globals.css` (`.room-fit`).
 *
 * ── Слоты ───────────────────────────────────────────────────────────────────
 * - `wall` — главное: левая колонка задней стены, под вывеской;
 * - `shelf` — перечисления: полка-ярусы на задней стене справа. Не на боковой
 *   стене, как в первом прототипе: боковая стена под прямым углом уходит в
 *   ракурс, и текст на ней не читается — правило 4.2 «читаемость важнее
 *   эффекта» разворачивает полку к камере;
 * - `slate` — наклонный планшет, стоящий на полу перед стеной.
 *
 * Любой слот может прийти `null`. Пустая стена остаётся стеной — вывеска,
 * плинтус, угол, — а не пустым блоком: у неё нет своего фона-прямоугольника,
 * она сама часть помещения. Раскладка задней стены сама перестраивается под
 * набор слотов (`data-fill`), так что наполнение комнаты не требует правок здесь.
 */
export type RoomSlots = {
  wall: ReactNode | null;
  shelf: ReactNode | null;
  slate: ReactNode | null;
};

type SlotName = keyof RoomSlots;

/** Камера, которой вход в дом (`use-house-entry.ts`) ведёт комнату */
export type RoomCamera = { opacity: MotionValue<number>; scale: MotionValue<number> };

/**
 * Отворот камеры за курсором, градусы. Маленький: задняя стена с текстом
 * должна оставаться фронтальной, движение только подтверждает, что это объём.
 */
const LOOK = {
  yaw: [-2.5, 2.5],
  pitch: [1.8, -1.8],
};

export function HouseRoom({
  title,
  slots,
  onClose,
  camera,
  art = null,
}: {
  title: string;
  slots: RoomSlots;
  onClose: () => void;
  camera?: RoomCamera;
  /** Интерьер картинкой (`room-art.ts`). `null` — комната на CSS 3D */
  art?: RoomArt | null;
}): ReactElement {
  const { lang } = useLang();
  const reducedMotion = usePrefersReducedMotion();
  const narrow = useNarrowViewport();
  const compact = useCompactViewport();
  const isClient = useIsClient();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const filled = (["wall", "shelf", "slate"] as SlotName[]).filter((name) => slots[name]);
  // Плоская подача: на узком экране и в статичном режиме перспективы нет вовсе.
  // Полная комната (все три слота) на тесном экране тоже плоская: на задней
  // стене им не хватает места, а текст важнее объёма
  const flat = narrow || reducedMotion || (filled.length === 3 && compact);

  useScrollLock();
  useFocusTrap(dialogRef);

  // Escape ловится на документе, а не на диалоге: фокус мог оказаться где угодно
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Камера следит за курсором. Только motion values, без useState на кадр.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], LOOK.yaw), {
    stiffness: 70,
    damping: 20,
  });
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], LOOK.pitch), {
    stiffness: 70,
    damping: 20,
  });

  function onPointerMove(event: React.PointerEvent) {
    if (flat) return;
    pointerX.set(event.clientX / window.innerWidth - 0.5);
    pointerY.set(event.clientY / window.innerHeight - 0.5);
  }

  // Портал на body: комната модальная и не должна зависеть от того, в каком
  // слое маршрута её открыли. Слои остановки живут под `contain: layout`, а он
  // делает элемент контейнером для `position: fixed` внутри себя.
  if (!isClient) return <></>;

  const sign = (
    <h2 id={titleId} className="room-sign text-balance font-display font-extrabold">
      {title}
    </h2>
  );

  return createPortal(
    <div data-room className="fixed inset-0 z-[60]" onPointerMove={onPointerMove}>
      {/* Подложка — только цель клика «мимо комнаты». Цвета у неё нет: город
          уводит под завесу слой входа (`route-stop.tsx`), и он же держит
          завесу, пока комната открыта. Две завесы друг на друге темнели бы
          скачком в момент смены дома комнатой */}
      <div data-room-backdrop aria-hidden onClick={onClose} className="absolute inset-0" />

      {/* Диалог растянут на кадр, но сквозной для мыши: клик по завесе вокруг
          комнаты должен доставаться подложке. Ловят его только сама комната и
          кнопка закрытия */}
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 outline-none sm:p-8"
        style={camera ? { opacity: camera.opacity } : undefined}
      >
        {/* Закрытие — в углу кадра, а не в шапке: шапки у комнаты нет */}
        {/* Крестик ниже полосы верхней панели: в её ряду он садился прямо на
            переключатель темы — панель под завесой видна, и два круглых
            контрола читались одним */}
        <button
          type="button"
          data-room-close
          onClick={onClose}
          aria-label={UI.roomClose[lang]}
          className="room-close pointer-events-auto fixed right-4 top-[4.75rem] z-10 grid size-11 place-items-center rounded-full transition-[background-color,color,transform] duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:right-6"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {flat ? (
          // Плоская подача: та же задняя стена, развёрнутая в лист. Один
          // уровень поверхности — слоты не получают своих рамок внутри неё
          // Масштаб камеры — и здесь: полная комната на ноутбуке плоская, но
          // входят в неё той же дверью, и лист растёт из проёма, а не выскакивает
          <motion.div
            data-room-stage
            data-lenis-prevent
            className="room-flat pointer-events-auto mt-12 max-h-[calc(100%-3rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl sm:mt-0 sm:max-h-full"
            style={camera ? { scale: camera.scale } : undefined}
          >
            <div className="px-6 pb-8 pt-7 sm:px-10 sm:pt-9">
              {sign}
              {filled.map((name) => (
                <section
                  key={name}
                  data-room-slot={name}
                  className={`mt-8 ${name === "shelf" ? "room-shelf" : ""}`}
                >
                  {slots[name]}
                </section>
              ))}
            </div>
            {/* Плинтус и полоска пола: лист — это стена, а не карточка */}
            <div aria-hidden className="room-flat__plinth" />
            <div aria-hidden className="room-flat__floor" />
          </motion.div>
        ) : art ? (
          // Интерьер картинкой: фон — арт владельца, контент — на размеченных
          // точках. Взгляд за курсором тот же, но без плоскостей: картинка
          // сама несёт перспективу
          <motion.div
            data-room-stage
            data-room-art
            className="room-art pointer-events-auto"
            style={{
              ...(camera ? { scale: camera.scale } : null),
              rotateX,
              rotateY,
              ["--room-art-ratio" as string]: `${art.width} / ${art.height}`,
            }}
          >
            <Image
              src={art.src}
              alt=""
              fill
              sizes="(max-width: 1280px) 100vw, 1180px"
              className="scene-art select-none rounded-2xl object-cover"
              priority
            />
            <div className="room-art__spot" style={spotStyle(art.spots.sign)}>
              {sign}
            </div>
            {filled.map((name) => (
              <div
                key={name}
                data-room-slot={name}
                data-lenis-prevent
                className={`room-art__spot ${name === "shelf" ? "room-shelf" : ""}`}
                style={spotStyle(art.spots[name])}
              >
                {slots[name]}
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            className="room-fit pointer-events-auto"
            style={camera ? { scale: camera.scale } : undefined}
          >
            <div data-room-stage className="room-scene">
              <motion.div className="room-box" style={{ rotateX, rotateY }}>
                {/* Пол и боковая стена — архитектура: текста на них нет */}
                {/* Свет — градиенты на токенах: окно с небом по теме, пятно
                    света от него, тень в углах. Статично, на кадре не считается */}
                <div className="room-plane room-plane--floor" aria-hidden>
                  <div className="room-light room-light--floor" />
                </div>
                <div className="room-plane room-plane--side" aria-hidden>
                  <div className="room-shade" />
                  <div data-room-window className="room-window">
                    <div className="room-window__glow" />
                  </div>
                  <div className="room-sill" />
                  <div className="room-plinth" />
                </div>
                {/* Срез по переднему краю: толщина перекрытия и стены */}
                <div className="room-cut room-cut--floor" aria-hidden />
                <div className="room-cut room-cut--side" aria-hidden />

                <div
                  className="room-plane room-plane--wall"
                  data-fill={filled.filter((name) => name !== "slate").join(" ") || "none"}
                  data-slate={slots.slate ? "" : undefined}
                >
                  <div className="room-shade" aria-hidden />
                  <div className="room-light room-light--wall" aria-hidden />
                  <div className="room-wall">
                    {sign}
                    {slots.wall ? (
                      <div
                        data-room-slot="wall"
                        className="room-surface room-wall__text"
                        data-lenis-prevent
                      >
                        {slots.wall}
                      </div>
                    ) : null}
                    {slots.shelf ? (
                      <div
                        data-room-slot="shelf"
                        className="room-surface room-shelf room-wall__shelf"
                        data-lenis-prevent
                      >
                        {slots.shelf}
                      </div>
                    ) : null}
                  </div>
                  <div className="room-plinth" aria-hidden />
                  <div className="room-doorway" aria-hidden />
                </div>

                {slots.slate ? (
                  <div className="room-plane room-plane--slate">
                    <div data-room-slot="slate" className="room-surface p-6" data-lenis-prevent>
                      {slots.slate}
                    </div>
                  </div>
                ) : null}
              </motion.div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}

/** Точка интерьера в процентах картинки. */
function spotStyle(spot: Spot) {
  return {
    left: `${spot.x * 100}%`,
    top: `${spot.y * 100}%`,
    width: `${spot.w * 100}%`,
    height: `${spot.h * 100}%`,
  };
}
