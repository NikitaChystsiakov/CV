"use client";

import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { RoomCamera } from "@/components/room/house-room";
import { useFocusTrap } from "@/components/room/use-focus-trap";
import { useIsClient } from "@/components/room/use-room-layout";
import { useScrollLock } from "@/components/room/use-scroll-lock";
import { UI } from "@/lib/content";
import { useLang } from "@/lib/use-lang";

/**
 * Дом-галерея изнутри: плоская панель вместо 3D-комнаты (блок 3).
 *
 * Дому навыков и дому кейсов объём комнаты не нужен: по концепту это стена с
 * экспозицией — плитки демо или картины-кейсы. Поэтому интерьер здесь — та же
 * штукатурка, плинтус и полоска пола, что у плоской подачи комнаты
 * (`.room-flat`), но во всю ширину и с прокруткой внутри.
 *
 * Поведение — контракт комнаты, и `verify` (Э5) проверяет его одинаково для
 * всех домов: корень `[data-room]` на z-60, подложка `[data-room-backdrop]`,
 * кнопка `[data-room-close]`, фокус-ловушка, Escape, замок скролла, возврат
 * фокуса на дом (его делает `useHouseEntry`). Камера входа — та же: панель
 * проявляется в дверном проёме и растёт вместе с ним (`camera`).
 *
 * ── Слой поверх панели ──────────────────────────────────────────────────────
 * «Как сделано» у демо и крупный скриншот у кейса — второй модальный слой
 * внутри той же панели (`PanelOverlay`). Он рисуется порталом в узел панели
 * вне листа — у листа `transform` от камеры, и `position: fixed` внутри него
 * считался бы от листа, а не от экрана. Пока слой открыт, лист и кнопка
 * выхода получают `inert`: фокус-ловушка их пропускает, и таб ходит только
 * по слою. Escape и клик мимо закрывают сначала слой, потом дом.
 */

type OverlayApi = {
  /** Узел, куда слой рисуется порталом */
  host: HTMLElement | null;
  /** Слой открылся (`close` — как его закрыть) или закрылся (`null`) */
  setOverlay: (close: (() => void) | null) => void;
};

const PanelContext = createContext<OverlayApi | null>(null);

type HousePanelProps = {
  /** id остановки — селектор для проверок (`data-house-panel`) */
  id: string;
  title: string;
  onClose: () => void;
  camera?: RoomCamera;
  /** Строка-подводка под вывеской */
  lead?: ReactNode;
  children: ReactNode;
};

/**
 * Панель рисуется порталом на `body`, поэтому только в браузере. Проверка
 * вынесена наружу, а не стоит ранним `return` внутри: на dev-превью панель
 * монтируется открытой ещё при гидратации, и эффекты фокус-ловушки и замка
 * скролла отработали бы вхолостую, пока диалога нет, — и больше не
 * перезапустились бы.
 */
export function HousePanel(props: HousePanelProps) {
  const isClient = useIsClient();
  return isClient ? <HousePanelBody {...props} /> : null;
}

function HousePanelBody({
  id,
  title,
  onClose,
  camera,
  lead,
  children,
}: HousePanelProps) {
  const { lang } = useLang();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  // Узел под слой нужен разметке (портал), поэтому он в состоянии: меняется
  // один раз, при монтировании
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const overlayClose = useRef<(() => void) | null>(null);

  useScrollLock();
  useFocusTrap(dialogRef);

  const setOverlay = useCallback((close: (() => void) | null) => {
    overlayClose.current = close;
    // `inert` ставится на DOM напрямую, без состояния: это синхронизация с
    // браузером, а не данные для рендера
    if (chromeRef.current) chromeRef.current.inert = close !== null;
  }, []);

  // Escape ловится на документе, как у комнаты: фокус мог оказаться где угодно
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (overlayClose.current) overlayClose.current();
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const api = useMemo(() => ({ host, setOverlay }), [host, setOverlay]);

  return createPortal(
    <div data-room data-house-panel={id} className="fixed inset-0 z-[60]">
      {/* Подложка без цвета: завесу держит слой входа (`route-stop.tsx`) */}
      <div
        data-room-backdrop
        aria-hidden
        onClick={() => (overlayClose.current ? overlayClose.current() : onClose())}
        className="absolute inset-0"
      />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 outline-none sm:p-6"
        style={camera ? { opacity: camera.opacity } : undefined}
      >
        <div ref={chromeRef} className="contents">
          {/* Выход — в углу кадра, ниже полосы верхней панели, как у комнаты */}
          <button
            type="button"
            data-room-close
            onClick={onClose}
            aria-label={UI.housePanelClose[lang]}
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

          {/* Лист — задняя стена дома. Прокрутка своя: data-lenis-prevent
              отдаёт ей колесо, пока Lenis маршрута остановлен замком */}
          <motion.div
            data-room-stage
            data-lenis-prevent
            className="house-panel pointer-events-auto mt-12 max-h-[calc(100%-3rem)] w-full max-w-6xl overflow-y-auto overscroll-contain rounded-2xl sm:mt-0 sm:max-h-full"
            style={camera ? { scale: camera.scale } : undefined}
          >
            <div className="px-4 pb-8 pt-6 sm:px-8 sm:pt-8 lg:px-10">
              {/* Правый отступ — под кнопку выхода: на телефоне она садится
                  на верхний край листа */}
              <h2
                id={titleId}
                className="room-sign text-balance pr-12 font-display font-extrabold sm:pr-14"
              >
                {title}
              </h2>
              {lead ? <div className="mt-3 max-w-[60ch] text-sm text-muted">{lead}</div> : null}
              <PanelContext.Provider value={api}>{children}</PanelContext.Provider>
            </div>
            <div aria-hidden className="room-flat__plinth" />
            <div aria-hidden className="room-flat__floor" />
          </motion.div>
        </div>

        {/* Узел для слоя поверх листа: вне листа, но внутри диалога — фокус-
            ловушка его видит, `transform` камеры на него не действует */}
        <div ref={setHost} className="contents" />
      </motion.div>
    </div>,
    document.body,
  );
}

/**
 * Второй модальный слой внутри панели: «как сделано», крупный скриншот.
 * Монтируется открытым; `onClose` получают Escape и клик мимо.
 */
export function PanelOverlay({
  onClose,
  labelledBy,
  label,
  className = "",
  children,
  ...rest
}: {
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const api = useContext(PanelContext);
  const setOverlay = api?.setOverlay;

  useEffect(() => {
    setOverlay?.(onClose);
    return () => setOverlay?.(null);
  }, [onClose, setOverlay]);

  if (!api?.host) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className={`pointer-events-auto fixed inset-0 z-20 ${className}`}
      {...rest}
    >
      {/* Клик мимо содержимого слоя закрывает слой, а не дом */}
      <div aria-hidden className="absolute inset-0" onClick={onClose} />
      {children}
    </div>,
    api.host,
  );
}
