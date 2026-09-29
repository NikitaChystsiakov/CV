"use client";

import { type MotionValue, frameData, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, type RefObject } from "react";

import walkManifest from "@/lib/walk-manifest.json";
import { TOWN_HALF_WIDTH, roadHeight, roadVertices, townSize } from "@/lib/town";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Персонаж на дороге (этап Э4, шаг 3).
 *
 * Ходит по роликам владельца: `assets-src/videos/walks-*.mp4` режутся
 * `npm run walk` в полосы кадров одного полного шага (`public/scene/walk-*.webp`,
 * фон вырезан хромакеем). Роликов четыре: лицом к зрителю и три четверти
 * вправо-вниз — когда он идёт по маршруту вперёд (скролл вниз), спиной и
 * спиной три четверти вправо-вверх — когда назад (скролл вверх): он
 * разворачивается и уходит, а не пятится. Влево обе диагонали зеркалит код.
 *
 * Направление — по знаку изменения пройденного пути, с гистерезисом: чтобы
 * развернуться, надо пройти против прежнего хода `TURN_AFTER` базовых пикселей.
 * Иначе хвост пружины и дрожь тачпада вертели бы его на месте.
 *
 * Кадр выбирается по ПУТИ, а не по времени: фаза шага накапливается от
 * пройденного вдоль ленты расстояния, поэтому ноги не скользят по дороге. Но
 * только до `MAX_STEPS_PER_SECOND` циклов в секунду: на быстрой прокрутке ноги
 * мелькали бы так, что шаг перестаёт читаться. Выше потолка фаза растёт не
 * быстрее него (скорость меряется по времени кадра), ноги чуть скользят, зато
 * видно, что он идёт. Остановился — через `IDLE_AFTER` мс встаёт в позу стойки
 * (последний кадр полосы).
 *
 * У каждой позы в манифесте есть точка ног стойки (`footX`, `footY`): кадр
 * ставится на дорогу ею, а не низом картинки, поэтому на стыке прямой и
 * диагонали или лица и спины ноги остаются на месте. Рост у всех поз один —
 * конвейер приводит к нему каждый ролик отдельно.
 *
 * Кадр показывается сдвигом полосы (`transform`) внутри окна с `overflow:
 * hidden`. Никакого `background-position` и переключения `src`: только то, что
 * не пересчитывает раскладку.
 *
 * Где он стоит: на дороге, на высоте `FOCUS` экрана. Лента монотонна по
 * высоте, поэтому место на ней находится по `y` — без поиска по длине пути.
 * Вершины ленты — те же, из которых рисуется полотно (`roadVertices`), в тех
 * же единицах: смена масштаба городка не разводит персонажа с дорогой.
 *
 * Шаг отстаёт от скролла пружиной (раздел 5 концепта). Позиция на каждый кадр
 * пишется прямо в DOM через ref — правило проекта, как у процента в панели.
 * При reduced-motion пружины нет и он не ходит: встаёт на место сразу и стоит.
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
/**
 * Рост стоящего персонажа в базовых пикселях городка. 120 — крупнее прежних 92:
 * на быстрой прокрутке мелкий шаг не читался. Двери домов на карте (замер по
 * ассетам при ширине дома 460) — от ~102 базовых px у «о себе» и опыта до
 * ~128–140 у технологий, навыков и кейсов: он в середине этого ряда. У самой
 * двери он не стоит — идёт по дороге, поэтому разница не режет глаз.
 */
const HEIGHT = 120;

type Pose = "down" | "diag" | "up" | "updiag";
const POSES: Pose[] = ["down", "diag", "up", "updiag"];
/** Позы по диагонали: у них есть зеркало для хода влево. */
const DIAGONAL: Record<Pose, boolean> = { down: false, diag: true, up: false, updiag: true };

const WALK = walkManifest;
/** Базовых пикселей городка в одном пикселе полосы кадров: рост стойки у всех поз один. */
const K = HEIGHT / WALK.down.standHeight;

