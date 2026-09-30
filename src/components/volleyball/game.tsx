"use client";

import { type RefObject, useEffect, useRef } from "react";

import { townSize } from "@/lib/town";

import { BALL_BOX, BallArt, SHADOW_BOX } from "./ball";
import { ballCenter, behindNet, type CourtPoint, ground, IMG_W, NET_U, REST } from "./court";

/**
 * Игра «Держи мяч»: код, который грузится только когда площадка подъехала.
 *
 * Соперник подаёт через сетку, у места приземления на нашей половине лежит
 * кольцо-цель, к нему сжимается второе кольцо акцентом. Клик по площадке, тап
 * или пробел отбивают мяч:
 *   - рано (кольцо ещё не зажглось) — промах, мяч падает;
 *   - в окне — приём, мяч уходит сопернику, и тот обычно отвечает быстрее;
 *   - у самой земли (кольца сошлись) — атака, соперник не достаёт, очко наше.
 * Соперник ошибается и сам — иногда отправляет мяч в сетку. Три выигранных
 * розыгрыша подряд — победа. Одна партия занимает 20–40 секунд.
 *
 * Людей нет (правило «арт кодом не рисуем»): удар читается по развороту мяча
 * и вспышке-кольцу в точке удара — наш удар акцентом, удар соперника
 * приглушённым тоном.
 *
 * Производительность: всё состояние игры — в замыкании эффекта, а не в React.
 * Кадр пишет в DOM только `transform` и `opacity` через ref, React
 * перерисовывается лишь на смене счёта. Цикл requestAnimationFrame крутится,
 * только пока идёт игра и площадка в кадре: уехала — цикл стоит, время игры
 * замирает и продолжается с того же места.
 */

export type VolleyControls = {
  start: () => void;
  hit: () => void;
  stop: () => void;
};

export type VolleyEvents = {
  onReady: () => void;
  /** Розыгрыш закончился: наш ли он и какая теперь серия */
  onPoint: (won: boolean, streak: number) => void;
  onWin: () => void;
};

type Props = VolleyEvents & {
  /** Упрощённый соперник для проверок: любой удар по летящему к нам мячу — атака */
  assist: boolean;
  controlsRef: RefObject<VolleyControls | null>;
};

/** Сколько розыгрышей подряд нужно выиграть */
export const WIN_STREAK = 3;

/** Окно удара и «сладкая» его часть — сколько миллисекунд до касания земли */
const WINDOW_MS = 540;
const SWEET_MS = 210;
/** Полёт подачи и ответов соперника: каждый ответ быстрее, но не быстрее MIN */
const IN_MS = 1450;
const IN_MIN_MS = 1000;
const IN_SPEEDUP = 0.9;
/** Вероятность, что соперник ответит на наш приём, а не ошибётся */
const OPPONENT_RETURNS = 0.7;
/** В режиме проверки полёт к нам длиннее, и попасть в него легко */
const ASSIST_IN_MS = 1800;

type Flight = {
  from: CourtPoint;
  to: CourtPoint;
  /** Сколько пикселей картинки добавляет дуга в верхней точке */
  arc: number;
  duration: number;
  /** Летит ли мяч к нам: только в таком полёте засчитывается удар */
  incoming?: boolean;
};

type Step =
  | { kind: "wait"; left: number; then: () => void }
  | { kind: "fly"; flight: Flight; t: number; then: () => void }
  | { kind: "fade"; t: number; duration: number; from: number; to: number; then: () => void };

type Phase = "idle" | "serve" | "in" | "out" | "point" | "won";

function lerp(a: number, b: number, s: number) {
  return a + (b - a) * s;
}

function along(f: Flight, s: number): CourtPoint {
  return {
    u: lerp(f.from.u, f.to.u, s),
    v: lerp(f.from.v, f.to.v, s),
    h: lerp(f.from.h, f.to.h, s) + f.arc * 4 * s * (1 - s),
  };
}

