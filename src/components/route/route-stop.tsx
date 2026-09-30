"use client";

import { motion } from "framer-motion";
import { useMemo, type Ref } from "react";
import { createPortal } from "react-dom";

import { useLang } from "@/lib/use-lang";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

import { Minigame } from "@/components/minigame/minigame";
import { HouseRoom } from "@/components/room/house-room";
import { useHouseEntry, type HouseEntry } from "@/components/room/use-house-entry";
import { IsoPlaceholder } from "@/components/route/iso-placeholder";
import {
  HouseEntryGlow,
  SceneObject,
  type HouseEntryTrigger,
} from "@/components/route/scene-object";
import { StopTown } from "@/components/route/scenery";
import { UI } from "@/lib/content";
import { ROOM_STOP_IDS, roomFor } from "@/lib/rooms";
import { HOUSE_DOORS, STOP_ASSETS, type SceneAsset } from "@/lib/scene-assets";
import { stopMarkLeft, townNodes, townSize } from "@/lib/town";
import type { RouteStopConfig } from "@/lib/route";

export function RouteStop({ stop, index }: { stop: RouteStopConfig; index: number }) {
  const { lang } = useLang();
  // Статичный режим — страница, которую читают сразу: без `initial` motion не
  // прячет остановку до появления в кадре. MotionConfig в layout гасит только
  // движение, fade по opacity он оставил бы
  const reducedMotion = usePrefersReducedMotion();
  const isHero = stop.kind === "hero";
  const isFork = stop.kind === "fork";
  // Справа от дорожки стоит либо дом, либо текст — и то, что стоит там,
  // объезжает закреплённый рельс карты маршрута
  const textOnRight = stop.side === "left";
  // Ассета может не быть: остановка тогда остаётся с прежним плейсхолдером
  const asset = STOP_ASSETS[stop.id];

  // Дом открывается, только если у него есть комната. Список берётся из
  // `rooms.tsx`, а не собирается здесь: дом без контента не должен ни обещать
  // клик, ни показывать курсор-руку — это инвариант «ничего недоделанного на
  // виду», а не мелочь оформления
  const hasRoom = ROOM_STOP_IDS.includes(stop.id) && Boolean(asset);
  // Камера входит в дверь, а не в середину картинки: точка двери у каждого
  // дома своя и снята с ассета (`HOUSE_DOORS`)
  const entry = useHouseEntry(HOUSE_DOORS[stop.id]);
  const trigger = hasRoom
    ? {
        stopId: stop.id,
        // Видимого текста у кнопки нет — дом и есть кнопка, поэтому подпись
        // собирается из названия остановки и глагола: «Дом опыта: зайти внутрь»
        label: `${stop.title[lang]}: ${UI.enterHouse[lang]}`,
        onEnter: entry.enter,
      }
    : undefined;

  return (
    <li
      id={stop.id}
      data-stop={stop.id}
      // Пока камера входит в дом, его место на маршруте занимает летящая
      // копия, а сам дом прячется (globals.css): иначе под копией оставался бы
      // его тусклый двойник
      data-house-away={entry.copy ? "" : undefined}
      className="relative flex min-h-[82svh] items-center py-16"
    >
      {/* Городок по карте: дом и декор на клетках изосетки. От 768px — вместо
          дома в колонке, поэтому ниже рисуется свой, обычным потоком */}
      <StopTown index={index} stop={stop} />

      {/* Дом в городке нарисован внутри декоративного слоя, поэтому кнопкой
          становится не он сам, а накладка ровно по его клетке (см. HouseDoor) */}
      {trigger && asset ? (
        <HouseDoor
          index={index}
          asset={asset}
          trigger={trigger}
          triggerRef={entry.triggerRef}
        />
      ) : null}

      {/* Зарубка остановки на дорожке: сидит на полотне дороги там, где оно
          проходит мимо дома. Без номера — нумерация живёт только в списке
          остановок на узких экранах, а здесь в Э4 зарубку сменит персонаж */}
      <span
        aria-hidden
        className="stop-mark absolute left-6 top-1/2 md:left-[calc(50%+var(--stop-mark-x,0px))] z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-line bg-surface"
        style={
          {
            "--stop-mark-x": townSize(stopMarkLeft(index)),
            ...(isFork
              ? {
                  borderColor:
                    "color-mix(in oklab, var(--color-neon-1) 70%, transparent)",
                }
              : null),
          } as React.CSSProperties
        }
      />

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15% 0px -15% 0px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        // z-20: выше закреплённого светила (z-10), но ниже кликабельных
        // площадок и созвездий (z-30)
        className="relative z-20 mx-auto grid w-full max-w-7xl items-center gap-6 pl-14 pr-6 md:grid-cols-2 md:gap-12 md:px-10"
      >
        {/* Узкий экран: дом сверху, текст под ним. От md дом уезжает в городок */}
        <div className="md:hidden">
          {asset ? (
            <SceneObject
              asset={asset}
              alt={stop.title[lang]}
              entry={trigger}
              entryRef={entry.triggerRef}
            />
          ) : (
            <IsoPlaceholder
              kind={stop.kind}
              hue={stop.hue}
              label={`${UI.placeholder[lang]} ${stop.iteration}`}
            />
          )}
        </div>

        <div
          // Отступ у дорожки, чтобы текст не заезжал под зарубку остановки.
          // Колонка выбирается явно: вторая половина сетки отдана городку
          // `stop-copy` — мягкая подложка цвета фона под текстом (globals.css):
          // декор и задник городка идут фоном, заголовок и абзац не теряются
          className={
            textOnRight
              ? "stop-copy relative md:col-start-2 md:pl-8 md:text-left rail-safe"
              : "stop-copy relative md:col-start-1 md:row-start-1 md:pr-8 md:text-right"
          }
        >
          {isHero ? (
            <>
              {/* Hero — это имя: единственный h1 на странице и самый крупный
                  текст маршрута. Unbounded широкий, колонка — половина экрана,
                  поэтому кегль подобран замером: имя из двух слов помещается
                  в две строки на всех ширинах от 390 до 1440 */}
              <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">
                {UI.name[lang]}
              </h1>
              <p className="mt-3 text-lg text-muted">{UI.role[lang]}</p>
              <p className="mt-8 text-balance font-display text-2xl font-bold leading-[1.15] tracking-tight lg:text-3xl xl:text-4xl">
                {UI.heroTitle[lang]}{" "}
                <span className="text-accent">{UI.heroAccent[lang]}</span>
              </p>
            </>
          ) : (
            <h2 className="text-balance font-display text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
              {stop.title[lang]}
            </h2>
          )}

          {/* На остановке мини-игры её содержимое — сама игра: служебная
              заметка `summary` описывала будущую игру (с реакцией персонажа,
              которого ещё нет) и съедала высоту, в которую игра обязана
              уложиться — маршрут считает остановки равными по высоте */}
          {stop.id === "minigame" ? (
            <Minigame />
          ) : (
            <p className="mt-4 max-w-prose text-pretty text-muted md:inline-block">
              {stop.summary[lang]}
            </p>
          )}
        </div>
      </motion.div>

      {hasRoom ? <HouseEntryScene stop={stop} entry={entry} /> : null}
    </li>
  );
}

