"use client";

import { useLenis } from "lenis/react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { useScrollLock } from "@/components/room/use-scroll-lock";
import { openXray, XRAY_MEDIA } from "@/components/xray";
import { UI } from "@/lib/content";
import type { Localized } from "@/lib/i18n";
import { dashes } from "@/lib/i18n";
import { routeStops } from "@/lib/route";
import { isUnlocked, MINIGAME_MASTER } from "@/lib/unlocked";
import { useLang } from "@/lib/use-lang";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

import {
  ArrowDownIcon,
  ArrowOutIcon,
  ArrowUpIcon,
  CloseIcon,
  EnterIcon,
  GlobeIcon,
  LayersIcon,
  MoonIcon,
  PageIcon,
  SearchIcon,
  StopIcon,
  SunIcon,
} from "./icons";
import { search, type Range } from "./search";
import { closePalette, returnFocusTarget, togglePalette, usePaletteOpen } from "./store";

/**
 * Командная палитра: поиск и прыжок по городу с клавиатуры.
 *
 * Маршрут — девять экранов скролла. Нанимающему, который пришёл за кейсами,
 * это долго, а быстрый путь в панели требует мыши. Палитра даёт то же за два
 * нажатия: `⌘K`, «кейсы», Enter.
 *
 * Устройство:
 * - `CommandPalette` смонтирован в layout всегда и держит только слушатель
 *   горячей клавиши. Сам диалог монтируется, лишь пока открыт: замок скролла,
 *   фокус-ловушка и возврат фокуса — это эффекты монтирования и размонтирования.
 * - Открыта или нет — внешний store (`store.ts`), его же читает кнопка в панели.
 * - Команда выполняется ПОСЛЕ закрытия, в следующем кадре: замок скролла снят,
 *   Lenis запущен. Остановленный Lenis молча игнорирует `scrollTo`.
 * - Паттерн ARIA — combobox со списком: фокус всё время в поле ввода, а
 *   выбранная строка сообщается через `aria-activedescendant`.
 *
 * Слой `z-[70]` — над всем, включая комнату дома (`z-[60]`) и панель (`z-50`).
 */

type GroupId = "route" | "settings" | "resume";

type Command = {
  id: string;
  group: GroupId;
  label: Localized;
  keywords?: Localized;
  icon: ReactNode;
  /** Что стоит в правом конце строки: «вы здесь» или стрелка перехода */
  trailing?: ReactNode;
  run: () => void;
};

const GROUPS: { id: GroupId; label: Localized }[] = [
  { id: "route", label: UI.paletteGroupRoute },
  { id: "settings", label: UI.paletteGroupSettings },
  { id: "resume", label: UI.paletteGroupResume },
];

/** Горячая клавиша: ⌘K или Ctrl+K. По `code`, чтобы работало и в русской раскладке, где K — это «л» */
function isPaletteHotkey(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  return event.code === "KeyK" || event.key.toLowerCase() === "k";
}

/**
 * Слушатель горячей клавиши и сам диалог. Монтируется в layout один раз.
 */
export function CommandPalette() {
  const open = usePaletteOpen();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || !isPaletteHotkey(event)) return;
      // Поверх открытой комнаты и разбора сайта не открываемся: у них своя
      // фокус-ловушка, и две ловушки перетягивали бы фокус друг у друга
      if (
        !document.querySelector("[data-palette]") &&
        document.querySelector("[data-room], [data-xray]")
      ) {
        return;
      }
      // Без preventDefault Chrome и Firefox по Ctrl+K уводят фокус в строку поиска браузера
      event.preventDefault();
      if (event.repeat) return;
      togglePalette();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return open ? <PaletteDialog /> : null;
}

/** Индекс остановки, на которой стоит посетитель, — той же формулой, что в панели */
function currentStopIndex() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? window.scrollY / max : 0;
  return Math.min(routeStops.length - 1, Math.floor(progress * routeStops.length));
}

