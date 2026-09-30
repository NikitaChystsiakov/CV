/**
 * ДОМ НАВЫКОВ — какие живые демо висят в галерее (блок 3).
 *
 * Подача: не рассказ «умею анимации», а витрина работающих приёмов. Сам сайт
 * и есть доказательство: каждую плитку можно потрогать мышью, пальцем и
 * клавиатурой, а под кнопкой «Как сделано» — пара строк и фрагмент кода.
 *
 * Владелец включает и выключает демо полем `enabled` — больше ничего править
 * не нужно: галерея берёт включённые по порядку этого массива. Хотя бы одно
 * демо должно остаться включённым: дом навыков открывается всегда
 * (`ROOM_STOP_IDS` в `rooms.tsx`), и пустая галерея была бы обещанием без
 * содержимого. Это проверяет `scripts/verify/b3-houses.mjs`.
 *
 * Стрелки в подсказках склеены неразрывным пробелом (`\u00a0`): иначе узкая
 * плитка отрывает последнюю стрелку на новую строку.
 *
 * Строки — парой `{ ru, en }`. Фрагменты кода — не перевод, а код, поэтому
 * одной строкой; кириллицы в них быть не должно (verify ищет её в английской
 * версии), комментарии внутри кода — по-английски.
 *
 * Все демо двигают только `transform` и `opacity`: ни одно не меняет
 * раскладку на кадре. Покадровые значения живут в motion values, состояние
 * React меняется только по действию человека (клик, клавиша, отпускание).
 */

import type { Localized } from "@/lib/i18n";

export type SkillDemoId =
  | "spring"
  | "shared"
  | "scroll"
  | "morph"
  | "chars"
  | "tilt"
  | "magnet"
  | "counter";

export type SkillDemo = {
  id: SkillDemoId;
  /** Показывать ли плитку в галерее */
  enabled: boolean;
  /** Название приёма — подпись плитки */
  title: Localized;
  /** Как потрогать: коротко, мышью и клавиатурой */
  hint: Localized;
  /** «Как сделано»: пара строк — идея и почему так */
  how: Localized;
  /** Фрагмент кода. Не переводится; только ASCII */
  code: string;
};