/**
 * Дверь дома в городке.
 *
 * Сам дом рисует слой окружения (`scenery.tsx`), а он декоративный: у него
 * `aria-hidden`, и кнопка внутри такого слоя была бы недоступна с клавиатуры.
 * Поэтому кнопка — отдельная накладка, посаженная на ту же клетку карты и в тот
 * же масштаб: `townNodes` для положения, размеры ассета для габаритов. Числа не
 * дублируются руками ни в одном месте, поэтому накладка не может разъехаться с
 * домом при смене карты.
 */
function HouseDoor({
  index,
  asset,
  trigger,
  triggerRef,
}: {
  index: number;
  asset: SceneAsset;
  trigger: HouseEntryTrigger;
  triggerRef: Ref<HTMLButtonElement>;
}) {
  const house = useMemo(
    () => townNodes(index).find((node) => node.kind === "house"),
    [index],
  );
  if (!house) return null;

  return (
    // z-30: блок с текстом остановки растянут на всю ширину и без этого
    // перехватывал бы клик — теми же граблями уже ловились площадки и созвездия
    <button
      ref={triggerRef}
      type="button"
      data-room-trigger={trigger.stopId}
      aria-label={trigger.label}
      onClick={trigger.onEnter}
      className="group absolute z-30 hidden cursor-pointer rounded-2xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent md:block"
      style={{
        left: `calc(50% + ${townSize(house.left)})`,
        top: `${house.top}%`,
        width: townSize(asset.display),
        height: townSize((asset.display * asset.height) / asset.width),
        transform: "translate(-50%, -100%)",
      }}
    >
      <HouseEntryGlow />
    </button>
  );
}