/**
 * Длина одного полного шага (две ноги) на экране, в пикселях полосы. Меряется
 * по ролику: скорость, с какой опорная стопа уезжает назад на «беговой
 * дорожке», умноженная на число кадров цикла (вниз ~7 px/кадр × 27, по
 * диагонали ~6,5 × 38, в пикселях исходника), и переводится масштабом ролика
 * к полосе. Спинные ролики сняты с той же камеры в обратную сторону: шаг у
 * них тот же, что у фронтальных. Мало — ноги «бегут» по дороге, много — скользят.
 */
const STRIDE: Record<Pose, number> = { down: 68, diag: 94, up: 68, updiag: 94 };

/**
 * Потолок частоты шага, циклов в секунду. Два полных шага в секунду — быстрая
 * ходьба; дальше ноги мелькают, и глаз видит не шаг, а дрожь.
 */
const MAX_STEPS_PER_SECOND = 2;
/** Сколько базовых пикселей надо пройти против хода, чтобы развернуться. */
const TURN_AFTER = 10;
/** Длиннее этого промежутка между кадрами время не считаем: вкладка спала или был долгий кадр. */
const MAX_FRAME_GAP = 100;

/** Столько миллисекунд без движения — и он встаёт в позу стойки. */
const IDLE_AFTER = 140;
/** Меньше этого сдвига за кадр (px экрана) считается покоем: хвост пружины не должен дёргать ноги. */
const MOVE_EPSILON = 0.35;

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
  const flipRefs = useRef<Record<Pose, HTMLDivElement | null>>({ down: null, diag: null, up: null, updiag: null });
  const poseRefs = useRef<Record<Pose, HTMLDivElement | null>>({ down: null, diag: null, up: null, updiag: null });
  const stripRefs = useRef<Record<Pose, HTMLImageElement | null>>({ down: null, diag: null, up: null, updiag: null });
  const geometry = useRef<{
    points: { x: number; y: number }[];
    /** Длина ленты от начала до каждой вершины, px — для пройденной доли */
    lengths: number[];
    /** Экранных пикселей в одном базовом пикселе городка */
    unit: number;
    top: number;
    height: number;
  } | null>(null);
  const shown = useRef<Pose>("down");
  const mirrored = useRef(false);
  /** Куда он идёт по маршруту: +1 — вперёд (скролл вниз), −1 — назад */
  const heading = useRef<1 | -1>(1);
  /** Сколько экранных px пройдено против нынешнего хода — для разворота */
  const against = useRef(0);
  /** Фаза шага, доли цикла; растёт с пройденным путём в любую сторону */
  const phase = useRef(0);
  const lastDistance = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { scrollY } = useScroll();
  const smooth = useSpring(scrollY, { stiffness: 140, damping: 26, mass: 0.5 });

  /** Показать кадр `frame` полосы позы `pose` (N — стойка). */
  const showFrame = (pose: Pose, frame: number) => {
    const strip = stripRefs.current[pose];
    if (strip) strip.style.transform = `translate3d(${(-frame * 100) / (WALK[pose].frames + 1)}%, 0, 0)`;
  };

  const showPose = (pose: Pose) => {
    if (shown.current === pose) return;
    shown.current = pose;
    for (const name of POSES) {
      const el = poseRefs.current[name];
      if (el) el.style.visibility = name === pose ? "visible" : "hidden";
    }
  };

  const mirror = (flip: boolean) => {
    if (mirrored.current === flip) return;
    mirrored.current = flip;
    for (const name of POSES) {
      const el = flipRefs.current[name];
      if (el) el.style.transform = flip && DIAGONAL[name] ? "scaleX(-1)" : "";
    }
  };

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

    body.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const distance = geo.lengths[i - 1] + Math.hypot(x - a.x, y - a.y);
    const total = geo.lengths[geo.lengths.length - 1];
    if (total > 0) walked.set(distance / total);

    const step = lastDistance.current === null ? 0 : distance - lastDistance.current;
    lastDistance.current = distance;
    const now = frameData.timestamp || performance.now();
    const elapsed = lastTime.current === null ? 0 : Math.min(now - lastTime.current, MAX_FRAME_GAP);
    lastTime.current = now;

    // Разворот с гистерезисом: против хода надо пройти TURN_AFTER, иначе
    // хвост пружины и дрожь тачпада вертели бы его на месте
    const moving = Math.abs(step) > MOVE_EPSILON;
    if (moving && Math.sign(step) !== heading.current) {
      against.current += Math.abs(step);
      if (against.current > TURN_AFTER * geo.unit) {
        heading.current = step > 0 ? 1 : -1;
        against.current = 0;
      }
    } else if (moving) {
      against.current = 0;
    }

    // Диагональ и прямой участок — разные ролики, вперёд и назад — тоже.
    // Диагональные ролики идут вправо, влево их зеркалит код. Назад по
    // диагонали он идёт в обратную сторону от хода ленты
    const diagonal = Math.abs(b.x - a.x) > 1;
    const forward = heading.current === 1;
    const rightward = forward ? b.x > a.x : b.x < a.x;
    const pose: Pose = forward ? (diagonal ? "diag" : "down") : diagonal ? "updiag" : "up";
    mirror(diagonal && !rightward);

    if (reduced) {
      showPose(pose);
      showFrame(pose, WALK[pose].frames);
      return;
    }

    if (moving) {
      const stride = STRIDE[pose] * K * geo.unit;
      // Фаза идёт по пути, но не быстрее потолка частоты шага
      const byPath = Math.abs(step) / stride;
      const ceiling = (MAX_STEPS_PER_SECOND * elapsed) / 1000;
      phase.current += elapsed > 0 ? Math.min(byPath, ceiling) : byPath;
      const cycle = WALK[pose].frames;
      const frame = Math.floor((phase.current - Math.floor(phase.current)) * cycle);
      showPose(pose);
      showFrame(pose, Math.min(frame, cycle - 1));

      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        showFrame(shown.current, WALK[shown.current].frames);
      }, IDLE_AFTER);
    } else if (shown.current !== pose) {
      // Стоит, но участок сменился: другая полоса, та же стойка
      showPose(pose);
      showFrame(pose, WALK[pose].frames);
    }
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
      geometry.current = { points, lengths, unit, top: track.getBoundingClientRect().top + window.scrollY, height };
      lastDistance.current = null;
      lastTime.current = null;
      place(reduced ? scrollY.get() : smooth.get());
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      observer.disconnect();
      clearTimeout(idleTimer.current);
    };
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
      {/* Тело — точка на дороге, где стоят ноги; всё остальное отсчитывается от неё */}
      <div ref={bodyRef} data-walker className="absolute left-0 top-0 will-change-transform">
        <div
          className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: townSize(72),
            height: townSize(12),
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 45%, transparent), transparent)",
          }}
        />
        {POSES.map((pose) => {
          const art = WALK[pose];
          return (
            <div
              key={pose}
              ref={(node) => {
                poseRefs.current[pose] = node;
              }}
              data-walker-frame={pose}
              // Кадр стоит на дороге точкой ног стойки, а не низом картинки
              className="absolute"
              style={{
                left: townSize(-art.footX * K),
                top: townSize(-art.footY * K),
                width: townSize(art.frameWidth * K),
                height: townSize(art.frameHeight * K),
                visibility: pose === "down" ? "visible" : "hidden",
              }}
            >
              {/* Зеркало держит точку ног на месте: разворот вокруг неё */}
              <div
                ref={(node) => {
                  flipRefs.current[pose] = node;
                }}
                className="size-full"
                style={{ transformOrigin: `${(art.footX / art.frameWidth) * 100}% 100%` }}
              >
                <div className="relative size-full overflow-hidden">
                  {/* Полоса кадров: окно показывает один, остальные сдвинуты за край */}
                  <Image
                    ref={(node) => {
                      stripRefs.current[pose] = node;
                    }}
                    src={art.src}
                    alt=""
                    width={art.frameWidth * (art.frames + 1)}
                    height={art.frameHeight}
                    unoptimized
                    className="scene-art absolute left-0 top-0 h-full max-w-none select-none will-change-transform"
                    style={{
                      width: `${(art.frames + 1) * 100}%`,
                      transform: `translate3d(${(-art.frames * 100) / (art.frames + 1)}%, 0, 0)`,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