export const SKILL_DEMOS: SkillDemo[] = [
  {
    id: "spring",
    enabled: true,
    title: { ru: "Пружина и инерция", en: "Spring and inertia" },
    hint: { ru: "Бросьте шайбу или жмите ←\u00a0→\u00a0↑\u00a0↓", en: "Throw the puck or press ←\u00a0→\u00a0↑\u00a0↓" },
    how: {
      ru: "Перетаскивание с импульсом: после броска шайба летит по инерции и отскакивает от краёв на пружине. Позиция — motion value, React на кадре не перерисовывается.",
      en: "Drag with momentum: after a throw the puck coasts on inertia and bounces off the edges on a spring. Position is a motion value, so React never re-renders per frame.",
    },
    code: `<motion.button
  drag
  dragConstraints={stageRef}
  dragElastic={0.18}
  dragTransition={{
    power: 0.35,
    bounceStiffness: 420,
    bounceDamping: 16,
  }}
  style={{ x, y }}
/>`,
  },
  {
    id: "shared",
    enabled: true,
    title: { ru: "Общий элемент", en: "Shared element" },
    hint: { ru: "Клик по вкладке или ←\u00a0→", en: "Click a tab or press ←\u00a0→" },
    how: {
      ru: "Подсветка — один элемент с layoutId: при смене вкладки он не пересоздаётся, а перелетает на новое место. Анимация идёт через transform, раскладка считается один раз.",
      en: "The highlight is one element with a layoutId: switching tabs moves it instead of recreating it. The move is a transform, layout is measured once.",
    },
    code: `{tabs.map((tab) => (
  <button role="tab" key={tab.id}>
    {active === tab.id && (
      <motion.span
        layoutId="pill"
        transition={{ type: "spring",
          stiffness: 500, damping: 36 }}
      />
    )}
    {tab.label}
  </button>
))}`,
  },
  {
    id: "scroll",
    enabled: true,
    title: { ru: "Анимация от скролла", en: "Scroll-linked motion" },
    hint: { ru: "Прокрутите список или PageDown", en: "Scroll the list or press PageDown" },
    how: {
      ru: "Прогресс прокрутки своего контейнера — motion value: полоса сверху и строки читают его через useTransform. Ни слушателя scroll, ни состояния на кадр.",
      en: "The container's scroll progress is a motion value: the bar and the rows read it through useTransform. No scroll listener, no per-frame state.",
    },
    code: `const { scrollYProgress } = useScroll({
  container: listRef,
});
const bar = useSpring(scrollYProgress, {
  stiffness: 300, damping: 40,
});

<motion.div style={{ scaleX: bar }} />`,
  },
  {
    id: "morph",
    enabled: true,
    title: { ru: "Морфинг иконки", en: "Icon morph" },
    hint: { ru: "Клик, Enter или пробел", en: "Click, Enter or Space" },
    how: {
      ru: "Не интерполяция атрибута d: три отрезка поворачиваются и гаснут. Только transform и opacity — геометрия пути не пересчитывается, и кадр остаётся дешёвым.",
      en: "Not a d-attribute tween: three strokes rotate and fade. Only transform and opacity, so the path geometry is never recomputed and frames stay cheap.",
    },
    code: `const bars = open
  ? [{ y: 6, rotate: 45 },
     { opacity: 0, scaleX: 0 },
     { y: -6, rotate: -45 }]
  : [{}, {}, {}];

<motion.line animate={bars[0]}
  style={{ originX: 0.5, originY: 0.5 }} />`,
  },
  {
    id: "chars",
    enabled: true,
    title: { ru: "Текст по буквам", en: "Letter by letter" },
    hint: { ru: "Кнопка «Ещё раз» или Enter", en: "The Replay button or Enter" },
    how: {
      ru: "Строка режется на буквы, слова держатся вместе, чтобы перенос не рвал их. Скринридер читает целую фразу, буквы для него скрыты.",
      en: "The line is split into letters while words stay whole, so wrapping never breaks them. Screen readers get the full phrase; the letters are hidden from them.",
    },
    code: `<span className="sr-only">{text}</span>
<motion.span aria-hidden
  initial="hidden" animate="shown"
  transition={{ staggerChildren: 0.03 }}>
  {chars.map((char, i) => (
    <motion.span key={i} variants={{
      hidden: { opacity: 0, y: "0.6em" },
      shown: { opacity: 1, y: 0 },
    }}>{char}</motion.span>
  ))}
</motion.span>`,
  },
  {
    id: "tilt",
    enabled: true,
    title: { ru: "3D-наклон", en: "3D tilt" },
    hint: { ru: "Наведите или жмите ←\u00a0→\u00a0↑\u00a0↓", en: "Hover or press ←\u00a0→\u00a0↑\u00a0↓" },
    how: {
      ru: "Указатель задаёт две motion value, пружина сглаживает их в поворот карточки. Блик едет за указателем тем же transform. При «меньше движения» поворота нет.",
      en: "The pointer sets two motion values; a spring smooths them into the card's rotation. The glare follows with the same transform. With reduced motion there is no rotation.",
    },
    code: `const rotateX = useSpring(
  useTransform(py, [-0.5, 0.5], [10, -10]),
  { stiffness: 220, damping: 18 },
);
const rotateY = useSpring(
  useTransform(px, [-0.5, 0.5], [-12, 12]),
  { stiffness: 220, damping: 18 },
);`,
  },
  {
    id: "magnet",
    enabled: true,
    title: { ru: "Магнитная кнопка", en: "Magnetic button" },
    hint: { ru: "Подведите указатель или ←\u00a0→", en: "Bring the pointer close or press ←\u00a0→" },
    how: {
      ru: "Кнопка тянется к указателю в радиусе притяжения, подпись — ещё чуть сильнее, это даёт глубину. Вне радиуса пружина возвращает всё на место.",
      en: "The button leans toward the pointer inside a pull radius, its label a little more, which adds depth. Outside the radius a spring brings it home.",
    },
    code: `function onPointerMove(e) {
  const dx = e.clientX - center.x;
  const dy = e.clientY - center.y;
  const near = Math.hypot(dx, dy) < RADIUS;
  x.set(near ? dx * 0.35 : 0);
  y.set(near ? dy * 0.35 : 0);
}`,
  },
  {
    id: "counter",
    enabled: true,
    title: { ru: "Счётчик-барабан", en: "Rolling counter" },
    hint: { ru: "Кнопки или ↑\u00a0↓, PageUp", en: "Buttons, or ↑\u00a0↓ and PageUp" },
    how: {
      ru: "Каждый разряд — лента цифр 0–9, которая едет по вертикали через transform. Для скринридера это spinbutton с настоящим значением.",
      en: "Each digit is a strip of 0-9 sliding vertically via transform. For screen readers it is a spinbutton with the real value.",
    },
    code: `{digits.map((digit, i) => (
  <span className="h-[1em] overflow-hidden">
    <motion.span
      animate={{ y: \`\${-digit * 10}%\` }}
      transition={{ type: "spring",
        stiffness: 260, damping: 26 }}>
      0 1 2 3 4 5 6 7 8 9
    </motion.span>
  </span>
))}`,
  },
];

/** Включённые демо в порядке галереи */
export function enabledSkillDemos(): SkillDemo[] {
  return SKILL_DEMOS.filter((demo) => demo.enabled);
}