/**
 * Вход в дом: завеса, летящая копия дома и сама комната.
 *
 * Всё рисуется порталом на `body`. Слои остановки живут под `contain: layout`,
 * а он делает элемент точкой отсчёта для `position: fixed` внутри себя — слой
 * входа тогда сидел бы в границах остановки, а не во весь экран.
 *
 * Порядок по глубине: завеса (z-54) → копия дома (z-56) → комната (z-60, её
 * рисует `house-room.tsx`). Верхняя панель сайта остаётся на z-50, то есть под
 * завесой: во время входа город уходит целиком.
 *
 * Завеса живёт здесь, а не в комнате, и держится всё время, пока комната
 * смонтирована: копия дома летит МЕЖДУ завесой и комнатой, и если бы завеса
 * была подложкой комнаты, копия в момент смены вдруг темнела бы под ней.
 */
function HouseEntryScene({
  stop,
  entry,
}: {
  stop: RouteStopConfig;
  entry: HouseEntry;
}) {
  const { lang } = useLang();
  const room = entry.mounted ? roomFor(stop.id, lang) : null;
  const copy = entry.copy;

  if (!entry.mounted) return null;

  return createPortal(
    <div data-room-entry={entry.phase}>
      <motion.div
        aria-hidden
        data-room-entry-veil
        className="pointer-events-none fixed inset-0 z-[54] bg-room-veil"
        style={{ opacity: entry.veil.opacity }}
      />

      {/* Копия дома. Нарисована в конечном размере и ужата до настоящего
          дома: так растр в упор остаётся чётким. Обёртка нулевого размера
          стоит точкой двери в начале координат — поэтому масштаб идёт вокруг
          двери, а сдвиг обёртки и есть путь двери по экрану */}
      {copy ? (
        <motion.div
          aria-hidden
          data-room-entry-house
          className="pointer-events-none fixed left-0 top-0 z-[56] size-0"
          style={{
            x: entry.house.x,
            y: entry.house.y,
            scale: entry.house.scale,
            opacity: entry.house.opacity,
            originX: 0,
            originY: 0,
          }}
        >
          {/* Обычный <img>, а не next/image: адрес — уже показанный вариант
              дома (`currentSrc`), оптимизатору здесь выбирать нечего.
              `.scene-art` — тот же ночной фильтр, что у дома на маршруте:
              статичный, от кадра не зависит */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={copy.src}
            alt=""
            width={copy.width}
            height={copy.height}
            decoding="sync"
            className="scene-art absolute max-w-none select-none"
            style={{
              left: -copy.width * copy.doorX,
              top: -copy.height * copy.doorY,
              width: copy.width,
              height: copy.height,
            }}
          />
        </motion.div>
      ) : null}

      {room ? (
        <HouseRoom
          title={stop.title[lang]}
          slots={room}
          onClose={entry.leave}
          camera={entry.room}
        />
      ) : null}
    </div>,
    document.body,
  );
}