/** Детерминированный генератор: в режиме проверки партия всегда одна и та же */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function VolleyGame({ assist, controlsRef, onReady, onPoint, onWin }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const approachRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const flashOpponentRef = useRef<HTMLDivElement>(null);

  // Колбэки читаются из ref: движок живёт в одном эффекте и не должен
  // пересоздаваться, когда родитель перерисовался
  const events = useRef<VolleyEvents>({ onReady, onPoint, onWin });
  useEffect(() => {
    events.current = { onReady, onPoint, onWin };
  });

  useEffect(() => {
    const nodes = [
      layerRef,
      ballRef,
      spinRef,
      shadowRef,
      targetRef,
      approachRef,
      flashRef,
      flashOpponentRef,
    ].map((ref) => ref.current);
    if (nodes.some((node) => !node)) return;
    const [layer, ball, spin, shadow, target, approach, flash, flashOpponent] = nodes as HTMLDivElement[];

    const rand = random(assist ? 7 : Date.now());

    // Пиксель картинки → пиксель экрана. Меряется наблюдателем размера, а не
    // на кадре: чтение раскладки в цикле — это принудительный reflow
    let k = layer.getBoundingClientRect().width / IMG_W;
    const resize = new ResizeObserver(([entry]) => {
      k = entry.contentRect.width / IMG_W;
      draw();
    });
    resize.observe(layer);

    let playing = false;
    let visible = true;
    let raf = 0;
    let last = 0;

    let pos: CourtPoint = { ...REST };
    let opacity = 1;
    let angle = 0;
    let streak = 0;
    let speed = 1;
    let whiffed = false;
    let step: Step | null = null;

    const setPhase = (phase: Phase) => {
      layer.dataset.volleyPhase = phase;
    };

    function draw() {
      const c = ballCenter(pos);
      const hidden = behindNet(pos);
      ball.style.transform = `translate3d(${(c.x * k).toFixed(2)}px, ${(c.y * k).toFixed(2)}px, 0)`;
      ball.style.opacity = String(opacity * (hidden ? 0.45 : 1));
      spin.style.transform = `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`;

      // Тень едет по земле под мячом, мельчает и бледнеет, когда мяч высоко
      const g = ground(pos.u, pos.v);
      const lift = Math.min(pos.h / 260, 1);
      shadow.style.transform = `translate3d(${(g.x * k).toFixed(2)}px, ${(g.y * k).toFixed(2)}px, 0) scale(${(1 - lift * 0.45).toFixed(3)})`;
      shadow.style.opacity = String(opacity * (1 - lift * 0.6) * (pos.u > NET_U && hidden ? 0.5 : 1));

      // Кольца цели: только пока мяч летит к нам
      const flying = step?.kind === "fly" && step.flight.incoming ? step : null;
      if (!flying) {
        target.style.opacity = "0";
        approach.style.opacity = "0";
        return;
      }

      const land = ground(flying.flight.to.u, flying.flight.to.v);
      const at = `translate3d(${(land.x * k).toFixed(2)}px, ${(land.y * k).toFixed(2)}px, 0)`;
      target.style.transform = at;
      target.style.opacity = whiffed ? "0.25" : "0.7";

      const left = flying.flight.duration - flying.t;
      const windowMs = assist ? flying.flight.duration : WINDOW_MS;
      const sweetMs = assist ? flying.flight.duration : SWEET_MS;
      if (whiffed || left > windowMs) {
        approach.style.opacity = "0";
        return;
      }
      const closing = Math.max(left, 0) / windowMs;
      approach.style.transform = `${at} scale(${(1 + closing * 1.6).toFixed(3)})`;
      approach.style.opacity = left <= sweetMs ? "1" : "0.55";
    }

    function burst(el: HTMLElement, at: CourtPoint) {
      const c = ballCenter(at);
      const place = `translate3d(${(c.x * k).toFixed(2)}px, ${(c.y * k).toFixed(2)}px, 0)`;
      el.animate(
        [
          { transform: `${place} scale(0.4)`, opacity: 0.9 },
          { transform: `${place} scale(1.8)`, opacity: 0 },
        ],
        { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }

    const fly = (flight: Flight, then: () => void) => {
      step = { kind: "fly", flight, t: 0, then };
    };
    const wait = (ms: number, then: () => void) => {
      step = { kind: "wait", left: ms, then };
    };
    const fade = (from: number, to: number, duration: number, then: () => void) => {
      step = { kind: "fade", t: 0, duration, from, to, then };
    };

    const spot = (uFrom: number, uTo: number, h: number): CourtPoint => ({
      u: lerp(uFrom, uTo, rand()),
      v: lerp(0.22, 0.78, rand()),
      h,
    });

    // --- Розыгрыш --------------------------------------------------------

    function serve() {
      setPhase("serve");
      speed = 1;
      pos = spot(0.93, 0.97, 70);
      opacity = 0;
      fade(0, 1, 280, () => wait(420, () => incoming(pos)));
    }

    function incoming(from: CourtPoint) {
      setPhase("in");
      whiffed = false;
      const duration = assist ? ASSIST_IN_MS : Math.max(IN_MIN_MS, IN_MS * speed);
      fly({ from, to: spot(0.14, 0.3, 0), arc: 200, duration, incoming: true }, () => bounce(false));
    }

    /** Мяч коснулся земли: короткий отскок, мяч гаснет, очко записано */
    function bounce(ours: boolean) {
      setPhase("point");
      const dir = ours ? 0.05 : -0.05;
      const to = { u: Math.min(Math.max(pos.u + dir, 0.02), 0.98), v: pos.v, h: 0 };
      fly({ from: { ...pos, h: 0 }, to, arc: 20, duration: 320 }, () =>
        fade(1, 0, 240, () => point(ours)),
      );
    }

    function point(won: boolean) {
      streak = won ? streak + 1 : 0;
      events.current.onPoint(won, streak);

      if (streak >= WIN_STREAK) {
        finish();
        return;
      }
      wait(600, serve);
    }

    /** Победа: мяч возвращается на место у задней линии, цикл встаёт */
    function finish() {
      playing = false;
      step = null;
      streak = 0;
      pos = { ...REST };
      opacity = 1;
      angle = 0;
      draw();
      ball.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      setPhase("won");
      sleep();
      events.current.onWin();
    }

    function opponentTouch() {
      burst(flashOpponent, pos);

      // Соперник ошибается: мяч уходит в сетку и падает у неё
      if (!assist && rand() > OPPONENT_RETURNS) {
        const net = { u: NET_U + 0.03, v: lerp(0.3, 0.7, rand()), h: 45 };
        fly({ from: pos, to: net, arc: 55, duration: 520 }, () =>
          fly({ from: pos, to: { ...net, h: 0 }, arc: 0, duration: 300 }, () => bounce(true)),
        );
        return;
      }

      speed *= IN_SPEEDUP;
      incoming(pos);
    }

    /** Удар игрока. Считается только по мячу, который летит к нам */
    function hit() {
      if (!playing || whiffed || step?.kind !== "fly" || !step.flight.incoming) return;

      // Время до земли — с поправкой на то, сколько прошло после кадра
      const extra = Math.min(Math.max(performance.now() - last, 0), 40);
      const left = step.flight.duration - step.t - extra;

      if (!assist && left > WINDOW_MS) {
        whiffed = true;
        draw();
        return;
      }

      burst(flash, pos);
      setPhase("out");
      const from = { ...pos };

      if (assist || left <= SWEET_MS) {
        // Атака: низкая быстрая дуга в дальнюю часть площадки соперника
        fly({ from, to: spot(0.68, 0.9, 0), arc: 150, duration: 620 }, () => bounce(true));
      } else {
        fly({ from, to: spot(0.72, 0.86, 70), arc: 170, duration: 950 }, opponentTouch);
      }
      draw();
    }

    // --- Цикл ------------------------------------------------------------

    function tick(dt: number) {
      if (!step) return;
      const current = step;

      if (current.kind === "wait") {
        current.left -= dt;
        if (current.left <= 0) current.then();
        return;
      }

      if (current.kind === "fade") {
        current.t += dt;
        const s = Math.min(current.t / current.duration, 1);
        opacity = lerp(current.from, current.to, s);
        if (s >= 1) current.then();
        return;
      }

      current.t += dt;
      const s = Math.min(current.t / current.flight.duration, 1);
      pos = along(current.flight, s);
      angle = (angle + dt * 0.42) % 360;
      if (s >= 1) current.then();
    }

    const frame = (now: number) => {
      // Потолок шага: после паузы вкладки мяч не телепортируется
      const dt = Math.min(now - last, 40);
      last = now;
      tick(dt);
      draw();
      raf = playing && visible ? requestAnimationFrame(frame) : 0;
    };

    function wake() {
      if (raf || !playing || !visible) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function sleep() {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    // Площадка ушла из кадра — цикл стоит, игра замирает
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
      else sleep();
    });
    seen.observe(layer);

    controlsRef.current = {
      start() {
        if (playing) return;
        playing = true;
        streak = 0;
        angle = 0;
        serve();
        draw();
        wake();
      },
      hit,
      stop() {
        if (!playing) return;
        playing = false;
        sleep();
        step = null;
        streak = 0;
        pos = { ...REST };
        opacity = 1;
        setPhase("idle");
        draw();
      },
    };

    draw();
    events.current.onReady();

    return () => {
      sleep();
      resize.disconnect();
      seen.disconnect();
      controlsRef.current = null;
    };
  }, [assist, controlsRef]);

  const ring = "absolute rounded-[50%] -translate-x-1/2 -translate-y-1/2";

  return (
    <div
      ref={layerRef}
      data-volley-game
      data-volley-phase="idle"
      aria-hidden
      className="pointer-events-none absolute inset-0"
    >
      {/* Точки-носители: нулевой размер, поэтому scale идёт вокруг самой точки,
          а содержимое центрируется на ней своим translate */}
      <div ref={shadowRef} className="absolute left-0 top-0 size-0 will-change-transform">
        <div className={ring} style={SHADOW_BOX} />
      </div>
      <div ref={targetRef} className="absolute left-0 top-0 size-0 opacity-0 will-change-transform">
        <div
          className={`${ring} border-[1.5px] border-muted`}
          style={{ width: townSize(24), height: townSize(14) }}
        />
      </div>
      <div ref={approachRef} className="absolute left-0 top-0 size-0 opacity-0 will-change-transform">
        <div
          className={`${ring} border-2 border-accent`}
          style={{ width: townSize(24), height: townSize(14) }}
        />
      </div>
      <div ref={ballRef} data-volley-ball className="absolute left-0 top-0 size-0 will-change-transform">
        <div ref={spinRef} className="absolute" style={{ ...BALL_BOX, transform: "translate(-50%, -50%)" }}>
          <BallArt />
        </div>
      </div>
      <div ref={flashRef} className="absolute left-0 top-0 size-0 opacity-0">
        <div className={`${ring} border-2 border-accent`} style={{ width: townSize(26), height: townSize(26) }} />
      </div>
      <div ref={flashOpponentRef} className="absolute left-0 top-0 size-0 opacity-0">
        <div className={`${ring} border-2 border-muted`} style={{ width: townSize(22), height: townSize(22) }} />
      </div>
    </div>
  );
}
