/**
 * Блок 3 «Дом навыков и дом кейсов» (29.09.2026).
 *
 * Оба дома открывают не 3D-комнату, а плоскую галерею-панель: дом навыков —
 * плитки живых демо, дом кейсов — экспозицию «картины на стене». Почти всё,
 * что здесь может сломаться, на скриншоте не видно: демо, которое не
 * слушается клавиатуры, фокус, ушедший из второго слоя на лист под ним,
 * Escape, закрывший дом вместо лайтбокса, крутящаяся карточка при «меньше
 * движения». Поэтому проверки — про поведение, а скриншоты — чтобы глазами.
 *
 * Контент владельца пуст, поэтому экспозиция кейсов проверяется на
 * dev-превью с фикстурами (`/dev/cases`, в проде — 404), а стек в доме
 * навыков — на `/dev/skills`. На маршруте проверяется обратное: пока
 * `profile.cases` пуст, дом кейсов не кнопка.
 */

import { readFileSync } from "node:fs";

export const stage = "Б3";

const S = stage;
const CYRILLIC = /[а-яё]/i;

/** Поле `profile` заполнено: не `[]` и не `null` — та же логика, что в `rooms.tsx` */
function profileFilled(field) {
  const src = readFileSync("src/lib/profile.ts", "utf8");
  const literal = src.slice(src.indexOf("export const profile"));
  const value = literal.match(new RegExp(`^\\s*${field}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? "";
  return value !== "" && !/^(\[\s*\]|null),?$/.test(value);
}

/** Включённые демо — из конфига `src/lib/skills-demos.ts`, в его порядке */
function enabledDemos() {
  const src = readFileSync("src/lib/skills-demos.ts", "utf8");
  return [...src.matchAll(/id:\s*"(\w+)",\s*enabled:\s*(true|false)/g)]
    .filter((m) => m[2] === "true")
    .map((m) => m[1]);
}

/** Фрагменты кода «как сделано» — строки между обратными кавычками после `code:` */
function codeSnippets() {
  const src = readFileSync("src/lib/skills-demos.ts", "utf8");
  return [...src.matchAll(/code:\s*`([\s\S]*?)`,\n/g)].map((m) => m[1]);
}

export async function run({ browser, openPage, report, BASE, OUT, sleep, roomStopIds }) {
  const demos = enabledDemos();
  const withRoom = roomStopIds();
  const casesFilled = profileFilled("cases");

  // --- Конфиг и контракт ----------------------------------------------------
  const door = readFileSync("src/lib/scene-assets.ts", "utf8").match(
    /skills:\s*\{\s*x:\s*([\d.]+),\s*y:\s*([\d.]+)\s*\}/,
  );
  report(
    S,
    "у дома навыков снята точка двери (HOUSE_DOORS)",
    Boolean(door) && [door[1], door[2]].every((v) => Number(v) > 0 && Number(v) < 1),
    door ? `${door[1]} / ${door[2]}` : "нет skills в HOUSE_DOORS",
  );
  report(S, "в галерее навыков включено хотя бы одно демо", demos.length > 0, `${demos.length}: ${demos.join(", ")}`);
  report(S, "дом навыков открывается всегда (ROOM_STOP_IDS)", withRoom.includes("skills"), withRoom.join(", "));
  report(
    S,
    "дом кейсов в ROOM_STOP_IDS ровно тогда, когда profile.cases не пуст",
    withRoom.includes("cases") === casesFilled,
    `cases ${casesFilled ? "заполнен" : "пуст"}, в списке: ${withRoom.includes("cases")}`,
  );
  const snippets = codeSnippets();
  report(
    S,
    "фрагменты кода без кириллицы и длинных тире (их не переводят)",
    snippets.length >= demos.length && snippets.every((code) => !CYRILLIC.test(code) && !code.includes("—")),
    `${snippets.length} фрагм.`,
  );
  const devSource = readFileSync("src/app/dev/cases/page.tsx", "utf8");
  report(
    S,
    "dev-превью кейсов в проде отдаёт notFound()",
    /NODE_ENV\s*===\s*"production"\)\s*notFound\(\)/.test(devSource),
  );

  // --- Помощники -------------------------------------------------------------
  const bringUp = async (view, id) => {
    await view.evaluate((stop) => {
      document.querySelector(`[data-stop="${stop}"]`)?.scrollIntoView({ block: "center", behavior: "instant" });
    }, id);
    await view.waitForTimeout(700);
  };

  /** Войти в дом навыков кликом по дому и дождаться демо (чанк грузится при входе) */
  const openSkills = async (view) => {
    await bringUp(view, "skills");
    const trigger = view.locator('[data-room-trigger="skills"] >> visible=true');
    if ((await trigger.count()) === 0) return false;
    await trigger.first().click();
    try {
      await view.waitForSelector('[data-house-panel="skills"] [data-skill-demo]', { timeout: 60000 });
    } catch {
      return false;
    }
    await view.waitForTimeout(900);
    return true;
  };

  /** dev-превью: панель открыта сразу, ждём содержимое */
  const openDev = async (view, path, ready) => {
    const response = await view.goto(new URL(path, BASE).href, { waitUntil: "networkidle" });
    try {
      await view.waitForSelector(ready, { timeout: 60000 });
    } catch {
      return { ok: false, status: response?.status() ?? 0 };
    }
    await view.waitForTimeout(700);
    return { ok: true, status: response?.status() ?? 0 };
  };

  const setEnglish = async (view) => {
    await view.evaluate(() => sessionStorage.setItem("cv-lang", "en"));
    await view.reload({ waitUntil: "networkidle" });
    await view.waitForTimeout(600);
  };

  /** Все видимые строки слоя и подписи для скринридера */
  const panelText = (view) =>
    view.evaluate(() => {
      const root = document.querySelector("[data-room]");
      if (!root) return "";
      const labels = [...root.querySelectorAll("[aria-label], [alt]")].map(
        (el) => `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("alt") ?? ""}`,
      );
      return `${root.innerText} ${labels.join(" ")}`;
    });

  /** Горизонтальная прокрутка: ни у документа, ни у листа панели */
  const overflow = (view) =>
    view.evaluate(() => {
      const sheet = document.querySelector("[data-room-stage]");
      return {
        page: document.documentElement.scrollWidth - innerWidth,
        sheet: sheet ? sheet.scrollWidth - sheet.clientWidth : 0,
      };
    });

  /** Состояние демо: дискретные `data-demo-state` и transform проб */
  const demoSnapshot = (view, id) =>
    view.evaluate((demo) => {
      const tile = document.querySelector(`[data-skill-tile="${demo}"]`);
      if (!tile) return null;
      const states = [...tile.querySelectorAll("[data-demo-state]")].map((el) => el.dataset.demoState);
      const probes = [...tile.querySelectorAll("[data-demo-probe]")].map((el) => getComputedStyle(el).transform);
      return JSON.stringify({ states, probes });
    }, id);

  /** Фокус внутри элемента по селектору */
  const focusInside = (view, selector) =>
    view.evaluate((sel) => {
      const root = document.querySelector(sel);
      return Boolean(root && document.activeElement && root.contains(document.activeElement));
    }, selector);

  /** N табов не уводят фокус за пределы селектора */
  const tabTrap = async (view, selector, times) => {
    for (let i = 0; i < times; i += 1) {
      await view.keyboard.press("Tab");
      if (!(await focusInside(view, selector))) {
        const tag = await view.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? "нет");
        return `ушёл на ${i + 1}-м табе на <${tag}>`;
      }
    }
    return "";
  };

  /** transform и opacity всех узлов слоя — для «ничего не движется само» */
  const motionFrame = (view) =>
    view.evaluate(() =>
      [...document.querySelectorAll("[data-room] *")]
        .map((el) => {
          const style = getComputedStyle(el);
          return `${style.transform}|${style.opacity}`;
        })
        .join(";"),
    );

  // --- Дом навыков, 1440: вход, ленивая загрузка, клавиатура ----------------
  {
    const page = await openPage(browser);
    const before = await page.locator("[data-skill-demo]").count();
    const scripts = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(request.url());
    });
    const opened = await openSkills(page);
    report(S, "дом навыков открывается кликом по дому", opened);
    report(
      S,
      "код демо грузится только при входе в дом",
      before === 0 && scripts.length > 0,
      `до входа демо в DOM: ${before}, скриптов догружено при входе: ${scripts.length}`,
    );

    const tiles = await page.locator("[data-skill-demo]").evaluateAll((els) => els.map((el) => el.dataset.skillDemo));
    report(
      S,
      "галерея показывает ровно включённые демо, в порядке конфига",
      JSON.stringify(tiles) === JSON.stringify(demos),
      tiles.join(", "),
    );
    report(
      S,
      "панель — модальный слой z-60 с диалогом",
      await page.evaluate(() => {
        const root = document.querySelector('[data-house-panel="skills"]');
        return Boolean(root && getComputedStyle(root).zIndex === "60" && root.querySelector('[role="dialog"][aria-modal="true"]'));
      }),
    );
    report(
      S,
      "блока стека нет, пока profile.stack пуст",
      profileFilled("stack") || (await page.locator("[data-skill-stack]").count()) === 0,
      profileFilled("stack") ? "стек заполнен — блок обязан быть" : "",
    );
    if (profileFilled("stack")) {
      report(S, "стек заполнен — блок стека на месте", (await page.locator("[data-skill-stack]").count()) === 1);
    }

    // Каждое демо управляется с клавиатуры: фокус на контроле, клавиша из
    // `data-demo-keys` — и состояние демо обязано измениться
    for (const id of demos) {
      const control = page.locator(`[data-skill-demo="${id}"] [data-demo-control]`).first();
      if ((await control.count()) === 0) {
        report(S, `демо «${id}» управляется с клавиатуры`, false, "нет [data-demo-control]");
        continue;
      }
      const key = (await control.getAttribute("data-demo-keys")) ?? "Enter";
      await control.focus();
      const was = await demoSnapshot(page, id);
      const focused = await focusInside(page, `[data-skill-tile="${id}"]`);
      await page.keyboard.press(key);
      await page.waitForTimeout(700);
      const now = await demoSnapshot(page, id);
      report(
        S,
        `демо «${id}» управляется с клавиатуры (${key})`,
        focused && was !== null && now !== was,
        focused ? "" : "контрол не принял фокус",
      );
    }

    // Мышь: бросок шайбы, наклон карточки, притяжение магнита
    await page.locator('[data-skill-tile="spring"]').scrollIntoViewIfNeeded();
    const puck = await page.locator('[data-skill-demo="spring"] [data-demo-control]').boundingBox();
    const springWas = await demoSnapshot(page, "spring");
    if (puck) {
      const cx = puck.x + puck.width / 2;
      const cy = puck.y + puck.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 8; i += 1) await page.mouse.move(cx - i * 10, cy + i * 4);
      await page.mouse.up();
      await page.waitForTimeout(900);
    }
    report(S, "шайбу можно бросить мышью", Boolean(puck) && (await demoSnapshot(page, "spring")) !== springWas);

    const card = page.locator('[data-skill-demo="tilt"] [data-demo-control]');
    await card.scrollIntoViewIfNeeded();
    const cardBox = await card.boundingBox();
    if (cardBox) {
      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
      await page.mouse.move(cardBox.x + cardBox.width * 0.9, cardBox.y + cardBox.height * 0.15, { steps: 6 });
      await page.waitForTimeout(500);
    }
    const tiltTransform = await card.evaluate((el) => getComputedStyle(el).transform);
    report(S, "карточка наклоняется за указателем", /matrix3d/.test(tiltTransform), tiltTransform.slice(0, 40));

    const magnet = page.locator('[data-skill-demo="magnet"] [data-demo-control]');
    const magnetBox = await magnet.boundingBox();
    if (magnetBox) {
      await page.mouse.move(magnetBox.x + magnetBox.width / 2, magnetBox.y - 70, { steps: 4 });
      await page.mouse.move(magnetBox.x + magnetBox.width / 2 + 40, magnetBox.y - 30, { steps: 6 });
      await page.waitForTimeout(500);
    }
    const magnetTransform = await magnet.evaluate((el) => getComputedStyle(el).transform);
    report(S, "магнитная кнопка тянется к указателю", magnetTransform !== "none" && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(magnetTransform), magnetTransform);
    await page.mouse.move(5, 5);

    // «Как сделано»: второй слой, фокус внутри, Escape закрывает только его
    const how = page.locator(`[data-skill-how="${demos[0]}"]`);
    await how.click();
    await page.waitForTimeout(500);
    const sheet = "[data-skill-how-sheet]";
    const sheetOpen = (await page.locator(sheet).count()) > 0;
    const code = sheetOpen ? await page.locator(`${sheet} pre`).innerText() : "";
    report(S, "«Как сделано» открывает пару строк и фрагмент кода", sheetOpen && code.trim().length > 20, `${code.length} симв.`);
    report(S, "фокус уходит в «Как сделано»", await focusInside(page, sheet));
    const sheetTrap = sheetOpen ? await tabTrap(page, sheet, 8) : "слой не открыт";
    report(S, "фокус-ловушка «Как сделано»: таб не уходит на лист под ним", sheetTrap === "", sheetTrap);
    if (sheetOpen) await page.screenshot({ path: `${OUT}/b3-skills-how-1440.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    report(
      S,
      "Escape закрывает «Как сделано», а дом остаётся открытым",
      (await page.locator(sheet).count()) === 0 && (await page.locator('[data-house-panel="skills"]').count()) === 1,
    );
    report(
      S,
      "фокус вернулся на кнопку «Как сделано»",
      await page.evaluate((id) => document.activeElement?.getAttribute("data-skill-how") === id, demos[0]),
    );

    const panelTrap = await tabTrap(page, "[data-room]", 40);
    report(S, "фокус-ловушка галереи: 40 табов не уводят фокус на маршрут", panelTrap === "", panelTrap);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    report(S, "Escape закрывает дом навыков", (await page.locator("[data-room]").count()) === 0);
    const back = await page.evaluate(() => document.activeElement?.getAttribute("data-room-trigger") ?? document.activeElement?.tagName);
    report(S, "после выхода фокус вернулся на дом навыков", back === "skills", String(back));
    report(S, "дом навыков без ошибок в консоли", page.errors.length === 0, page.errors.slice(0, 2).join(" | "));
    await page.close();
  }

  // --- Дом навыков: ширины и темы, скриншоты --------------------------------
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    for (const scheme of ["light", "dark"]) {
      const view = await openPage(browser, {
        viewport: { width, height },
        isMobile: width <= 430,
        hasTouch: width <= 430,
        colorScheme: scheme,
      });
      const opened = await openSkills(view);
      if (!opened) {
        report(S, `дом навыков открывается на ${width}px (${scheme})`, false);
        await view.close();
        continue;
      }
      await view.screenshot({ path: `${OUT}/b3-skills-${width}-${scheme}.png` });
      if (scheme === "light") {
        const over = await overflow(view);
        const tilesOut = await view.evaluate(() =>
          [...document.querySelectorAll("[data-skill-tile]")]
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.left < -1 || r.right > innerWidth + 1).length,
        );
        report(
          S,
          `галерея навыков на ${width}px без горизонтальной прокрутки`,
          over.page <= 0 && over.sheet <= 0 && tilesOut === 0,
          `страница +${over.page}px, лист +${over.sheet}px, плиток за краем: ${tilesOut}`,
        );
      }
      if (width === 390) {
        // Второй кадр — прокрученный лист: на телефоне плитки идут столбиком
        await view.evaluate(() => {
          const sheet = document.querySelector("[data-room-stage]");
          sheet?.scrollTo({ top: sheet.scrollHeight / 2, behavior: "instant" });
        });
        await view.waitForTimeout(400);
        await view.screenshot({ path: `${OUT}/b3-skills-390-${scheme}-scrolled.png` });
        if (scheme === "light") {
          // Палец: касание кнопки счётчика меняет значение
          const plus = view.locator('[data-skill-demo="counter"] [data-demo-tap]');
          if ((await plus.count()) > 0) {
            await plus.scrollIntoViewIfNeeded();
            const was = await demoSnapshot(view, "counter");
            await plus.tap();
            await view.waitForTimeout(500);
            report(S, "на телефоне демо отвечает касанию (счётчик)", (await demoSnapshot(view, "counter")) !== was);
          }
        }
      }
      await view.close();
    }
  }

  // --- Дом навыков по-английски ----------------------------------------------
  {
    const view = await openPage(browser);
    await setEnglish(view);
    await openSkills(view);
    let text = await panelText(view);
    for (const id of demos) {
      const button = view.locator(`[data-skill-how="${id}"]`);
      if ((await button.count()) === 0) continue;
      await button.click();
      await view.waitForTimeout(300);
      text += ` ${await panelText(view)}`;
      await view.keyboard.press("Escape");
      await view.waitForTimeout(300);
    }
    const bad = text.match(/[^\s]*[а-яё—][^\s]*/i)?.[0] ?? "";
    report(S, "дом навыков по-английски: ни кириллицы, ни длинных тире (и в «как сделано»)", text.length > 200 && bad === "", bad);
    await view.close();
  }

  // --- Дом навыков при prefers-reduced-motion --------------------------------
  {
    const view = await openPage(browser, { reducedMotion: "reduce" });
    const opened = await openSkills(view);
    report(S, "reduced-motion: галерея открывается и говорит, что движение выключено", opened && (await view.locator("[data-skills-reduced]").count()) === 1);
    const a = await motionFrame(view);
    await view.waitForTimeout(1200);
    const b = await motionFrame(view);
    report(S, "reduced-motion: в галерее ничего не движется само", a === b && a.length > 0);

    const card = view.locator('[data-skill-demo="tilt"] [data-demo-control]');
    const box = await card.boundingBox();
    if (box) {
      await view.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await view.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.1, { steps: 6 });
      await view.waitForTimeout(400);
    }
    await card.focus();
    await view.keyboard.press("ArrowRight");
    await view.waitForTimeout(400);
    const still = await card.evaluate((el) => getComputedStyle(el).transform);
    report(S, "reduced-motion: карточка не вращается ни от указателя, ни от стрелок", still === "none", still);

    const puck = view.locator('[data-skill-demo="spring"] [data-demo-control]');
    const puckBox = await puck.boundingBox();
    if (puckBox) {
      await view.mouse.move(puckBox.x + puckBox.width / 2, puckBox.y + puckBox.height / 2);
      await view.mouse.down();
      await view.mouse.move(puckBox.x - 60, puckBox.y + 20, { steps: 6 });
      await view.mouse.up();
      await view.waitForTimeout(300);
    }
    const puckAfter = await puck.boundingBox();
    report(
      S,
      "reduced-motion: шайбу не бросить — инерции нет",
      Boolean(puckBox && puckAfter) && Math.abs(puckAfter.x - puckBox.x) < 1,
    );
    await view.screenshot({ path: `${OUT}/b3-skills-reduced.png` });
    const running = await view.evaluate(
      () => document.getAnimations().filter((anim) => anim.playState === "running").length,
    );
    report(S, "reduced-motion: нет запущенных анимаций", running === 0, `${running}`);
    await view.close();
  }

  // --- Дом кейсов на маршруте ------------------------------------------------
  {
    const page = await openPage(browser);
    const triggers = await page.locator('[data-room-trigger="cases"]').count();
    report(
      S,
      casesFilled ? "profile.cases заполнен — дом кейсов кнопка" : "пока profile.cases пуст, дом кейсов не кнопка",
      casesFilled ? triggers > 0 : triggers === 0,
      `триггеров: ${triggers}`,
    );
    if (!casesFilled) {
      await bringUp(page, "cases");
      const art = page.locator('[data-stop="cases"] [data-scene-object] >> visible=true');
      if ((await art.count()) > 0) await art.first().click({ force: true });
      await page.waitForTimeout(600);
      report(S, "клик по пустому дому кейсов ничего не открывает", (await page.locator("[data-room]").count()) === 0);
    }
    await page.close();
  }

  // --- Экспозиция кейсов на фикстурах (/dev/cases) ---------------------------
  const CASES = '[data-house-panel="cases"] [data-case]';
  const caseIndex = (view) => view.evaluate(() => Number(document.querySelector("[data-case]")?.dataset.caseIndex ?? -1));
  {
    const page = await openPage(browser);
    const dev = await openDev(page, "/dev/cases", CASES);
    report(S, "dev-превью /dev/cases в dev отдаёт 200 и рисует экспозицию", dev.ok && dev.status === 200, `${dev.status}`);
    const skillsDev = await page.request.get(new URL("/dev/skills", BASE).href);
    report(S, "dev-превью /dev/skills в dev отдаёт 200", skillsDev.status() === 200, `${skillsDev.status()}`);

    if (dev.ok) {
      const total = await page.locator("[data-case-pick]").count();
      const first = await caseIndex(page);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(700);
      const second = await caseIndex(page);
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(700);
      const third = await caseIndex(page);
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(700);
      const wrapped = await caseIndex(page);
      report(
        S,
        "кейсы листаются стрелками клавиатуры (и по кругу)",
        first === 0 && second === 1 && third === 0 && wrapped === total - 1,
        `${first} → ${second} → ${third} → ${wrapped} из ${total}`,
      );

      await page.locator("[data-case-next]").click();
      await page.waitForTimeout(700);
      report(S, "кнопка «следующий кейс» листает", (await caseIndex(page)) === 0);

      // Свайп мышью по картине: тянем влево — следующий кейс, лайтбокс не открылся
      const swipe = await page.locator("[data-case-swipe]").first().boundingBox();
      if (swipe) {
        const y = swipe.y + swipe.height / 2;
        await page.mouse.move(swipe.x + swipe.width * 0.7, y);
        await page.mouse.down();
        for (let i = 1; i <= 10; i += 1) await page.mouse.move(swipe.x + swipe.width * 0.7 - i * 25, y);
        await page.mouse.up();
        await page.waitForTimeout(900);
      }
      report(
        S,
        "свайп по картине листает кейсы и не открывает крупный просмотр",
        Boolean(swipe) && (await caseIndex(page)) === 1 && (await page.locator("[data-case-lightbox]").count()) === 0,
        `индекс ${await caseIndex(page)}`,
      );
      await page.locator('[data-case-pick="fixture-a"]').click();
      await page.waitForTimeout(700);

      // Лайтбокс: клик по картине, стрелки листают скриншоты, Escape — только его
      await page.locator("[data-case-shot-open]").first().click();
      await page.waitForTimeout(600);
      const box = "[data-case-lightbox]";
      const lightbox = (await page.locator(box).count()) > 0;
      report(S, "клик по картине открывает скриншот крупно", lightbox);
      report(S, "фокус уходит в крупный просмотр", await focusInside(page, box));
      const shotBefore = await page.locator("[data-case-shot-index]").getAttribute("data-case-shot-index").catch(() => null);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(500);
      const shotAfter = await page.locator("[data-case-shot-index]").getAttribute("data-case-shot-index").catch(() => null);
      report(
        S,
        "в крупном просмотре стрелки листают скриншоты, а не кейсы",
        shotBefore === "0" && shotAfter === "1" && (await caseIndex(page)) === 0,
        `${shotBefore} → ${shotAfter}`,
      );
      const boxTrap = lightbox ? await tabTrap(page, box, 8) : "не открыт";
      report(S, "фокус-ловушка крупного просмотра", boxTrap === "", boxTrap);
      await page.waitForTimeout(400);
      if (lightbox) await page.screenshot({ path: `${OUT}/b3-cases-lightbox-1440.png` });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      report(
        S,
        "Escape закрывает крупный просмотр, экспозиция остаётся",
        (await page.locator(box).count()) === 0 && (await page.locator('[data-house-panel="cases"]').count()) === 1,
      );
      report(
        S,
        "фокус вернулся на картину",
        await page.evaluate(() => document.activeElement?.hasAttribute("data-case-shot-open") ?? false),
      );

      const trap = await tabTrap(page, "[data-room]", 30);
      report(S, "фокус-ловушка экспозиции: 30 табов не уходят со страницы-панели", trap === "", trap);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      report(
        S,
        "Escape закрывает экспозицию, фокус возвращается на то, что её открыло",
        (await page.locator("[data-room]").count()) === 0 &&
          (await page.evaluate(() => document.activeElement?.hasAttribute("data-dev-reopen") ?? false)),
      );
      report(S, "экспозиция без ошибок в консоли", page.errors.length === 0, page.errors.slice(0, 2).join(" | "));
    }
    await page.close();
  }

  // --- Экспозиция: ширины и темы, скриншоты ---------------------------------
  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    for (const scheme of ["light", "dark"]) {
      const view = await openPage(browser, {
        viewport: { width, height },
        isMobile: width <= 430,
        hasTouch: width <= 430,
        colorScheme: scheme,
      });
      const dev = await openDev(view, "/dev/cases", CASES);
      if (!dev.ok) {
        report(S, `экспозиция рисуется на ${width}px (${scheme})`, false, `${dev.status}`);
        await view.close();
        continue;
      }
      await view.screenshot({ path: `${OUT}/b3-cases-${width}-${scheme}.png` });
      if (scheme === "light") {
        const over = await overflow(view);
        report(
          S,
          `экспозиция на ${width}px без горизонтальной прокрутки`,
          over.page <= 0 && over.sheet <= 0,
          `страница +${over.page}px, лист +${over.sheet}px`,
        );
      }
      if (width === 390) {
        await view.evaluate(() => {
          const sheet = document.querySelector("[data-room-stage]");
          sheet?.scrollTo({ top: sheet.scrollHeight, behavior: "instant" });
        });
        await view.waitForTimeout(400);
        await view.screenshot({ path: `${OUT}/b3-cases-390-${scheme}-scrolled.png` });
        if (scheme === "light") {
          await view.locator("[data-case-next]").tap();
          await view.waitForTimeout(700);
          report(S, "на телефоне кейсы листаются касанием", (await caseIndex(view)) === 1);
          await view.locator("[data-case-pick='fixture-a']").tap();
          await view.waitForTimeout(700);
          await view.locator("[data-case-shot-open]").first().tap();
          await view.waitForTimeout(700);
          const lb = await overflow(view);
          await view.screenshot({ path: `${OUT}/b3-cases-lightbox-390.png` });
          report(S, "крупный просмотр на телефоне открывается и влезает", (await view.locator("[data-case-lightbox]").count()) === 1 && lb.page <= 0);
        }
      }
      await view.close();
    }
  }

  // --- Экспозиция по-английски и при reduced-motion --------------------------
  {
    const view = await openPage(browser);
    await view.evaluate(() => sessionStorage.setItem("cv-lang", "en"));
    await openDev(view, "/dev/cases", CASES);
    let text = await panelText(view);
    await view.locator("[data-case-shot-open]").first().click();
    await view.waitForTimeout(500);
    text += ` ${await panelText(view)}`;
    const bad = text.match(/[^\s]*[а-яё—][^\s]*/i)?.[0] ?? "";
    report(S, "экспозиция по-английски: ни кириллицы, ни длинных тире", text.length > 200 && bad === "", bad);
    await view.close();

    const calm = await openPage(browser, { reducedMotion: "reduce" });
    await openDev(calm, "/dev/cases", CASES);
    await calm.keyboard.press("ArrowRight");
    await sleep(60);
    const frame = await calm.evaluate(() => {
      const article = document.querySelector("[data-case]");
      if (!article) return null;
      const style = getComputedStyle(article);
      return { index: article.dataset.caseIndex, transform: style.transform, opacity: style.opacity };
    });
    report(
      S,
      "reduced-motion: кейс сменяется сразу, без въезда",
      frame?.index === "1" && (frame.transform === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(frame.transform)) && frame.opacity === "1",
      JSON.stringify(frame),
    );
    await calm.close();
  }

  // --- Стек в доме навыков на фикстуре (/dev/skills) --------------------------
  {
    const content = readFileSync("src/lib/content.ts", "utf8");
    const label = (key) => content.match(new RegExp(`${key}:\\s*\\{\\s*ru:\\s*"([^"]+)"`))?.[1] ?? "";
    for (const width of [390, 1440]) {
      const view = await openPage(browser, { viewport: { width, height: 900 }, isMobile: width <= 430, hasTouch: width <= 430 });
      const dev = await openDev(view, "/dev/skills", "[data-skill-stack]");
      const levels = dev.ok
        ? await view.locator("[data-skill-level]").evaluateAll((els) => els.map((el) => el.querySelector("p")?.textContent ?? ""))
        : [];
      const expected = [label("levelDaily"), label("levelConfident"), label("levelFamiliar")];
      const stackText = dev.ok ? await view.locator("[data-skill-stack]").innerText() : "";
      if (width === 1440) {
        report(
          S,
          "стек показан тремя честными ступенями, без процентов и звёздочек",
          dev.ok && JSON.stringify(levels) === JSON.stringify(expected) && !/%|★|☆/.test(stackText),
          levels.join(" / "),
        );
      }
      if (dev.ok) {
        await view.locator("[data-skill-stack]").scrollIntoViewIfNeeded();
        await view.waitForTimeout(300);
        await view.screenshot({ path: `${OUT}/b3-skills-stack-${width}.png` });
        const over = await overflow(view);
        report(S, `стек на ${width}px без горизонтальной прокрутки`, over.page <= 0 && over.sheet <= 0);
      }
      await view.close();
    }
  }
}
