/**
 * Блок 6 «Волейбол — мини-игра» (29.09.2026).
 *
 * Проверки идут на dev-странице превью `/dev/volleyball`: на маршруте площадку
 * ставит основной агент, а здесь нужны условия, которых на маршруте нет, —
 * пустые экраны над кортом (ленивая загрузка) и упрощённый соперник
 * `?assist=1`, с которым победа детерминирована: любой удар по летящему к нам
 * мячу — очко.
 *
 * Скриншот не покажет ни того, что код игры не грузится заранее, ни того, что
 * мяч едет transform, ни того, что цикл стоит, пока площадка вне кадра, —
 * поэтому проверки про сеть, стиль и атрибуты.
 */

import { readFileSync } from "node:fs";

export const stage = "Б6";

const S = stage;
const ACHIEVEMENT = "volleyball:three-in-a-row";
const CYR = /[а-яё]/i;

function trophySummary(lang) {
  const src = readFileSync("src/lib/trophies.ts", "utf8");
  const match = src.match(
    new RegExp(`id: "volleyball"[\\s\\S]{0,600}?summary:\\s*\\{[\\s\\S]{0,400}?${lang}:\\s*"([^"]+)"`),
  );
  if (!match) throw new Error(`Не нашёл summary (${lang}) трофея «volleyball» в src/lib/trophies.ts`);
  return match[1];
}

