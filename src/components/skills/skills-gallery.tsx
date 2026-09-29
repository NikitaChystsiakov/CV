"use client";

import { useCallback, useEffect, useId, useRef, useState, type ComponentType } from "react";

import { PanelOverlay } from "@/components/skills/house-panel";
import { CharsDemo } from "@/components/skills/demos/chars";
import { CounterDemo } from "@/components/skills/demos/counter";
import { MagnetDemo } from "@/components/skills/demos/magnet";
import { MorphDemo } from "@/components/skills/demos/morph";
import { ScrollLinkedDemo } from "@/components/skills/demos/scroll-linked";
import { SharedDemo } from "@/components/skills/demos/shared";
import { SpringDemo } from "@/components/skills/demos/spring";
import { TiltDemo } from "@/components/skills/demos/tilt";
import { fill, useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { LEVEL_LABEL, type Skill, type SkillLevel } from "@/lib/profile";
import { enabledSkillDemos, type SkillDemo, type SkillDemoId } from "@/lib/skills-demos";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Галерея дома навыков: плитки живых демо и, если владелец заполнил стек,
 * честные уровни владения под ними.
 *
 * Этот модуль грузится только при входе в дом (`next/dynamic` в
 * `house-panels.tsx`): восемь демо с их пружинами и слушателями — не то, что
 * нужно маршруту на первом экране.
 *
 * Контракт для проверок (`scripts/verify/b3-houses.mjs`):
 *   [data-skill-tile="<id>"]     плитка
 *   [data-skill-demo="<id>"]     сцена демо
 *   [data-demo-control]          элемент, которым демо управляется с клавиатуры
 *   [data-demo-keys]             какой клавишей (первая из поддержанных)
 *   [data-demo-state]            дискретное состояние: меняется от действия
 *   [data-demo-probe]            узел, чей transform — тоже состояние
 *   [data-skill-how="<id>"]      кнопка «Как сделано»
 *   [data-skill-how-sheet]       открытый слой «Как сделано»
 *   [data-skill-stack]           блок стека (только при непустом стеке)
 */

const DEMOS: Record<SkillDemoId, ComponentType> = {
  spring: SpringDemo,
  shared: SharedDemo,
  scroll: ScrollLinkedDemo,
  morph: MorphDemo,
  chars: CharsDemo,
  tilt: TiltDemo,
  magnet: MagnetDemo,
  counter: CounterDemo,
};

/** Порядок ступеней: сначала то, чем работаю каждый день */
const LEVELS: SkillLevel[] = ["daily", "confident", "familiar"];

export function SkillsGallery({ stack }: { stack: Skill[] }) {
  const say = useSay();
  const reduced = usePrefersReducedMotion();
  const demos = enabledSkillDemos();
  const [how, setHow] = useState<SkillDemo | null>(null);

  // Фокус возвращается на кнопку «Как сделано» после того, как слой снят:
  // пока он на экране, лист под ним `inert` и фокус на кнопку не встанет
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (how !== null || !returnTo.current) return;
    returnTo.current.focus();
    returnTo.current = null;
  }, [how]);

  const closeHow = useCallback(() => setHow(null), []);

  return (
    <>
      {reduced ? (
        <p data-skills-reduced className="mt-2 max-w-[60ch] text-sm text-muted">
          {say(UI.skillsReduced)}
        </p>
      ) : null}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {demos.map((demo) => {
          const Demo = DEMOS[demo.id];
          return (
            <li key={demo.id} data-skill-tile={demo.id} className="house-tile flex flex-col rounded-xl">
              <div data-skill-demo={demo.id} className="relative h-44 overflow-hidden rounded-t-xl">
                <Demo />
              </div>
              {/* Название — своей строкой: рядом с кнопкой оно ломалось в
                  столбик по слову. Подсказка и кнопка делят строку ниже */}
              <div className="flex flex-1 flex-col gap-2 border-t border-line p-4">
                <h3 className="font-display text-sm font-bold tracking-tight">{say(demo.title)}</h3>
                <div className="mt-auto flex items-end justify-between gap-3">
                  <p className="min-w-0 text-xs text-muted">{say(demo.hint)}</p>
                  <button
                    type="button"
                    data-skill-how={demo.id}
                    aria-haspopup="dialog"
                    onClick={(event) => {
                      returnTo.current = event.currentTarget;
                      setHow(demo);
                    }}
                    className="demo-chip shrink-0 rounded-full px-3 py-1.5 text-xs font-medium"
                  >
                    {say(UI.skillsHow)}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {stack.length > 0 ? <StackBlock stack={stack} /> : null}

      {how ? <HowSheet demo={how} onClose={closeHow} /> : null}
    </>
  );
}

/** «Как сделано»: пара строк и фрагмент кода, вторым слоем поверх галереи */
function HowSheet({ demo, onClose }: { demo: SkillDemo; onClose: () => void }) {
  const say = useSay();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <PanelOverlay
      onClose={onClose}
      labelledBy={titleId}
      data-skill-how-sheet={demo.id}
      className="house-overlay flex items-center justify-center p-3 sm:p-6"
    >
      <div
        data-lenis-prevent
        className="house-sheet relative max-h-full w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl p-5 sm:p-7"
      >
        <h3 id={titleId} className="pr-10 font-display text-lg font-bold tracking-tight">
          {fill(say(UI.skillsHowOf), { demo: say(demo.title) })}
        </h3>
        <p className="mt-3 text-sm leading-relaxed">{say(demo.how)}</p>
        <figure className="mt-5">
          <figcaption className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            {say(UI.skillsCode)}
          </figcaption>
          {/* Код не переводится и не подсвечивается вторым цветом: один
              акцент на весь сайт. Комментарии — приглушённым тоном */}
          <pre className="house-code mt-2 overflow-x-auto rounded-lg p-4 font-mono text-xs leading-relaxed">
            <code>
              {demo.code.split("\n").map((line, index) => (
                <span
                  key={index}
                  className={`block ${line.trimStart().startsWith("//") ? "text-muted" : ""}`}
                >
                  {line || " "}
                </span>
              ))}
            </code>
          </pre>
        </figure>
        <button
          ref={closeRef}
          type="button"
          data-skill-how-close
          onClick={onClose}
          aria-label={say(UI.skillsHowClose)}
          className="demo-chip absolute right-3 top-3 grid size-9 place-items-center rounded-full"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </PanelOverlay>
  );
}

/**
 * Стек тремя честными ступенями — без процентов и звёздочек. Блок есть,
 * только когда в `profile.stack` что-то записано: пустой раздел не рисуется.
 */
function StackBlock({ stack }: { stack: Skill[] }) {
  const say = useSay();
  return (
    <section data-skill-stack className="mt-10">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">{say(UI.skillsStack)}</h3>
      <div className="mt-4 grid gap-6 sm:grid-cols-3">
        {LEVELS.map((level) => {
          const items = stack.filter((skill) => skill.level === level);
          if (items.length === 0) return null;
          return (
            <div key={level} data-skill-level={level}>
              <p className="text-sm font-semibold">{say(LEVEL_LABEL[level])}</p>
              <ul className="mt-2 space-y-1.5">
                {items.map((skill) => (
                  <li key={skill.name} className="text-sm">
                    <span className="font-mono">{skill.name}</span>
                    {/* Разделитель без тире: одна и та же разметка на обоих языках */}
                    {skill.note ? <span className="text-muted"> · {say(skill.note)}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
