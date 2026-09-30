"use client";

import { AnimatePresence, motion } from "framer-motion";
import { type ComponentType, useEffect, useRef, useState } from "react";

import { ChessScene } from "@/components/route/chess-scene";
import { SceneObject } from "@/components/route/scene-object";
import { SceneProp } from "@/components/route/scene-prop";
import { UI } from "@/lib/content";
import { dashes } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";
import { LANDMARKS, stopTop, type LandmarkKind } from "@/lib/landmark-spots";
import type { RouteStopConfig } from "@/lib/route";
import { STOP_ASSETS } from "@/lib/scene-assets";
import { townNodes, townSize, type TownNode } from "@/lib/town";
import { trophyByLandmark } from "@/lib/trophies";
import { VolleyballLandmark } from "@/components/volleyball";

/**
 * Городок вокруг одной остановки.
 *
 * Раскладки «на глаз» больше нет: дом и декор стоят на клетках карты
 * (`src/lib/town.ts`), а порядок отрисовки задаёт одна сортировка по глубине —
 * дальние объекты раньше, ближние поверх. Поэтому фонарь перед домом
 * перекрывает дом правильно, а не случайно.
 *
 * Слой включается с 768px. Ниже этой ширины городок не рисуется совсем
 * (docs/город.md, раздел 4): колонка текста идёт во всю ширину экрана, и любой
 * объект рядом с ней садится на текст. Там остаются прямая дорога по кромке,
 * дом сверху и текст под ним.
 */
export function StopTown({ index, stop }: { index: number; stop: RouteStopConfig }) {
  const { lang } = useLang();
  const nodes = townNodes(index);
  if (nodes.length === 0) return null;

  return (
    <div
      aria-hidden
      className="town-layer pointer-events-none absolute inset-0 hidden md:block"
    >
      {nodes.map((node) =>
        node.kind === "house" ? (
          <TownHouse key={node.key} node={node} stop={stop} alt={stop.title[lang]} />
        ) : (
          <TownItem key={node.key} node={node} />
        ),
      )}
    </div>
  );
}

/** Дом остановки на своей клетке. */
function TownHouse({
  node,
  stop,
  alt,
}: {
  node: TownNode;
  stop: RouteStopConfig;
  alt: string;
}) {
  const asset = STOP_ASSETS[stop.id];
  if (!asset) return null;

  return (
    <div className="absolute" style={anchor(node)}>
      <SceneObject asset={asset} alt={alt} />
    </div>
  );
}

/** Объект окружения на своей клетке. */
function TownItem({ node }: { node: TownNode }) {
  return (
    // Якорь — низ объекта: так дальние и ближние предметы стоят на одной земле,
    // а не висят центром на одной высоте
    <div
      data-scenery
      // Второй план рисуется на всех ширинах, где виден городок. В городе.md
      // он снимался ниже 1280, потому что декор раскидывался процедурно и
      // налезал на дома; по карте объекты стоят на своих клетках, пересечений
      // нет ни на одной ширине (замерено), а без деревьев за домами улица на
      // планшете становится пустым полем
      className={node.wide ? "absolute hidden xl:block" : "absolute"}
      style={{
        ...anchor(node),
        opacity: node.opacity,
      }}
    >
      <div style={node.flip ? { transform: "scaleX(-1)" } : undefined}>
        <SceneProp name={node.name!} scale={node.scale} />
      </div>
    </div>
  );
}

/**
 * Посадка объекта на клетку: поперёк — базовые пиксели от осевой линии через
 * общий множитель городка, вдоль — доля высоты остановки. Смещение на
 * −50%/−100% ставит объект основанием на точку клетки.
 */
function anchor(node: TownNode) {
  return {
    left: `calc(50% + ${townSize(node.left)})`,
    top: `${node.top}%`,
    transform: "translate(-50%, -100%)",
  } as const;
}

/** Все детали-площадки маршрута из одного описания. */
export function SceneryLandmarks() {
  return (
    <>
      {LANDMARKS.map((landmark) => {
        const top = stopTop(landmark.stopId, landmark.offset);
        // Волейбол — не подпись по клику, а мини-игра: компонент сам несёт
        // кнопку, счёт и всплывашку трофея (components/volleyball). Здесь —
        // только место на маршруте, слой z-30 и ширина от 1280, как у всех площадок
        if (landmark.kind === "volleyball") {
          return (
            <div
              key={landmark.kind}
              className="absolute z-30 hidden xl:block"
              style={{
                top: `${top}%`,
                left: `calc(50% + ${townSize(landmark.left)})`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <VolleyballLandmark />
            </div>
          );
        }
        return <SceneryStory key={landmark.kind} kind={landmark.kind} top={top} left={landmark.left} />;
      })}
    </>
  );
}

/** Какой компонент рисует площадку-подпись. Волейбол живёт отдельно — см. выше. */
const LANDMARK_SCENES: Record<Exclude<LandmarkKind, "volleyball">, ComponentType> = {
  chess: ChessScene,
};

/**
 * Кликабельные детали про владельца сайта: площадка стоит у дороги как декор,
 * но по клику показывает тот же текст, что и полка в доме опыта.
 */
function SceneryStory({
  kind,
  top,
  left,
}: {
  kind: Exclude<LandmarkKind, "volleyball">;
  top: number;
  left: number;
}) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // Всплывашка закрывается по Escape (фокус возвращается на кнопку) и по клику
  // мимо неё. Слушатели живут только пока она открыта
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
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

  // Текст берётся из общего файла трофеев: деталь на фоне и полка в доме опыта
  // должны показывать одно и то же
  const trophy = trophyByLandmark(kind);
  const title = trophy.title[lang];
  const summary = dashes(trophy.summary[lang], lang);
  const Landmark = LANDMARK_SCENES[kind];

  return (
    // z-30: деталь стоит в поле у дороги, но блок с текстом остановки растянут на
    // всю ширину и без этого перехватывал бы клик
    <div
      ref={holder}
      data-landmark={kind}
      className="absolute z-30 hidden xl:block"
      style={{
        top: `${top}%`,
        left: `calc(50% + ${townSize(left)})`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={`${title}: ${UI.more[lang]}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative block cursor-pointer rounded-xl outline-offset-4 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-accent"
      >
        {/* Площадка живёт в том же масштабе, что дома и декор: множитель
            городка как число (--town-k), потому что внутри сцены всё в
            пикселях от ширины стола */}
        <div className="town-scale">
          <Landmark />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-full z-20 w-56 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-lg shadow-ink/5"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{title}</p>
            <p className="mt-1 text-sm text-pretty">{summary}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