export async function run({ browser, openPage, report, BASE, OUT }) {
  const URL_PLAIN = `${BASE}/dev/volleyball`;
  const URL_ASSIST = `${BASE}/dev/volleyball?assist=1`;

  // --- Исходники: dev-страница закрыта в проде, строки парой, en чистый -------
  const pageSrc = readFileSync("src/app/dev/volleyball/page.tsx", "utf8");
  report(
    S,
    "dev-страница в продакшне отдаёт notFound()",
    /if\s*\(\s*process\.env\.NODE_ENV\s*===\s*"production"\s*\)\s*notFound\(\)/.test(pageSrc),
  );
  const landmarkSrc = readFileSync("src/components/volleyball/volleyball-landmark.tsx", "utf8");
  report(
    S,
    "игра подключена лениво (next/dynamic, без SSR)",
    /dynamic\(\s*\(\)\s*=>\s*import\("\.\/game"\)\s*,\s*\{\s*ssr:\s*false\s*\}\s*\)/.test(landmarkSrc) &&
      !/^import[^;]*from "\.\/game";/m.test(landmarkSrc.replace(/^import type[^;]*;/gm, "")),
  );
  const gameSrc = readFileSync("src/components/volleyball/game.tsx", "utf8");
  report(
    S,
    "в коде игры нет preventDefault на колесе и touchmove",
    !/(wheel|touchmove)/i.test(gameSrc + landmarkSrc.replace(/\/\/.*$/gm, "")),
  );
  const content = readFileSync("src/lib/content.ts", "utf8");
  const strings = [...content.matchAll(/^\s{2}(volley\w+):\s*\{\s*ru:\s*"([^"]*)",\s*en:\s*"([^"]*)"\s*\}/gm)];
  const multi = [...content.matchAll(/^\s{2}(volley\w+):\s*\{\n\s*ru:\s*"([^"]*)",\n\s*en:\s*"([^"]*)",?\n\s*\}/gm)];
  const all = [...strings, ...multi];
  const dirty = all.filter((m) => CYR.test(m[3]) || m[3].includes("—") || !m[2] || !m[3]).map((m) => m[1]);
  report(S, "строки волейбола — парой ru/en, en без кириллицы и тире", all.length >= 10 && dirty.length === 0, `${all.length} строк${dirty.length ? `, плохие: ${dirty.join(", ")}` : ""}`);

  // --- Ленивая загрузка: код игры приходит только на подъезде -----------------
  const page = await openPage(browser);
  const scripts = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  await page.goto(URL_ASSIST, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const before = scripts.length;
  const earlyGame = await page.$("[data-volley-game]");
  const staticBall = await page.evaluate(() => {
    const ball = document.querySelector("[data-volley-ball]");
    const court = document.querySelector("[data-landmark=volleyball] img");
    if (!ball || !court) return null;
    const b = ball.getBoundingClientRect();
    const c = court.getBoundingClientRect();
    return { inside: b.left > c.left && b.right < c.right && b.top > c.top && b.bottom < c.bottom, w: b.width };
  });
  report(S, "до подъезда стоит статичный корт с мячом, кода игры нет", !earlyGame && Boolean(staticBall?.inside) && staticBall.w > 6, JSON.stringify(staticBall));

  const landmark = page.locator("[data-landmark=volleyball]");
  await landmark.scrollIntoViewIfNeeded();
  await page.waitForSelector("[data-volley-game]", { timeout: 15000 }).catch(() => null);
  await page.waitForLoadState("networkidle");
  const lateScripts = scripts.slice(before);
  report(
    S,
    "код игры запрошен только после подъезда площадки",
    Boolean(await page.$("[data-volley-game]")) && lateScripts.length > 0,
    `скриптов до: ${before}, после подъезда: +${lateScripts.length}`,
  );

  const touchAction = await landmark.evaluate((el) => getComputedStyle(el).touchAction);
  report(S, "touch-action не запрещает вертикальную прокрутку", !/none|pan-x(?!.*pan-y)/.test(touchAction) , touchAction);

  // Колесо над площадкой, пока игры нет, листает страницу
  const box = await landmark.boundingBox();
  const center = { x: box.x + box.width / 2, y: box.y + box.height * 0.55 };
  const wheelScroll = async () => {
    const y0 = await page.evaluate(() => window.scrollY);
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(700);
    const y1 = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(700);
    return y1 - y0;
  };
  const idleDelta = await wheelScroll();
  report(S, "колесо над площадкой прокручивает страницу (игра не идёт)", idleDelta > 50, `${Math.round(idleDelta)}px`);

  const clip = { x: box.x - 70, y: box.y - 80, width: box.width + 140, height: box.height + 190 };
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${OUT}/b6-volleyball-rest-light.png`, clip });

  // --- Старт мышью, мяч едет только transform -------------------------------
  await landmark.scrollIntoViewIfNeeded();
  const phase = () => page.locator("[data-volley-phase]").getAttribute("data-volley-phase");
  const waitPhase = (value) =>
    page.waitForSelector(`[data-volley-phase="${value}"]`, { timeout: 8000 }).then(
      () => true,
      () => false,
    );
  const score = () => page.locator("[data-volley-score]").getAttribute("data-volley-score");
  const waitScore = (value) =>
    page.waitForSelector(`[data-volley-score="${value}"]`, { timeout: 8000 }).then(
      () => true,
      () => false,
    );

  // Следим за стилем мяча: какие свойства в нём вообще появляются
  await page.evaluate(() => {
    const ball = document.querySelector("[data-volley-game] [data-volley-ball]");
    window.__volleyProps = new Set();
    window.__volleyMutations = 0;
    new MutationObserver(() => {
      window.__volleyMutations += 1;
      for (let i = 0; i < ball.style.length; i += 1) window.__volleyProps.add(ball.style[i]);
    }).observe(ball, { attributes: true, attributeFilter: ["style", "class"] });
  });

  await page.locator("[data-volley-start]").click();
  const started = await waitPhase("in");
  const samples = [];
  for (let i = 0; i < 6; i += 1) {
    samples.push(
      await page.evaluate(() => {
        const ball = document.querySelector("[data-volley-game] [data-volley-ball]");
        const cs = getComputedStyle(ball);
        const r = ball.getBoundingClientRect();
        return { left: cs.left, top: cs.top, x: r.x, y: r.y, t: cs.transform };
      }),
    );
    await page.waitForTimeout(90);
  }
  const moved = samples.some((s) => Math.hypot(s.x - samples[0].x, s.y - samples[0].y) > 4);
  const fixedBox = samples.every((s) => s.left === samples[0].left && s.top === samples[0].top);
  const props = await page.evaluate(() => [...window.__volleyProps]);
  report(S, "старт мышью: подача пошла", started, `фаза ${await phase()}`);
  report(
    S,
    "мяч движется только transform (left/top не меняются, в стиле только transform/opacity)",
    moved && fixedBox && props.length > 0 && props.every((p) => p === "transform" || p === "opacity"),
    `свойства: ${props.join(", ")}; left/top ${samples[0].left}/${samples[0].top}`,
  );

  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${OUT}/b6-volleyball-play-light.png`, clip });

  // Колесо над площадкой во время игры тоже листает страницу
  const playDelta = await wheelScroll();
  report(S, "колесо над площадкой прокручивает страницу и во время игры", playDelta > 50, `${Math.round(playDelta)}px`);
  await landmark.scrollIntoViewIfNeeded();

  // Удар мышью по корту
  await waitPhase("in");
  await page.waitForTimeout(700);
  const courtBox = await page.locator("[data-landmark=volleyball] img").boundingBox();
  await page.mouse.click(courtBox.x + courtBox.width * 0.3, courtBox.y + courtBox.height * 0.6);
  report(S, "удар мышью по корту засчитан", await waitScore("1"), `серия ${await score()}`);

  // Цикл стоит, когда площадка уехала из кадра
  await waitPhase("in");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const frozen = await page.evaluate(async () => {
    const ball = document.querySelector("[data-volley-game] [data-volley-ball]");
    const a = ball.style.transform;
    const m = window.__volleyMutations;
    await new Promise((r) => setTimeout(r, 700));
    return { same: a === ball.style.transform, mutations: window.__volleyMutations - m };
  });
  report(S, "площадка вне кадра: цикл стоит, мяч не пишется", frozen.same && frozen.mutations === 0, JSON.stringify(frozen));
  await landmark.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const resumed = await page.evaluate(async () => {
    const m = window.__volleyMutations;
    await new Promise((r) => setTimeout(r, 400));
    return window.__volleyMutations - m;
  });
  report(S, "вернулись к площадке — игра продолжается", resumed > 5, `${resumed} кадров за 0,4 с`);

  // Удар пробелом (фокус на кнопке — она стала кнопкой удара)
  await waitPhase("in");
  await page.waitForTimeout(700);
  const focused = await page.evaluate(() => document.activeElement?.hasAttribute("data-volley-start"));
  await page.keyboard.press("Space");
  report(S, "удар пробелом с кнопки засчитан", focused && (await waitScore("2")), `фокус на кнопке: ${focused}, серия ${await score()}`);

  // Третий розыгрыш — Enter: победа, ачивка, подпись трофея
  await waitPhase("in");
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter");
  const won = await page
    .waitForSelector("[data-volley-trophy]", { timeout: 8000 })
    .then(() => true, () => false);
  const popupText = won ? await page.locator("[data-volley-trophy]").innerText() : "";
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("cv-unlocked") ?? "[]"));
  report(S, "три розыгрыша подряд: всплывает подпись трофея из trophies.ts", won && popupText.includes(trophySummary("ru")), popupText.replace(/\s+/g, " ").slice(0, 90));
  report(S, "победа записала ачивку в sessionStorage", stored.filter((id) => id === ACHIEVEMENT).length === 1, stored.join(", "));
  report(S, "после победы игра остановлена, фаза «won»", (await phase()) === "won");

  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${OUT}/b6-volleyball-trophy-light.png`, clip: { ...clip, height: clip.height + 120 } });

  // Escape закрывает всплывашку и возвращает фокус на кнопку
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const afterEscape = await page.evaluate(() => ({
    popup: Boolean(document.querySelector("[data-volley-trophy]")),
    focus: document.activeElement?.hasAttribute("data-volley-start") ?? false,
  }));
  report(S, "Escape закрывает подпись и возвращает фокус на кнопку", !afterEscape.popup && afterEscape.focus, JSON.stringify(afterEscape));

  // Вторая победа: ачивка не дублируется, подпись снова открывается
  await page.keyboard.press("Enter");
  for (let n = 1; n <= 3; n += 1) {
    await waitPhase("in");
    await page.waitForTimeout(500);
    await page.keyboard.press("Space");
    await waitScore(String(n));
  }
  const again = await page
    .waitForSelector("[data-volley-trophy]", { timeout: 8000 })
    .then(() => true, () => false);
  const stored2 = await page.evaluate(() => JSON.parse(sessionStorage.getItem("cv-unlocked") ?? "[]"));
  report(S, "повторная победа: ачивка записана один раз", again && stored2.filter((id) => id === ACHIEVEMENT).length === 1, stored2.join(", "));

  // Клик мимо закрывает подпись
  await page.mouse.click(20, 20);
  await page.waitForTimeout(400);
  report(S, "клик мимо закрывает подпись", !(await page.$("[data-volley-trophy]")));

  // Escape во время игры останавливает её
  await page.locator("[data-volley-start]").click();
  await waitPhase("in");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  report(S, "Escape во время игры останавливает её", (await phase()) === "idle", `фаза ${await phase()}`);

  report(S, "превью с игрой — без ошибок в консоли", page.errors.length === 0, page.errors.slice(0, 2).join(" | "));
  await page.close();

  // --- Настоящий соперник: ранний удар — промах ---------------------------------
  {
    const real = await openPage(browser);
    await real.goto(URL_PLAIN, { waitUntil: "networkidle" });
    await real.locator("[data-landmark=volleyball]").scrollIntoViewIfNeeded();
    await real.waitForSelector("[data-volley-game]", { timeout: 15000 });
    await real.locator("[data-volley-start]").click();
    await real.waitForSelector('[data-volley-phase="in"]', { timeout: 8000 });
    await real.keyboard.press("Space");
    const lost = await real
      .waitForSelector('[data-volley-phase="serve"]', { timeout: 6000 })
      .then(() => true, () => false);
    const s = await real.locator("[data-volley-score]").getAttribute("data-volley-score");
    report(S, "без упрощения: удар раньше окна — промах, серия не растёт", lost && s === "0", `серия ${s}`);

    // Удар у самой земли — атака, соперник не достаёт. Время меряется в
    // странице: подача всегда летит IN_MS (game.tsx), жмём за ~110 мс до
    // касания — внутри «сладкого» окна SWEET_MS = 210
    await real.waitForSelector('[data-volley-phase="serve"]', { timeout: 8000 });
    await real.evaluate(() => {
      const layer = document.querySelector("[data-volley-phase]");
      const button = document.querySelector("[data-volley-start]");
      const watch = new MutationObserver(() => {
        if (layer.dataset.volleyPhase !== "in") return;
        watch.disconnect();
        setTimeout(() => {
          button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
        }, 1450 - 110);
      });
      watch.observe(layer, { attributes: true, attributeFilter: ["data-volley-phase"] });
    });
    const sweet = await real
      .waitForSelector('[data-volley-score="1"]', { timeout: 8000 })
      .then(() => true, () => false);
    report(S, "без упрощения: удар у самой земли — очко", sweet, `серия ${await real.locator("[data-volley-score]").getAttribute("data-volley-score")}`);
    report(S, "превью без упрощения — без ошибок в консоли", real.errors.length === 0, real.errors.slice(0, 2).join(" | "));
    await real.close();
  }

  // --- Тач: старт и удар тапом ---------------------------------------------------
  {
    const touch = await openPage(browser, { hasTouch: true });
    await touch.goto(URL_ASSIST, { waitUntil: "networkidle" });
    await touch.locator("[data-landmark=volleyball]").scrollIntoViewIfNeeded();
    await touch.waitForSelector("[data-volley-game]", { timeout: 15000 });
    await touch.locator("[data-volley-start]").tap();
    const tapStarted = await touch
      .waitForSelector('[data-volley-phase="in"]', { timeout: 8000 })
      .then(() => true, () => false);
    await touch.waitForTimeout(700);
    const court = await touch.locator("[data-landmark=volleyball] img").boundingBox();
    await touch.touchscreen.tap(court.x + court.width * 0.3, court.y + court.height * 0.6);
    const tapScored = await touch
      .waitForSelector('[data-volley-score="1"]', { timeout: 8000 })
      .then(() => true, () => false);
    report(S, "тап: старт и удар по корту", tapStarted && tapScored);
    await touch.close();
  }

  // --- Тёмная тема ---------------------------------------------------------------
  {
    const dark = await openPage(browser, { colorScheme: "dark" });
    await dark.goto(URL_ASSIST, { waitUntil: "networkidle" });
    const lm = dark.locator("[data-landmark=volleyball]");
    await lm.scrollIntoViewIfNeeded();
    await dark.waitForSelector("[data-volley-game]", { timeout: 15000 });
    await dark.waitForTimeout(500);
    const b = await lm.boundingBox();
    const darkClip = { x: b.x - 70, y: b.y - 80, width: b.width + 140, height: b.height + 190 };
    await dark.screenshot({ path: `${OUT}/b6-volleyball-rest-dark.png`, clip: darkClip });
    await dark.locator("[data-volley-start]").click();
    await dark.waitForSelector('[data-volley-phase="in"]', { timeout: 8000 });
    await dark.waitForTimeout(1100);
    await dark.mouse.move(5, 5);
    await dark.screenshot({ path: `${OUT}/b6-volleyball-play-dark.png`, clip: darkClip });
    report(S, "тёмная тема: без ошибок в консоли", dark.errors.length === 0, dark.errors.slice(0, 2).join(" | "));
    await dark.close();
  }

  // --- reduced-motion: статичная площадка, кнопка открывает трофей ---------------
  {
    const calm = await openPage(browser, { reducedMotion: "reduce" });
    const calmScripts = [];
    await calm.goto(URL_PLAIN, { waitUntil: "networkidle" });
    calm.on("request", (r) => r.resourceType() === "script" && calmScripts.push(r.url()));
    const lm = calm.locator("[data-landmark=volleyball]");
    await lm.scrollIntoViewIfNeeded();
    await calm.waitForTimeout(1200);
    const still = await calm.evaluate(async () => {
      const ball = document.querySelector("[data-volley-ball]");
      const a = ball?.getBoundingClientRect();
      await new Promise((r) => setTimeout(r, 500));
      const b = ball?.getBoundingClientRect();
      return {
        game: Boolean(document.querySelector("[data-volley-game]")),
        ball: Boolean(ball),
        still: Boolean(a && b && a.x === b.x && a.y === b.y),
        score: Boolean(document.querySelector("[data-volley-score]")),
      };
    });
    report(S, "reduced-motion: игра не грузится, мяч стоит", !still.game && still.ball && still.still && calmScripts.length === 0, JSON.stringify(still));
    await calm.locator("[data-volley-start]").click();
    const shown = await calm
      .waitForSelector("[data-volley-trophy]", { timeout: 3000 })
      .then(() => true, () => false);
    const text = shown ? await calm.locator("[data-volley-trophy]").innerText() : "";
    const unlocked = await calm.evaluate(() => sessionStorage.getItem("cv-unlocked") ?? "[]");
    report(S, "reduced-motion: кнопка открывает подпись трофея", shown && text.includes(trophySummary("ru")), text.replace(/\s+/g, " ").slice(0, 80));
    report(S, "reduced-motion: ачивка без игры не выдаётся", !unlocked.includes(ACHIEVEMENT), unlocked);
    const b = await lm.boundingBox();
    await calm.mouse.move(5, 5);
    await calm.screenshot({ path: `${OUT}/b6-volleyball-reduced.png`, clip: { x: b.x - 70, y: b.y - 80, width: b.width + 140, height: b.height + 300 } });
    await calm.keyboard.press("Escape");
    await calm.waitForTimeout(300);
    const back = await calm.evaluate(() => ({
      popup: Boolean(document.querySelector("[data-volley-trophy]")),
      focus: document.activeElement?.hasAttribute("data-volley-start") ?? false,
    }));
    report(S, "reduced-motion: Escape закрывает подпись, фокус на кнопке", !back.popup && back.focus, JSON.stringify(back));

    // Английский: кнопка, подписи и трофей без кириллицы и длинных тире
    await calm.evaluate(() => sessionStorage.setItem("cv-lang", "en"));
    await calm.reload({ waitUntil: "networkidle" });
    await calm.locator("[data-landmark=volleyball]").scrollIntoViewIfNeeded();
    await calm.waitForTimeout(400);
    await calm.locator("[data-volley-start]").click();
    await calm.waitForSelector("[data-volley-trophy]", { timeout: 3000 }).catch(() => null);
    const en = await calm.evaluate(() => {
      const root = document.querySelector("[data-landmark=volleyball]");
      const labels = [...root.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label"));
      return [root.innerText, ...labels].join(" | ");
    });
    report(S, "en (reduced): подписи и трофей без кириллицы и тире", en.includes(trophySummary("en").slice(0, 30)) && !CYR.test(en) && !en.includes("—"), en.replace(/\s+/g, " ").slice(0, 120));
    await calm.evaluate(() => sessionStorage.setItem("cv-lang", "ru"));
    report(S, "reduced-motion: без ошибок в консоли", calm.errors.length === 0, calm.errors.slice(0, 2).join(" | "));
    await calm.close();
  }

  // --- Английский в игре: кнопка, подсказка, объявления, трофей ------------------
  {
    const en = await openPage(browser);
    await en.evaluate(() => sessionStorage.setItem("cv-lang", "en"));
    await en.goto(URL_ASSIST, { waitUntil: "networkidle" });
    await en.locator("[data-landmark=volleyball]").scrollIntoViewIfNeeded();
    await en.waitForSelector("[data-volley-game]", { timeout: 15000 });
    const texts = [];
    const grab = async () =>
      texts.push(
        await en.evaluate(() => {
          const root = document.querySelector("[data-landmark=volleyball]");
          const labels = [...root.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label"));
          const live = root.querySelector("[aria-live]")?.textContent ?? "";
          return [root.innerText, live, ...labels].join(" | ");
        }),
      );
    await grab();
    await en.locator("[data-volley-start]").click();
    for (let n = 1; n <= 3; n += 1) {
      await en.waitForSelector('[data-volley-phase="in"]', { timeout: 8000 });
      await grab();
      await en.waitForTimeout(500);
      await en.keyboard.press("Space");
      await en.waitForSelector(`[data-volley-score="${n}"]`, { timeout: 8000 });
      await grab();
    }
    await en.waitForSelector("[data-volley-trophy]", { timeout: 8000 }).catch(() => null);
    await grab();
    const joined = texts.join(" ");
    report(S, "en (игра): кнопки, подсказка, счёт и трофей без кириллицы и тире", /\bplay\b/i.test(joined) && joined.includes(trophySummary("en").slice(0, 30)) && !CYR.test(joined) && !joined.includes("—"), joined.replace(/\s+/g, " ").slice(0, 140));
    await en.evaluate(() => sessionStorage.setItem("cv-lang", "ru"));
    report(S, "en (игра): без ошибок в консоли", en.errors.length === 0, en.errors.slice(0, 2).join(" | "));
    await en.close();
  }
}
