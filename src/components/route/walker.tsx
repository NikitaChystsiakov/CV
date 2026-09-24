"use client";

import { type MotionValue, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, type RefObject } from "react";

import manifest from "@/lib/scene-manifest.json";
import { TOWN_HALF_WIDTH, roadHeight, roadVertices, townSize } from "@/lib/town";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Персонаж на дороге — пока предпросмотр (этап Э4, шаг 3).
 *
 * Ассет один — поза «стоит» (`assets-src/character.png`, фон вырезан
 * хромакеем в `prepare-assets.mjs`). Ходьбы нет: циклы придут роликами
 * (docs/сгенерировать.md, пункт 1), а до тех пор персонаж скользит по ленте.
 * Цель предпросмотра — увидеть масштаб, силуэт и посадку на дорогу.
 *
 * Где он стоит: на дороге, на высоте `FOCUS` экрана. Лента монотонна по
 * высоте, поэтому место на ней находится по `y` — без поиска по длине пути.
 * Вершины ленты — те же, из которых рисуется полотно (`roadVertices`), в тех
 * же единицах: смена масштаба городка не разводит персонажа с дорогой.
 *
 * Шаг отстаёт от скролла пружиной (раздел 5 концепта). Позиция на каждый кадр
 * пишется прямо в DOM через ref — правило проекта, как у процента в панели.
 * При reduced-motion пружины нет: персонаж встаёт на место сразу.
 *
 * Пройденную часть дороги считает тоже он: `walked` — доля длины ленты от
 * начала до его ног. Иначе бирюзовая линия, считавшаяся от прокрутки страницы,
 * обрывалась на экран выше персонажа.
 *
 * Ниже 768px не рисуется: там дорога прямая по кромке, и место персонажа на
 * узком экране — отдельное решение (концепт, раздел 5).
 */

/** На какой доле высоты экрана персонаж стоит на дороге. */
const FOCUS = 0.62;
/** Рост персонажа в базовых пикселях городка — от роста двери домов. */
const HEIGHT = 92;

const ART = manifest.character;
const WIDTH = (HEIGHT * ART.width) / ART.height;

export function Walker({
  trackRef,
  walked,
}: {
  trackRef: RefObject<HTMLDivElement | null>;
  /** Сюда пишется доля пройденного пути — её рисует полотно дороги */
  walked: MotionValue<number>;
}) {
  const reduced = usePrefersReducedMotion();
  const bodyRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const geometry = useRef<{
    points: { x: number; y: number }[];
    /** Длина ленты от начала до каждой вершины, px — для пройденной доли */
    lengths: number[];
    top: number;
    height: number;
  } | null>(null);
  const facing = useRef(1);

  const { scrollY } = useScroll();
  const smooth = useSpring(scrollY, { stiffness: 140, damping: 26, mass: 0.5 });

  const place = (scroll: number) => {
    const geo = geometry.current;
    const body = bodyRef.current;
    if (!geo || !body || geo.points.length < 2) return;

    const y = Math.min(Math.max(scroll + window.innerHeight * FOCUS - geo.top, 0), geo.height);
    const points = geo.points;
    let i = 1;
    while (i < points.length - 1 && points[i].y < y) i += 1;
    const a = points[i - 1];
    const b = points[i];
    const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
    const x = a.x + (b.x - a.x) * t;

    // Лицом по ходу: на диагонали разворачивается, на прямом участке к
    // зрителю держит прежнее направление
    if (Math.abs(b.x - a.x) > 1) facing.current = b.x > a.x ? 1 : -1;

    body.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const total = geo.lengths[geo.lengths.length - 1];
    if (total > 0) walked.set((geo.lengths[i - 1] + Math.hypot(x - a.x, y - a.y)) / total);
    if (flipRef.current) flipRef.current.style.transform = facing.current === 1 ? "" : "scaleX(-1)";
  };

  // Геометрия ленты в пикселях маршрута: разово и на изменение размеров, не на кадр
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const road = track.querySelector<SVGSVGElement>("[data-road]");
      if (!road) return;
      const unit = road.getBoundingClientRect().width / (TOWN_HALF_WIDTH * 2);
      const height = track.offsetHeight;
      const center = track.offsetWidth / 2;
      const scaleY = height / roadHeight();
      const points = roadVertices().map((v) => ({ x: center + v.x * unit, y: v.y * scaleY }));
      const lengths = points.map(() => 0);
      for (let k = 1; k < points.length; k += 1) {
        lengths[k] = lengths[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
      }
      geometry.current = { points, lengths, top: track.getBoundingClientRect().top + window.scrollY, height };
      place(reduced ? scrollY.get() : smooth.get());
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
    // place читает только ref-ы, пересоздавать эффект на каждый рендер незачем
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackRef, reduced]);

  useMotionValueEvent(smooth, "change", (value) => {
    if (!reduced) place(value);
  });
  useMotionValueEvent(scrollY, "change", (value) => {
    if (reduced) place(value);
  });

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 hidden md:block">
      <div ref={bodyRef} data-walker className="absolute left-0 top-0 will-change-transform">
        {/* Ноги стоят на точке дороги: якорь — низ по центру */}
        <div className="absolute -translate-x-1/2 -translate-y-full" style={{ width: townSize(WIDTH) }}>
          <div
            className="absolute -bottom-[3%] left-1/2 -z-10 h-[7%] w-[260%] -translate-x-1/2"
            style={{
              background:
                "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 45%, transparent), transparent)",
            }}
          />
          <div ref={flipRef}>
            <Image
              src={ART.src}
              alt=""
              width={ART.width}
              height={ART.height}
              unoptimized
              priority
              className="scene-art h-auto w-full select-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
