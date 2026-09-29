"use client";

import { motion, type Variants } from "framer-motion";
import { Fragment, useState } from "react";

import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { useLang } from "@/lib/use-lang";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

const CHAR: Variants = {
  hidden: { opacity: 0, y: "0.6em" },
  shown: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 420, damping: 30 } },
};

/**
 * Текст по буквам. Строка режется на буквы, но каждое слово — неразрывный
 * блок: иначе перенос строки мог бы оторвать от слова последнюю букву.
 * Скринридер получает фразу целиком (`sr-only`), буквы от него скрыты.
 */
export function CharsDemo() {
  const say = useSay();
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const [run, setRun] = useState(0);
  const text = say(UI.demoChars);
  const words = text.split(" ");

  return (
    <div
      data-demo-state={run}
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-5 text-center"
    >
      <p className="font-display text-lg font-bold leading-snug tracking-tight">
        <span className="sr-only">{text}</span>
        {/* Ключ с номером прогона и языком: новый прогон — новые буквы с нуля */}
        <motion.span
          key={`${lang}-${run}`}
          aria-hidden
          initial={reduced ? false : "hidden"}
          animate="shown"
          transition={{ staggerChildren: 0.03, delayChildren: 0.2 }}
        >
          {words.map((word, wordIndex) => (
            <Fragment key={wordIndex}>
              {wordIndex > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {Array.from(word).map((char, charIndex) => (
                  <motion.span key={charIndex} variants={CHAR} className="inline-block">
                    {char}
                  </motion.span>
                ))}
              </span>
            </Fragment>
          ))}
        </motion.span>
      </p>
      <button
        type="button"
        data-demo-control
        data-demo-keys="Enter"
        onClick={() => setRun((count) => count + 1)}
        className="demo-chip rounded-full px-3 py-1 text-xs font-medium"
      >
        {say(UI.demoReplay)}
      </button>
    </div>
  );
}