function PaletteDialog() {
  const { lang, setLang } = useLang();
  const { resolvedTheme, setTheme } = useTheme();
  const lenis = useLenis();
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = usePrefersReducedMotion();

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Считается один раз при открытии: пока палитра открыта, страница стоит
  const [hereIndex] = useState(() => (pathname === "/" ? currentStopIndex() : -1));
  // Разбор сайта — награда за все раунды мини-игры и только от 1024px: ниже
  // слоям не хватает места. Считается при открытии, как и «вы здесь»
  const [xrayReady] = useState(
    () =>
      pathname === "/" && isUnlocked(MINIGAME_MASTER) && window.matchMedia(XRAY_MEDIA).matches,
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const baseId = useId();
  const listboxId = `${baseId}-list`;
  const optionId = (command: Command) => `${baseId}-${command.id}`;

  useScrollLock();

  // Фокус в поле при открытии и назад — туда, где он был, при закрытии.
  // preventScroll обязателен: элемент, с которого открыли, мог уехать за экран,
  // а после прыжка к остановке возврат фокуса иначе утащил бы страницу назад
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    return () => returnFocusTarget()?.focus({ preventScroll: true });
  }, []);

  // Фокус-ловушка: из палитры фокус не уходит — ни табом, ни кликом мимо
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      inputRef.current?.focus({ preventScroll: true });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePalette();
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const commands = useMemo<Command[]>(() => {
    const jumpTo = (id: string) => {
      const target = document.getElementById(id);
      // Не на главной (например, на /cv) — уходим на маршрут сразу к остановке
      if (!target) {
        router.push(`/#${id}`);
        return;
      }
      // Без Lenis (статичный режим) — нативный мгновенный прыжок
      if (lenis) lenis.scrollTo(target, { immediate: reducedMotion });
      else target.scrollIntoView({ block: "start", behavior: "instant" });
    };

    const isDark = resolvedTheme === "dark";

    return [
      ...routeStops.map<Command>((stop, index) => ({
        id: `stop-${stop.id}`,
        group: "route",
        label: stop.title,
        icon: <StopIcon className="size-4" />,
        trailing:
          index === hereIndex ? (
            // Подпись приглушённая, акцент — только точка: бирюза мелким
            // кеглем на белом не добирает контраста 4.5:1
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] text-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              {UI.paletteHere[lang]}
            </span>
          ) : undefined,
        run: () => jumpTo(stop.id),
      })),
      {
        id: "theme",
        group: "settings",
        label: isDark ? UI.paletteThemeLight : UI.paletteThemeDark,
        keywords: UI.paletteThemeKeywords,
        icon: isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />,
        run: () => setTheme(isDark ? "light" : "dark"),
      },
      {
        id: "lang",
        group: "settings",
        label: UI.paletteLang,
        keywords: UI.paletteLangKeywords,
        icon: <GlobeIcon className="size-4" />,
        run: () => setLang(lang === "ru" ? "en" : "ru"),
      },
      {
        id: "cv",
        group: "resume",
        label: UI.paletteCv,
        keywords: UI.paletteCvKeywords,
        icon: <PageIcon className="size-4" />,
        trailing: <ArrowOutIcon className="size-4 text-muted" />,
        run: () => router.push("/cv"),
      },
      ...(xrayReady
        ? [
            {
              id: "xray",
              group: "resume",
              label: UI.xrayCommand,
              keywords: UI.xrayKeywords,
              icon: <LayersIcon className="size-4" />,
              // Фокус к этому кадру уже вернулся туда, откуда открывали палитру
              run: () => openXray(),
            } satisfies Command,
          ]
        : []),
    ];
  }, [hereIndex, lang, lenis, reducedMotion, resolvedTheme, router, setLang, setTheme, xrayReady]);

  // Отфильтрованное и отсортированное по группам. Внутри группы — по очкам
  // совпадения, при равенстве — в порядке маршрута (sort стабильный)
  const groups = useMemo(() => {
    return GROUPS.map((group) => {
      const items = commands
        .filter((command) => command.group === group.id)
        .flatMap((command) => {
          const result = search(command, query, lang);
          return result ? [{ command, result }] : [];
        })
        .sort((a, b) => b.result.score - a.result.score);
      return { ...group, items };
    }).filter((group) => group.items.length > 0);
  }, [commands, lang, query]);

  const flat = groups.flatMap((group) => group.items.map((item) => item.command));
  const current = flat.length > 0 ? flat[Math.min(active, flat.length - 1)] : null;

  const execute = (command: Command) => {
    closePalette();
    // Следующий кадр: диалог размонтирован, замок скролла снят, Lenis запущен
    requestAnimationFrame(() => command.run());
  };

  /** Выбрать строку с клавиатуры и докрутить список так, чтобы она была видна */
  const moveTo = (index: number) => {
    setActive(index);
    const id = optionId(flat[index]);
    listRef.current
      ?.querySelector(`[id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const count = flat.length;
    const index = current ? flat.indexOf(current) : 0;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (count) moveTo((index + 1) % count);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (count) moveTo((index - 1 + count) % count);
        break;
      case "Home":
        event.preventDefault();
        if (count) moveTo(0);
        break;
      case "End":
        event.preventDefault();
        if (count) moveTo(count - 1);
        break;
      case "Enter":
        event.preventDefault();
        if (current) execute(current);
        break;
      case "Tab":
        // Кроме поля, в палитре фокусироваться нечему: строки выбираются
        // стрелками, а кнопка закрытия дублирует Escape для мыши и тача
        event.preventDefault();
        break;
    }
  };

  return (
    <div
      data-palette
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-4 sm:px-8 sm:pt-[12svh]"
    >
      {/* Завеса: город отходит на второй план. Лёгкий блюр здесь не
          украшение — сцена под палитрой пёстрая, и без него строки списка
          спорили бы с домами за внимание. Клик по завесе закрывает */}
      <div
        aria-hidden
        data-palette-veil
        onPointerDown={closePalette}
        className="palette-veil absolute inset-0 bg-palette-veil backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={UI.paletteTitle[lang]}
        data-palette-panel
        className="palette-panel relative flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl shadow-shadow/30"
      >
        <div className="flex items-center gap-3 border-b border-line pl-4 pr-2.5">
          <SearchIcon className="size-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={current ? optionId(current) : undefined}
            aria-label={UI.paletteTitle[lang]}
            data-palette-input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // Новый запрос — выбор снова на первой, самой подходящей строке
              setActive(0);
              listRef.current?.scrollTo({ top: 0 });
            }}
            onKeyDown={onInputKeyDown}
            placeholder={UI.palettePlaceholder[lang]}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            // 16px: на iOS поле мельче этого зумит страницу при фокусе
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted focus-visible:outline-none"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={closePalette}
            aria-label={UI.paletteClose[lang]}
            data-palette-close
            className="grid h-8 min-w-8 shrink-0 place-items-center rounded-md border border-line px-1.5 font-mono text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {/* На мыши — подсказка клавиши, на таче — крестик: клавиши там нет */}
            <span className="pointer-coarse:hidden">{UI.paletteKeyEsc[lang]}</span>
            <CloseIcon className="hidden size-4 pointer-coarse:block" />
          </button>
        </div>

        <div
          ref={listRef}
          // Колесо над списком достаётся списку: Lenis остановлен и иначе
          // гасил бы прокрутку своим preventDefault
          data-lenis-prevent
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [max-height:min(26rem,calc(100dvh-12rem))]"
        >
          <div role="listbox" id={listboxId} aria-label={UI.paletteTitle[lang]}>
            {groups.map((group) => (
              <div key={group.id} role="group" aria-labelledby={`${baseId}-g-${group.id}`}>
                <div
                  id={`${baseId}-g-${group.id}`}
                  role="presentation"
                  className="px-3 pb-1.5 pt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted first:pt-1.5"
                >
                  {group.label[lang]}
                </div>

                {group.items.map(({ command, result }) => {
                  const isActive = command === current;
                  const index = flat.indexOf(command);

                  return (
                    <div
                      key={command.id}
                      id={optionId(command)}
                      role="option"
                      aria-selected={isActive}
                      data-palette-option={command.id}
                      // Выбор мышью — по движению, а не по наведению: когда
                      // список прокручивается стрелками под неподвижным
                      // курсором, mouseenter перехватывал бы выбор
                      onPointerMove={() => {
                        if (index !== active) setActive(index);
                      }}
                      // Фокус остаётся в поле: клик не должен его забирать
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => execute(command)}
                      className={`flex min-h-10 cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-100 pointer-coarse:min-h-11 ${
                        isActive ? "bg-accent/12 text-ink" : "text-ink"
                      }`}
                    >
                      <span
                        className={`shrink-0 transition-colors duration-100 ${
                          isActive ? "text-accent" : "text-muted"
                        }`}
                      >
                        {command.icon}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                        <span className="truncate text-sm">
                          <Highlight
                            text={dashes(command.label[lang], lang)}
                            ranges={result.ranges}
                          />
                        </span>
                        {result.alt && (
                          <span className="truncate text-xs text-muted" data-palette-alt>
                            <Highlight text={result.alt.text} ranges={result.alt.ranges} />
                          </span>
                        )}
                      </span>
                      {command.trailing}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {flat.length === 0 && (
            <div data-palette-empty className="grid justify-items-center gap-1.5 px-6 py-10 text-center">
              <SearchIcon className="mb-1 size-5 text-muted" />
              <p className="text-sm font-medium text-ink">{UI.paletteEmpty[lang]}</p>
              <p className="max-w-[44ch] text-xs text-balance text-muted">
                {dashes(UI.paletteEmptyHint[lang], lang)}
              </p>
            </div>
          )}
        </div>

        {/* Подсказка клавиш — только там, где есть клавиатура */}
        <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 font-mono text-[11px] text-muted pointer-coarse:hidden">
          <span className="flex items-center gap-1.5">
            <Key>
              <ArrowUpIcon className="size-3" />
            </Key>
            <Key>
              <ArrowDownIcon className="size-3" />
            </Key>
            {UI.paletteHintMove[lang]}
          </span>
          <span className="flex items-center gap-1.5">
            <Key>
              <EnterIcon className="size-3" />
            </Key>
            {UI.paletteHintRun[lang]}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Key>{UI.paletteKeyEsc[lang]}</Key>
            {UI.paletteHintClose[lang]}
          </span>
        </div>

        {/* Скринридеру — сколько нашлось после каждого изменения запроса */}
        <p role="status" className="sr-only">
          {flat.length === 0 ? UI.paletteEmpty[lang] : `${UI.paletteFound[lang]}: ${flat.length}`}
        </p>
      </div>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="grid h-5 min-w-5 place-items-center rounded-md border border-line bg-bg px-1 font-mono text-[10px] text-ink">
      {children}
    </kbd>
  );
}

/** Подпись с подсветкой найденного — тем же цветом, что выделение текста на сайте */
function Highlight({ text, ranges }: { text: string; ranges: Range[] }) {
  if (ranges.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], index) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={index}
        data-palette-match
        className="rounded-[3px] bg-selection text-selection-ink"
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

