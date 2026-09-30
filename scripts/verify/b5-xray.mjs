/**
 * Блок 5 «Разбор сайта» (29.09.2026).
 *
 * Разбор переделан: у каждого слоя подпись о приёме и «подробнее» под
 * кликом, сцену можно вращать перетаскиванием, наведение и фокус изолируют
 * слой, стрелки ходят по слоям. На планшете 768 он объёмный, на телефоне —
 * плоский список с превью. Проверки «Разбор» в verify.mjs остаются как были;
 * здесь — то, что добавилось.
 *
 * Открывается разбор только от 1024 (команда палитры и кнопка мини-игры —
 * это закреплено проверками «Разбор» и Э9), поэтому 768 и 390 проверяются
 * так, как туда и попадают: открыли на 1024 и повернули планшет или сузили
 * окно.
 */

import { readFileSync } from "node:fs";

import sharp from "sharp";

export const stage = "Б5";

const S = stage;
const LAYERS_TOP_DOWN = ["hud", "map", "landmarks", "text", "sky", "walker", "town", "road", "ground"];

export async function run({ browser, report, BASE, OUT, routeStopIds }) {
  const MASTER_ID = readFileSync("src/lib/unlocked.ts", "utf8").match(/MINIGAME_MASTER = "([^"]+)"/)?.[1];

  const open = async (options = {}, { lang = "ru", width = 1440, height = 900 } = {}) => {
    const view = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, ...options });
    const errors = [];
    view.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    view.on("pageerror", (e) => errors.push(String(e)));
    view.errors = errors;
    await view.addInitScript(
      ([id, l]) => {
        sessionStorage.setItem("cv-unlocked", JSON.stringify([id]));
        sessionStorage.setItem("cv-lang", l);
      },
      [MASTER_ID, lang],
    );
    await view.goto(BASE, { waitUntil: "networkidle" });
    await view.waitForTimeout(600);
    // Остановка в середине маршрута: в кадре дом, декор, дорога, текст, персонаж
    const ids = routeStopIds();
    await view.evaluate((id) => {
      const stop = document.querySelector(`[data-stop="${id}"]`);
      window.scrollTo(0, stop.getBoundingClientRect().top + window.scrollY - 120);
    }, ids[Math.min(3, ids.length - 1)]);
    await view.waitForTimeout(1300);
    await view.locator("[data-palette-trigger]").click();
    await view.waitForTimeout(350);
    await view.keyboard.type(lang === "ru" ? "разобрать" : "take the site");
    await view.waitForTimeout(200);
    await view.keyboard.press("Enter");
    await view.waitForTimeout(1500);
    return view;
  };

  const plateTransforms = (view) =>
    view.evaluate(() => [...document.querySelectorAll("[data-xray-plate]")].map((p) => getComputedStyle(p).transform));
  const plateOpacity = (view) =>
    view.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("[data-xray-plate]")].map((p) => [p.dataset.xrayPlate, Number(getComputedStyle(p).opacity)]),
      ),
    );
  // Глубина пластины — m43 её матрицы (как в проверках «Разбор»)
  const depths = (view) =>
    view.evaluate(() =>
      [...document.querySelectorAll("[data-xray-plate]")].map((el) => {
        const m = getComputedStyle(el).transform.match(/matrix3d\(([^)]+)\)/);
        return m ? Math.round(Number(m[1].split(",")[14])) : 0;
      }),
    );
  const drag = async (view, x, y, dx, dy) => {
    await view.mouse.move(x, y);
    await view.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await view.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12);
      await view.waitForTimeout(16);
    }
    await view.mouse.up();
    await view.waitForTimeout(900);
  };
  // Разброс яркости в прямоугольнике экрана: у текста на фоне он высокий, у
  // приглушённого до 0,12 — почти ноль. «Значение меняется» не доказывает
  // «видно», поэтому изоляция проверяется ещё и в пикселях
  const contrast = async (view, rect) => {
    const png = await view.screenshot({
      clip: { x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.max(4, rect.width), height: Math.max(4, rect.height) },
    });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    let sq = 0;
    const n = info.width * info.height;
    for (let i = 0; i < data.length; i += info.channels) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += l;
      sq += l * l;
    }
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sq / n - mean * mean));
  };

  // --- 1440, русский: подписи, «подробнее», клавиатура, изоляция, вращение ---
  {
    const view = await open();
    const labels = await view.evaluate(() =>
      [...document.querySelectorAll("[data-xray-layer]")].map((b) => {
        const id = b.dataset.xrayLayer;
        return {
          id,
          name: b.querySelector(".font-medium")?.textContent ?? "",
          note: b.querySelector("[data-xray-note]")?.textContent ?? "",
          more: document.querySelector(`[data-xray-detail="${id}"] p`)?.textContent ?? "",
          scene: document.querySelector(`[data-xray-label="${id}"]`)?.textContent ?? "",
        };
      }),
    );
    report(
      S,
      "девять слоёв, в том числе персонаж; порядок в списке — сверху вниз",
      labels.map((l) => l.id).join() === LAYERS_TOP_DOWN.join(),
      labels.map((l) => l.id).join(" "),
    );
    report(
      S,
      "ru: у каждого слоя имя, строка о приёме и «подробнее» (от 120 знаков), ярлык в сцене",
      labels.every((l) => /[а-яё]/i.test(l.name) && l.note.length > 20 && l.more.length > 120 && /[а-яё]/i.test(l.more) && l.scene === l.name),
      labels.map((l) => `${l.id}:${l.note.length}/${l.more.length}`).join(" "),
    );

    // Клавиатура: фокус на первом слое, ↓ — следующий, фокус изолирует слой
    await view.locator(`[data-xray-layer="${LAYERS_TOP_DOWN[0]}"]`).focus();
    await view.keyboard.press("ArrowDown");
    await view.waitForTimeout(450);
    const afterDown = await view.evaluate(() => document.activeElement?.getAttribute("data-xray-layer"));
    const opDown = await plateOpacity(view);
    report(
      S,
      "↓ переводит фокус на следующий слой, он изолирован (остальные ≤ 0,5)",
      afterDown === LAYERS_TOP_DOWN[1] &&
        opDown[LAYERS_TOP_DOWN[1]] === 1 &&
        Object.entries(opDown).every(([id, o]) => id === LAYERS_TOP_DOWN[1] || o <= 0.5),
      `${afterDown}; ${JSON.stringify(opDown)}`,
    );
    await view.keyboard.press("ArrowUp");
    await view.keyboard.press("ArrowUp");
    await view.waitForTimeout(200);
    const wrapped = await view.evaluate(() => document.activeElement?.getAttribute("data-xray-layer"));
    report(S, "↑ с первого слоя уходит на последний (по кругу)", wrapped === LAYERS_TOP_DOWN.at(-1), wrapped);
    const tabbable = await view.evaluate(() => [...document.querySelectorAll("[data-xray-layer]")].filter((b) => b.tabIndex === 0).length);
    report(S, "в порядке таба — одна кнопка слоя (roving tabindex)", tabbable === 1, `${tabbable}`);

    // Enter — «подробнее»: раскрывается под кнопкой и видна в пикселях
    await view.keyboard.press("Enter");
    await view.waitForTimeout(300);
    const expanded = await view.evaluate(() => {
      const button = document.activeElement;
      const id = button?.getAttribute("data-xray-layer");
      const detail = document.querySelector(`[data-xray-detail="${id}"]`);
      const r = detail?.getBoundingClientRect();
      return { id, expanded: button?.getAttribute("aria-expanded"), h: r ? Math.round(r.height) : 0, controls: button?.getAttribute("aria-controls") === detail?.id };
    });
    report(S, "Enter раскрывает «подробнее» слоя (aria-expanded, текст виден)", expanded.expanded === "true" && expanded.h > 40 && expanded.controls, JSON.stringify(expanded));
    await view.screenshot({ path: `${OUT}/b5-1440-light.png` });
    await view.keyboard.press("Enter");
    await view.waitForTimeout(200);
    const collapsed = await view.evaluate(() => document.activeElement?.getAttribute("aria-expanded"));
    report(S, "повторный Enter сворачивает", collapsed === "false");

    // Наведение на ярлык в сцене изолирует слой — и это видно в пикселях:
    // заголовок остановки на пластине текста гаснет
    await view.mouse.move(1400, 880);
    await view.locator("[data-xray-panel]").focus();
    await view.waitForTimeout(400);
    const textRect = await view.evaluate(() => {
      const heading = document.querySelector('[data-xray-plate="text"] h2, [data-xray-plate="text"] h1, [data-xray-plate="text"] h3');
      const r = heading?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    });
    const before = textRect ? await contrast(view, textRect) : 0;
    await view.hover('[data-xray-label="town"] > div');
    await view.waitForTimeout(500);
    const after = textRect ? await contrast(view, textRect) : 0;
    const opHover = await plateOpacity(view);
    const sheets = await view.evaluate(() =>
      Object.fromEntries([...document.querySelectorAll("[data-xray-sheet]")].map((s) => [s.dataset.xraySheet, Number(getComputedStyle(s.firstElementChild).opacity)])),
    );
    report(
      S,
      "наведение на ярлык в сцене: слой 1, остальные пластины и их листы ≤ 0,5",
      opHover.town === 1 &&
        Object.entries(opHover).every(([id, o]) => id === "town" || o <= 0.5) &&
        Object.entries(sheets).every(([id, o]) => id === "town" || o <= 0.5),
      `${JSON.stringify(opHover)} | листы ${JSON.stringify(sheets)}`,
    );
    report(
      S,
      "изоляция видна в пикселях: заголовок на пластине текста гаснет",
      Boolean(textRect) && before > 8 && after < before * 0.5,
      `разброс яркости ${before.toFixed(1)} → ${after.toFixed(1)}`,
    );
    await view.mouse.move(1400, 880);
    await view.waitForTimeout(400);

    // Перетаскивание поворачивает сцену: матрицы пластин и место ярлыков меняются
    const t0 = await plateTransforms(view);
    const label0 = await view.locator('[data-xray-label="hud"]').evaluate((el) => el.style.transform);
    await drag(view, 1100, 470, -220, 60);
    const t1 = await plateTransforms(view);
    const label1 = await view.locator('[data-xray-label="hud"]').evaluate((el) => el.style.transform);
    report(
      S,
      "перетаскивание меняет поворот сцены (transform пластин и место ярлыков)",
      t0.every((t, i) => t !== t1[i]) && label0 !== label1,
      `${t0[0].slice(0, 60)}… → ${t1[0].slice(0, 60)}…`,
    );
    // ←→ поворачивают с клавиатуры
    await view.locator(`[data-xray-layer="${LAYERS_TOP_DOWN[0]}"]`).focus();
    // Фокус приподнимает слой — ждём, пока подъём доедет, иначе поворот не отличить от него
    await view.waitForTimeout(600);
    const k0 = await plateTransforms(view);
    await view.keyboard.press("ArrowRight");
    await view.waitForTimeout(600);
    const k1 = await plateTransforms(view);
    report(S, "→ в списке поворачивает сцену с клавиатуры", k0[0] !== k1[0]);

    // Показ по шагам: слой за слоем, кнопка же его останавливает
    await view.locator("[data-xray-tour]").click();
    await view.waitForTimeout(300);
    const step1 = await view.evaluate(() => document.querySelector('[data-xray-layer][aria-expanded="true"]')?.getAttribute("data-xray-layer"));
    await view.waitForTimeout(2400);
    const step2 = await view.evaluate(() => document.querySelector('[data-xray-layer][aria-expanded="true"]')?.getAttribute("data-xray-layer"));
    const pressed = await view.locator("[data-xray-tour]").getAttribute("aria-pressed");
    await view.locator("[data-xray-tour]").click();
    await view.waitForTimeout(300);
    const stopped = await view.evaluate(() => ({
      pressed: document.querySelector("[data-xray-tour]")?.getAttribute("aria-pressed"),
      open: document.querySelectorAll('[data-xray-layer][aria-expanded="true"]').length,
    }));
    report(
      S,
      "«Показать по шагам» идёт снизу вверх по слоям и останавливается",
      step1 === "ground" && step2 === "road" && pressed === "true" && stopped.pressed === "false" && stopped.open === 0,
      `${step1} → ${step2}, ${JSON.stringify(stopped)}`,
    );

    // Фокус-ловушка: таб по кругу не выходит из диалога
    let escaped = 0;
    for (let i = 0; i < 16; i += 1) {
      await view.keyboard.press(i < 10 ? "Tab" : "Shift+Tab");
      if (!(await view.evaluate(() => Boolean(document.activeElement?.closest("[data-xray-panel]"))))) escaped += 1;
    }
    report(S, "фокус-ловушка: Tab и Shift+Tab не выходят из разбора", escaped === 0, `вышел ${escaped} раз`);

    const hidden = await view.evaluate(() => getComputedStyle(document.querySelector("main")).visibility);
    report(S, "страница под разбором спрятана (её анимации не гоняют кадры стопки)", hidden === "hidden", hidden);

    await view.keyboard.press("Escape");
    await view.waitForTimeout(900);
    const closed = await view.evaluate(() => ({
      gone: !document.querySelector("[data-xray]"),
      focus: document.activeElement?.hasAttribute("data-palette-trigger") ?? false,
      page: getComputedStyle(document.querySelector("main")).visibility,
    }));
    report(S, "Escape закрывает, страница видна, фокус на кнопке палитры", closed.gone && closed.focus && closed.page === "visible", JSON.stringify(closed));
    report(S, "1440: нет ошибок в консоли", view.errors.length === 0, view.errors.slice(0, 2).join(" | "));
    await view.close();
  }

  // --- Английский: всё переведено, без кириллицы и длинных тире ------------
  {
    const view = await open({}, { lang: "en" });
    const text = await view.evaluate(() => {
      const panel = document.querySelector("[data-xray-panel]");
      const details = [...document.querySelectorAll("[data-xray-detail]")].map((d) => d.textContent ?? "");
      const labels = [...document.querySelectorAll("[data-xray-label]")].map((d) => d.textContent ?? "");
      return { panel: panel?.textContent ?? "", details, labels };
    });
    report(
      S,
      "en: подписи, «подробнее», ярлыки сцены и «как сделан» — без кириллицы и длинных тире",
      text.details.length === 9 &&
        text.details.every((d) => d.length > 120) &&
        !/[а-яё—]/i.test(text.panel + text.labels.join("")),
      text.details.map((d) => d.length).join("/"),
    );
    report(S, "en: нет ошибок в консоли", view.errors.length === 0, view.errors.slice(0, 2).join(" | "));
    await view.close();
  }

  // --- Тёмная тема: скриншот с раскрытым слоем ------------------------------
  {
    const view = await open({ colorScheme: "dark" });
    await view.locator('[data-xray-layer="town"]').click();
    await view.waitForTimeout(500);
    await view.screenshot({ path: `${OUT}/b5-1440-dark.png` });
    report(S, "1440, тёмная тема: без ошибок", view.errors.length === 0, view.errors.slice(0, 2).join(" | "));
    await view.close();
  }

  // --- reduced-motion: слои раздвинуты статично, поворота нет ---------------
  {
    const view = await open({ reducedMotion: "reduce" });
    const d0 = await depths(view);
    const t0 = await plateTransforms(view);
    await drag(view, 1100, 470, -220, 60);
    const t1 = await plateTransforms(view);
    // Фокус сам приподнимает слой — сравниваем уже после него
    await view.locator(`[data-xray-layer="${LAYERS_TOP_DOWN[0]}"]`).focus();
    await view.waitForTimeout(200);
    const t2 = await plateTransforms(view);
    await view.keyboard.press("ArrowRight");
    await view.waitForTimeout(400);
    const t3 = await plateTransforms(view);
    const hint = await view.locator("[data-xray-hint]").textContent();
    report(S, "reduced-motion: слои раздвинуты (девять разных глубин)", new Set(d0).size === 9, d0.join("/"));
    report(
      S,
      "reduced-motion: перетаскивание и ←→ не поворачивают сцену",
      t0.every((t, i) => t === t1[i]) && t2.every((t, i) => t === t3[i]),
    );
    report(S, "reduced-motion: подсказка не обещает поворот", !/поворот|rotate/i.test(hint ?? ""), hint);
    await view.close();
  }

  // --- 768: планшет повернули — разбор остался объёмным ----------------------
  for (const scheme of ["light", "dark"]) {
    const view = await open({ colorScheme: scheme }, { width: 1024, height: 768 });
    await view.setViewportSize({ width: 768, height: 1024 });
    await view.waitForTimeout(900);
    const state = await view.evaluate(() => {
      const panel = document.querySelector("[data-xray-panel]").getBoundingClientRect();
      const ground = document.querySelector('[data-xray-sheet="ground"] > div').getBoundingClientRect();
      const labels = [...document.querySelectorAll("[data-xray-label]")].map((l) => l.getBoundingClientRect());
      return {
        mode: document.querySelector("[data-xray]")?.getAttribute("data-xray-mode"),
        scene: getComputedStyle(document.querySelector("[data-xray-scene]")).display,
        matrix: getComputedStyle(document.querySelector("[data-xray-plate]")).transform.startsWith("matrix3d"),
        // Земля — над списком слоёв, а не под ним, и в пределах окна
        groundAbovePanel: ground.bottom <= panel.top + 8 && ground.left >= -4 && ground.right <= innerWidth + 4 && ground.width > 200,
        labelsInside: labels.every((r) => r.left >= 0 && r.right <= innerWidth && r.bottom <= panel.top + 8),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    report(
      S,
      `768 (${scheme}): объёмный разбор, стопка и ярлыки над списком, без горизонтальной прокрутки`,
      state.mode === "3d" && state.scene !== "none" && state.matrix && state.groundAbovePanel && state.labelsInside && state.overflow <= 0,
      JSON.stringify(state),
    );
    if (scheme === "light") {
      const t0 = await plateTransforms(view);
      await drag(view, 384, 280, 160, 0);
      const t1 = await plateTransforms(view);
      report(S, "768: перетаскивание пальцем/мышью поворачивает сцену", t0[0] !== t1[0]);
    }
    await view.screenshot({ path: `${OUT}/b5-768-${scheme}.png` });
    report(S, `768 (${scheme}): без ошибок в консоли`, view.errors.length === 0, view.errors.slice(0, 2).join(" | "));
    await view.close();
  }

  // --- 390: телефон — плоский список слоёв с превью --------------------------
  for (const scheme of ["light", "dark"]) {
    const view = await open({ colorScheme: scheme }, { width: 1024, height: 768 });
    await view.setViewportSize({ width: 390, height: 844 });
    await view.waitForTimeout(900);
    const state = await view.evaluate(() => {
      const panel = document.querySelector("[data-xray-panel]");
      const thumbs = [...document.querySelectorAll("[data-xray-thumb]")];
      return {
        mode: document.querySelector("[data-xray]")?.getAttribute("data-xray-mode"),
        scene: getComputedStyle(document.querySelector("[data-xray-scene]")).display,
        panel: (() => {
          const r = panel.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        })(),
        thumbs: thumbs.filter((t) => t.getBoundingClientRect().width > 0).length,
        filled: thumbs.filter((t) => t.querySelector("[data-scene-object], svg, img")).length,
        overflow: document.documentElement.scrollWidth - innerWidth,
        panelOverflow: panel.scrollWidth - panel.clientWidth,
        rows: [...document.querySelectorAll("[data-xray-layer]")].every((b) => b.getBoundingClientRect().right <= innerWidth),
      };
    });
    report(
      S,
      `390 (${scheme}): вместо 3D — список слоёв с превью, во всю ширину, без горизонтальной прокрутки`,
      state.mode === "list" &&
        state.scene === "none" &&
        state.panel.w === 390 &&
        state.thumbs === 9 &&
        state.filled >= 4 &&
        state.overflow <= 0 &&
        state.panelOverflow <= 0 &&
        state.rows,
      JSON.stringify(state),
    );
    if (scheme === "light") {
      await view.locator('[data-xray-layer="walker"]').click();
      await view.waitForTimeout(300);
      const detail = await view.evaluate(() => {
        const r = document.querySelector('[data-xray-detail="walker"]').getBoundingClientRect();
        return { h: Math.round(r.height), right: Math.round(r.right) };
      });
      report(S, "390: тап по слою раскрывает «подробнее» в пределах экрана", detail.h > 60 && detail.right <= 390, JSON.stringify(detail));
    }
    await view.screenshot({ path: `${OUT}/b5-390-${scheme}.png`, fullPage: false });
    await view.keyboard.press("Escape");
    await view.waitForTimeout(300);
    const closed = await view.evaluate(() => !document.querySelector("[data-xray]"));
    report(S, `390 (${scheme}): Escape закрывает сразу, без ошибок`, closed && view.errors.length === 0, view.errors.slice(0, 2).join(" | "));
    await view.close();
  }
}
