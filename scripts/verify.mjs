#!/usr/bin/env node
/**
 * Автопроверка сайта: поднимает dev-сервер, гоняет проверки в Chromium,
 * складывает скриншоты в .verify/ и падает с кодом 1, если что-то сломано.
 *
 * Это машинный критерий выхода для этапов из docs/этапы.md: пока `npm run verify`
 * красный, этап не закрыт. Каждый новый этап ДОБАВЛЯЕТ сюда свои проверки —
 * старые не удаляем и не смягчаем, иначе регрессии проедут незамеченными.
 *
 *   npm run verify                  все проверки
 *   npm run verify -- --stage=Э1    только проверки этапа Э1
 *   npm run verify -- --url=...     против уже запущенного сервера
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const PORT = argOf("port", "3210");
const BASE = argOf("url", `http://localhost:${PORT}`);
const STAGES = argOf("stage", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = ".verify";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function report(stage, name, ok, detail = "") {
  results.push({ stage, name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${stage}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Проверка запускается, только если её этап попал в фильтр. */
function wanted(stage) {
  return STAGES.length === 0 || STAGES.includes(stage);
}

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  // macOS, Linux (~/.cache) и облачный образ с PLAYWRIGHT_BROWSERS_PATH
  const caches = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), "Library", "Caches", "ms-playwright"),
    join(homedir(), ".cache", "ms-playwright"),
  ].filter(Boolean);
  for (const cache of caches) {
    if (!existsSync(cache)) continue;
    const revisions = readdirSync(cache)
      .filter((d) => d.startsWith("chromium-"))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));

    const candidates = [
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
      "chrome-linux/chrome",
      "chrome-linux64/chrome",
    ];

    for (const rev of revisions) {
      for (const rel of candidates) {
        const full = join(cache, rev, rel);
        if (existsSync(full)) return full;
      }
    }
  }

  const systemChrome =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return existsSync(systemChrome) ? systemChrome : null;
}

async function ping(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await ping(BASE)) {
    console.log(`Использую уже запущенный сервер на ${BASE}\n`);
    return null;
  }

  console.log(`Поднимаю dev-сервер на порту ${PORT}...`);
  const proc = spawn("npx", ["next", "dev", "-p", PORT], {
    stdio: "ignore",
    env: process.env,
  });

  for (let i = 0; i < 120; i += 1) {
    await sleep(1000);
    if (await ping(BASE)) {
      console.log(`Сервер поднялся за ${i + 1} с\n`);
      return proc;
    }
    if (proc.exitCode !== null) break;
  }

  proc.kill("SIGTERM");
  throw new Error("dev-сервер не поднялся за 120 секунд");
}

/** Остановки маршрута берём из конфига, а не хардкодим — конфиг единственный источник правды. */
function routeStopIds() {
  const src = readFileSync("src/lib/route.ts", "utf8");
  // Черновики (`draft: true`) на маршруте не стоят: у них нет ассета, и
  // посетителю плейсхолдер не показывается — в список они не попадают
  return [...src.matchAll(/^\s{2}\{\n\s{4}id:\s*"([^"]+)"([\s\S]*?)^\s{2}\},/gm)]
    .filter((m) => !/^\s{4}draft:\s*true/m.test(m[2]))
    .map((m) => m[1]);
}

/** Id остановок-черновиков: в DOM их быть не должно. */
function draftStopIds() {
  const src = readFileSync("src/lib/route.ts", "utf8");
  return [...src.matchAll(/^\s{2}\{\n\s{4}id:\s*"([^"]+)"([\s\S]*?)^\s{2}\},/gm)]
    .filter((m) => /^\s{4}draft:\s*true/m.test(m[2]))
    .map((m) => m[1]);
}

/** Какая опорная звезда Скорпиона положена остановке с этим индексом. */
function scorpiusAnchorName(index) {
  const src = readFileSync("src/lib/constellations.ts", "utf8");
  const route = JSON.parse(src.match(/SCORPIUS_ROUTE = (\[[^\]]+\])/)[1]);
  const block = src.slice(src.indexOf("export const SCORPIUS"));
  const stars = [...block.slice(0, block.indexOf("links:")).matchAll(/\{\s*ra:[^}]*\}/g)].map(
    (m) => m[0].match(/name:\s*"([^"]+)"/)?.[1] ?? null,
  );
  return stars[route[index]] ?? null;
}

/**
 * Звёзды Скорпиона считаем из файла созвездий: карта обязана рисовать фигуру
 * целиком, а не только те звёзды, на которые пришлись остановки.
 */
function scorpiusStarCount() {
  const src = readFileSync("src/lib/constellations.ts", "utf8");
  const block = src.slice(src.indexOf("export const SCORPIUS"));
  const stars = block.slice(0, block.indexOf("links:"));
  return [...stars.matchAll(/\{\s*ra:/g)].length;
}

/**
 * Текст трофея берём из его файла: деталь на маршруте обязана показывать именно его.
 * Тексты там парой `{ ru, en }`, по одному языку на строку.
 */
function trophySummary(id, lang = "ru") {
  const src = readFileSync("src/lib/trophies.ts", "utf8");
  const match = src.match(
    new RegExp(`id: "${id}"[\\s\\S]{0,600}?summary:\\s*\\{[\\s\\S]{0,400}?${lang}:\\s*"([^"]+)"`),
  );
  if (!match) throw new Error(`Не нашёл summary (${lang}) трофея «${id}» в src/lib/trophies.ts`);
  return match[1];
}

/**
 * Дома, у которых есть комната, читаем из контентной модели: ровно те, что
 * перечислены в `ROOM_STOP_IDS` (`src/lib/rooms.tsx`). Проверяем по ней оба
 * утверждения сразу — и что дом с контентом открывается, и что дом без
 * контента не кликается. Список, переписанный в тест руками, разъедется с
 * кодом на первом же наполненном доме.
 */
function roomStopIds() {
  const src = readFileSync("src/lib/rooms.tsx", "utf8");
  const match = src.match(/ROOM_STOP_IDS\s*=\s*\[([^\]]*)\]/);
  if (!match) throw new Error("Не нашёл ROOM_STOP_IDS в src/lib/rooms.tsx");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

async function openPage(browser, options = {}) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    ...options,
  });

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.errors = errors;

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  return page;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const executablePath = findChromium();
  if (!executablePath) {
    console.error(
      "Не найден Chromium. Укажи путь через CHROME_PATH или установи браузеры Playwright.",
    );
    process.exit(2);
  }

  const server = await ensureServer();
  const browser = await chromium.launch({ executablePath });

  try {
    // --- Э1: каркас маршрута -------------------------------------------------
    if (wanted("Э1")) {
      const page = await openPage(browser);

      report("Э1", "страница рендерится без ошибок в консоли", page.errors.length === 0, page.errors.slice(0, 2).join(" | "));

      const ids = routeStopIds();
      const missing = [];
      for (const id of ids) {
        if ((await page.locator(`[data-stop="${id}"]`).count()) === 0) missing.push(id);
      }
      report("Э1", `все остановки из route.ts в DOM (${ids.length})`, missing.length === 0, missing.join(", "));

      // Тема: класс dark должен появляться и исчезать по клику
      const toggle = page.getByRole("button", { name: /тему/i });
      const initialDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      await toggle.click();
      await page.waitForTimeout(250);
      const afterDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      await toggle.click();
      await page.waitForTimeout(250);
      const backDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      report("Э1", "переключатель темы меняет класс dark в обе стороны", afterDark !== initialDark && backDark === initialDark);

      // Дисплейный шрифт должен доехать до заголовка
      const heroFont = await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily);
      report("Э1", "заголовок набран дисплейным шрифтом", /Unbounded/i.test(heroFont), heroFont);

      // Hero-заголовок не длиннее двух строк на десктопе
      const heroLines = await page.locator("h1").first().evaluate((el) => {
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        return Math.round(el.getBoundingClientRect().height / lh);
      });
      report("Э1", "hero-заголовок не больше 2 строк на 1440", heroLines <= 2, `строк: ${heroLines}`);

      // Окружение: пустота между домами была отдельной претензией владельца,
      // поэтому плотность декора и неба проверяется, а не остаётся на глаз
      const sceneryCount = await page.locator("[data-scenery]").count();
      report("Э1", "окружение расставлено по всему маршруту", sceneryCount >= ids.length * 6, `объектов: ${sceneryCount}`);

      const skyCount = await page.locator("[data-sky]").count();
      report("Э1", "небо заполнено по всей длине маршрута", skyCount >= ids.length * 4, `элементов: ${skyCount}`);

      // Кликабельные детали про владельца (шахматы, волейбол).
      // Подпись обязана совпадать с src/lib/trophies.ts, а не жить своей жизнью:
      // деталь на фоне и полка в доме опыта показывают одно и то же.
      const chessSummary = trophySummary("chess");
      const story = page.getByRole("button", { name: /Шахматы/i });
      await story.click();
      await page.waitForTimeout(350);
      const storyText = await page
        .getByText(chessSummary.slice(0, 40), { exact: false })
        .isVisible();
      report("Э1", "деталь маршрута открывает подпись из файла трофеев", storyText);
      await story.click();
      await page.waitForTimeout(250);

      // Карта маршрута: остановки выстроены созвездием и ведут к своим домам
      const mapStars = await page.locator('nav[aria-label="Карта маршрута"] button').count();
      report("Э1", "на карте маршрута есть все остановки", mapStars === ids.length, `звёзд: ${mapStars}`);

      // Скорпион рисуется целиком: остановок девять, а звёзд в созвездии больше,
      // и недостающие нельзя дорисовывать — они остаются звёздами фона
      const mapStarsTotal = await page
        .locator('nav[aria-label="Карта маршрута"] [data-star]')
        .count();
      report(
        "Э1",
        "созвездие карты нарисовано целиком",
        mapStarsTotal === scorpiusStarCount(),
        `звёзд на карте: ${mapStarsTotal}, в созвездии: ${scorpiusStarCount()}`,
      );

      // Опорные звёзды маршрута: середина приходится на Антарес, а последняя
      // остановка — на той звезде, что положена ей по SCORPIUS_ROUTE (пока
      // остановок было девять, это было жало; с черновиком развилки их восемь)
      const anchorNames = await page
        .locator('nav[aria-label="Карта маршрута"] button[data-star]')
        .evaluateAll((els) => els.map((el) => el.dataset.star));
      const expectedLast = scorpiusAnchorName(ids.length - 1);
      report(
        "Э1",
        "пятая остановка стоит на Антаресе, последняя — на своей опорной звезде",
        anchorNames[4] === "Антарес" && anchorNames.at(-1) === expectedLast,
        `${anchorNames[4]} … ${anchorNames.at(-1)} (ожидалась ${expectedLast})`,
      );

      // Проекция могла схлопнуться: тогда звёзды сели бы друг на друга
      const tightest = await page
        .locator('nav[aria-label="Карта маршрута"] [data-star]')
        .evaluateAll((els) => {
          const points = els.map((el) => {
            const r = el.getBoundingClientRect();
            return [r.x + r.width / 2, r.y + r.height / 2];
          });
          let min = Infinity;
          for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) {
              min = Math.min(min, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
            }
          }
          return Math.round(min);
        });
      report("Э1", "звёзды карты не слипаются", tightest >= 10, `ближайшая пара: ${tightest}px`);

      await page.locator('nav[aria-label="Карта маршрута"] button').nth(4).click();
      await page.waitForTimeout(1400);
      const jumped = await page.locator(`[data-stop="${ids[4]}"]`).isVisible();
      report("Э1", "клик по звезде карты уводит к её остановке", jumped);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(900);

      // Проверки земли (газоны, озёра) сняты 11.09.2026 по решению владельца:
      // CSS-земля убрана, зелень и вода придут его ассетами

      // Светило в углу неба
      report("Э1", "светило неба на месте", (await page.locator("[data-sky-body]").count()) === 1);

      // Светило закрывали с двух сторон: декор ехал поверх него (он лежит по
      // всей длине маршрута и на любом скролле проезжает через закреплённый
      // угол), а справа на него ложилась карта маршрута с подписями остановок
      const sky = await page.evaluate(() => {
        const body = document.querySelector("[data-sky-body]");
        const scenery = document.querySelector("[data-scenery]")?.parentElement;
        const stopText = document.querySelector("[data-stop] > div:last-child");
        const map = document.querySelector('nav[aria-label="Карта маршрута"]');
        if (!body || !scenery || !stopText || !map) return null;

        const z = (el) => Number.parseInt(getComputedStyle(el).zIndex, 10) || 0;
        const light = body.getBoundingClientRect();
        const rail = map.getBoundingClientRect();
        // Подписи остановок торчат влево от панели карты — колонка шире её самой
        const railLeft = rail.left - 170;

        return {
          zBody: z(body),
          zScenery: z(scenery),
          zText: z(stopText),
          overlapsRail:
            light.right > railLeft &&
            light.left < rail.right &&
            light.bottom > rail.top &&
            light.top < rail.bottom,
        };
      });
      report(
        "Э1",
        "светило неба выше декора",
        Boolean(sky) && sky.zBody > sky.zScenery,
        sky ? `z: ${sky.zBody} против ${sky.zScenery}` : "нет узлов",
      );
      report(
        "Э1",
        "текст остановки выше светила",
        Boolean(sky) && sky.zText > sky.zBody,
        sky ? `z: ${sky.zText} против ${sky.zBody}` : "нет узлов",
      );
      report(
        "Э1",
        "светило неба не попадает в колонку карты маршрута",
        Boolean(sky) && !sky.overlapsRail,
      );

      // На курсор реагирует отдельный рой, а не слои декора
      const swarm = await page.evaluate(async () => {
        const layer = document.querySelector("[data-cursor-swarm]");
        if (!layer) return null;
        const dot = layer.firstElementChild;
        const before = getComputedStyle(dot).transform;
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            clientX: 900,
            clientY: 500,
            pointerType: "mouse",
          }),
        );
        await new Promise((r) => setTimeout(r, 900));
        return { before, after: getComputedStyle(dot).transform };
      });
      report("Э1", "за курсором летит рой огоньков", Boolean(swarm) && swarm.before !== swarm.after);

      // Прогресс дорожки должен реагировать на скролл. Пройденная часть рисуется
      // по длине самого пути (`pathLength` в motion → `stroke-dasharray`), а не
      // масштабом полоски, как было до серпантина: у ломаной дороги масштабировать
      // нечего. Проверяем то же самое — что число меняется от скролла
      const dashOf = async () =>
        page.locator("[data-route-progress]").first().evaluate((el) => {
          const cs = getComputedStyle(el);
          return `${cs.strokeDasharray}|${cs.strokeDashoffset}`;
        });
      const progressBefore = await dashOf();
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: "instant" }));
      await page.waitForTimeout(1200);
      const progressAfter = await dashOf();
      report(
        "Э1",
        "прогресс дорожки меняется при скролле",
        progressBefore !== progressAfter,
        `${progressBefore} → ${progressAfter}`,
      );

      // Ждём, пока пружина прогресса успокоится, иначе на скриншоте видна недоигранная анимация
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/light-hero.png` });
      await page.close();

      // Тёмная тема
      const dark = await openPage(browser, { colorScheme: "dark" });
      await dark.screenshot({ path: `${OUT}/dark-hero.png` });
      report("Э1", "тёмная тема рендерится без ошибок", dark.errors.length === 0, dark.errors.slice(0, 2).join(" | "));

      // Созвездия: живут по ходу маршрута и открываются по клику
      const marks = dark.getByRole("button", { name: /Созвездие/ });
      const marksCount = await marks.count();
      report("Э1", "созвездия расставлены по маршруту", marksCount >= 6, `созвездий: ${marksCount}`);

      // Фигуры считаются проекцией настоящих координат: если она схлопнется,
      // созвездие превратится в кучку точек в углу окна
      const shapes = await dark.locator("[data-constellation]").evaluateAll((els) =>
        els.map((el) => {
          const svg = el.querySelector("svg");
          const box = svg.viewBox.baseVal;
          const points = [...svg.querySelectorAll("circle")].map((c) => [
            c.cx.baseVal.value,
            c.cy.baseVal.value,
          ]);
          const xs = points.map((p) => p[0]);
          const ys = points.map((p) => p[1]);
          let closest = Infinity;
          for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) {
              closest = Math.min(
                closest,
                Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]),
              );
            }
          }
          return {
            id: el.dataset.constellation,
            stars: points.length,
            fill: Math.max(
              (Math.max(...xs) - Math.min(...xs)) / box.width,
              (Math.max(...ys) - Math.min(...ys)) / box.height,
            ),
            closest,
          };
        }),
      );
      const cramped = shapes.filter((s) => s.fill < 0.75);
      report(
        "Э1",
        "созвездия маршрута заполняют своё окно",
        cramped.length === 0,
        cramped.map((s) => `${s.id}: ${s.fill.toFixed(2)}`).join(", "),
      );
      const merged = shapes.filter((s) => s.closest < 4 || s.stars < 4);
      report(
        "Э1",
        "звёзды созвездий различимы поодиночке",
        merged.length === 0,
        merged.map((s) => `${s.id}: ${s.stars} звёзд, ближайшие ${s.closest.toFixed(1)}`).join(", "),
      );

      await marks.first().click();
      await dark.waitForTimeout(400);
      const named = await dark.getByText(/Кассиопея/).first().isVisible();
      const unlocked = await dark.evaluate(() => {
        try {
          return JSON.parse(sessionStorage.getItem("cv-unlocked") ?? "[]");
        } catch {
          return [];
        }
      });
      report("Э1", "клик по созвездию называет его", named);
      report(
        "Э1",
        "открытое созвездие запомнено в sessionStorage",
        unlocked.some((id) => id.startsWith("constellation:")),
        unlocked.join(", "),
      );

      await dark.close();

      // Середина маршрута: по одному hero судить нельзя, окружение и промежутки
      // между домами видны только здесь
      for (const scheme of ["light", "dark"]) {
        const mid = await openPage(browser, { colorScheme: scheme });
        await mid.evaluate(() =>
          document.querySelector('[data-stop="experience"]')?.scrollIntoView({ behavior: "instant" }),
        );
        await mid.waitForTimeout(1500);
        await mid.screenshot({ path: `${OUT}/${scheme}-mid.png` });
        await mid.close();
      }

      // Мобильная ширина: горизонтального переполнения быть не должно
      const mobile = await openPage(browser, {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const overflow = await mobile.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      report("Э1", "нет горизонтального переполнения на 390px", overflow <= 1, `перебор: ${overflow}px`);
      await mobile.screenshot({ path: `${OUT}/mobile-hero.png` });
      await mobile.close();

      // Промежуточные ширины: раньше на них смотрели только на глаз, и карта
      // маршрута ложилась звёздами прямо на заголовок остановки. Проверяем то,
      // что лежит ВЫШЕ текста по слоям: фон под текстом дефектом не считается
      for (const [width, height, label] of [
        [768, 1024, "планшет"],
        [1024, 768, "малый ноут"],
        [1280, 720, "ноут"],
        [1440, 900, "десктоп"],
      ]) {
        const view = await openPage(browser, {
          viewport: { width, height },
          colorScheme: "dark",
        });

        const covered = new Set();
        let widest = 0;

        for (const ratio of [0, 0.2, 0.4, 0.6, 0.8]) {
          await view.evaluate((r) => {
            window.scrollTo({ top: document.body.scrollHeight * r, behavior: "instant" });
          }, ratio);
          await view.waitForTimeout(500);

          const hits = await view.evaluate(() => {
            const vh = innerHeight;
            const vw = innerWidth;
            const onScreen = (r) =>
              r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
            const overlap = (a, b) => {
              const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              return w > 0 && h > 0 ? w * h : 0;
            };

            const texts = [
              ...document.querySelectorAll("[data-stop] h1, [data-stop] h2, [data-stop] p"),
            ]
              .map((el) => el.getBoundingClientRect())
              .filter(onScreen);

            const layers = {
              "карта маршрута": 'nav[aria-label="Карта маршрута"] [data-star]',
              созвездие: "[data-constellation] svg",
              площадка: "[data-landmark]",
            };

            const found = [];
            for (const [name, selector] of Object.entries(layers)) {
              for (const el of document.querySelectorAll(selector)) {
                const r = el.getBoundingClientRect();
                if (!onScreen(r)) continue;
                if (texts.some((t) => overlap(r, t) > 200)) found.push(name);
              }
            }

            return {
              found,
              overflow: document.documentElement.scrollWidth - vw,
            };
          });

          hits.found.forEach((name) => covered.add(name));
          widest = Math.max(widest, hits.overflow);
        }

        report(
          "Э1",
          `${label} ${width}×${height}: ничто не закрывает текст остановки`,
          covered.size === 0,
          [...covered].join(", "),
        );
        report(
          "Э1",
          `${label} ${width}×${height}: нет горизонтального переполнения`,
          widest <= 1,
          `перебор: ${widest}px`,
        );

        await view.evaluate(() => {
          window.scrollTo({ top: document.body.scrollHeight * 0.3, behavior: "instant" });
        });
        await view.waitForTimeout(900);
        await view.screenshot({ path: `${OUT}/adaptive-${width}.png` });
        await view.close();
      }

      // prefers-reduced-motion: Lenis обязан быть выключен, контент — на месте
      const reduced = await openPage(browser, { reducedMotion: "reduce" });
      const lenisOff = await reduced.evaluate(() => !document.documentElement.classList.contains("lenis"));
      const stopsVisible = await reduced.locator("[data-stop]").count();
      report("Э1", "reduced-motion: Lenis выключен", lenisOff);
      report("Э1", "reduced-motion: остановки на месте", stopsVisible === routeStopIds().length, `${stopsVisible}`);
      await reduced.screenshot({ path: `${OUT}/reduced-motion.png` });
      await reduced.close();
    }

    // --- Э2: быстрый путь и контентная модель --------------------------------
    if (wanted("Э2")) {
      const ids = routeStopIds();
      const page = await openPage(browser);

      // Быстрый путь: до любого дома один клик, а не девять экранов скролла
      const wrongJumps = [];
      for (const [index, id] of ids.entries()) {
        await page.locator('nav[aria-label="Карта маршрута"] button').nth(index).click();
        await page.waitForTimeout(1300);
        const arrived = await page.locator(`[data-stop="${id}"]`).isVisible();
        if (!arrived) wrongJumps.push(id);
      }
      report(
        "Э2",
        "клик по любой остановке карты уводит к её дому",
        wrongJumps.length === 0,
        wrongJumps.join(", "),
      );

      // Активная остановка обязана совпадать с тем, где мы находимся: сравнение
      // «до и после» ничего не доказывает, если навигация отстаёт на шаг
      const activeAt = async (ratio) => {
        // Колесо прерывает анимацию Lenis: без этого он продолжает ехать к
        // предыдущей цели и измерение ловит вчерашнюю позицию
        await page.mouse.wheel(0, 1);
        await page.waitForTimeout(200);
        await page.evaluate((r) => {
          window.scrollTo({ top: document.body.scrollHeight * r, behavior: "instant" });
        }, ratio);
        await page.waitForTimeout(1600);

        return page.evaluate(() => {
          const stars = [...document.querySelectorAll("nav[aria-label] li button")];
          const active = stars.findIndex((el) => el.getAttribute("aria-current") === "true");

          // Что человек реально видит: остановка, накрывающая центр экрана
          const middle = window.innerHeight / 2;
          const stops = [...document.querySelectorAll("[data-stop]")];
          const onScreen = stops.findIndex((el) => {
            const r = el.getBoundingClientRect();
            return r.top <= middle && r.bottom >= middle;
          });

          return { active, onScreen };
        });
      };

      const marks = [await activeAt(0), await activeAt(0.5), await activeAt(0.98)];
      const drift = marks
        .filter((m) => m.onScreen >= 0)
        .map((m) => Math.abs(m.active - m.onScreen));
      report(
        "Э2",
        "активная остановка совпадает с той, что на экране",
        drift.length > 0 && drift.every((d) => d <= 1),
        marks.map((m) => `${m.active}/${m.onScreen}`).join(", "),
      );

      // Резюме одним файлом. Пока в public лежит заглушка, кнопки быть не
      // должно: пустой PDF у нанимателя хуже, чем отсутствие кнопки (flags.ts)
      const pdfReady = /RESUME_PDF_READY = true/.test(readFileSync("src/lib/flags.ts", "utf8"));
      const pdfLinks = await page.locator("[data-pdf-link]").count();
      if (pdfReady) {
        const pdfHref = await page.locator("[data-pdf-link]").getAttribute("href");
        const pdfResponse = await page.request.get(new URL(pdfHref, BASE).href);
        report(
          "Э2",
          "кнопка PDF ведёт на настоящий файл",
          pdfResponse.ok() && /pdf/.test(pdfResponse.headers()["content-type"] ?? ""),
          `${pdfHref} → ${pdfResponse.status()} ${pdfResponse.headers()["content-type"]}`,
        );
      } else {
        report("Э2", "кнопка PDF скрыта, пока файл — заглушка", pdfLinks === 0, `ссылок: ${pdfLinks}`);
      }

      // Язык: тексты берутся из модели `{ ru, en }`, а не из разметки
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(800);
      const titleRu = await page.locator("[data-stop] h1").first().textContent();
      await page.locator("[data-lang-toggle]").click();
      await page.waitForTimeout(500);

      const afterSwitch = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        title: document.querySelector("[data-stop] h1")?.textContent ?? "",
        cyrillic: [...document.querySelectorAll("[data-stop] h1, [data-stop] h2, [data-stop] p")]
          .map((el) => el.textContent ?? "")
          .filter((text) => /[а-яё]/i.test(text)),
      }));

      report("Э2", "переключатель языка меняет <html lang>", afterSwitch.lang === "en", afterSwitch.lang);
      report(
        "Э2",
        "тексты остановок переключаются на английский",
        afterSwitch.title !== titleRu && afterSwitch.title.length > 0,
        `${titleRu} → ${afterSwitch.title}`,
      );
      report(
        "Э2",
        "в английской версии не осталось захардкоженных русских строк",
        afterSwitch.cyrillic.length === 0,
        afterSwitch.cyrillic.slice(0, 2).join(" | "),
      );

      // Английская типографика: длинные тире заменяются дефисом
      const dashes = await page.evaluate(() =>
        [...document.querySelectorAll("[data-stop] p")].some((el) => el.textContent?.includes("—")),
      );
      report("Э2", "в английской версии нет длинных тире", !dashes);

      await page.locator("[data-lang-toggle]").click();
      await page.waitForTimeout(400);
      const backToRu = await page.evaluate(() => document.documentElement.lang);
      report("Э2", "язык переключается обратно", backToRu === "ru");

      // Клавиатура: до быстрого пути можно дойти табом, фокус видно
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      const keyboard = await page.evaluate(() => {
        const focusable = [...document.querySelectorAll("header button, header a")];
        // Целью раньше была ссылка PDF; пока файл — заглушка, её нет, и
        // клавиатуру проверяем на переключателе языка — он в панели всегда
        const target = focusable.find((el) => el.matches("[data-lang-toggle]"));
        target?.focus();
        const styles = getComputedStyle(target, ":focus-visible");
        return {
          reached: document.activeElement === target,
          outline: styles.outlineStyle !== "none" || styles.outlineWidth !== "0px",
        };
      });
      report("Э2", "панель доступна с клавиатуры, фокус видно", keyboard.reached && keyboard.outline);

      await page.close();

      // Узкий экран: тот же быстрый путь свёрнутым списком
      const mobile = await openPage(browser, {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });

      const collapsed = await mobile.locator("[data-route-menu-item]").count();
      report("Э2", "на 390px список остановок свёрнут", collapsed === 0, `видно пунктов: ${collapsed}`);

      await mobile.locator("[data-route-menu-trigger]").click();
      await mobile.waitForTimeout(400);
      const items = await mobile.locator("[data-route-menu-item]").count();
      const overflowOpen = await mobile.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      report("Э2", "на 390px меню открывает все остановки", items === ids.length, `пунктов: ${items}`);
      report(
        "Э2",
        "открытое меню не создаёт горизонтальной прокрутки",
        overflowOpen <= 1,
        `перебор: ${overflowOpen}px`,
      );
      await mobile.screenshot({ path: `${OUT}/mobile-menu.png` });

      const target = ids[4];
      await mobile.locator(`[data-route-menu-item="${target}"]`).click();
      await mobile.waitForTimeout(1500);
      const jumped = await mobile.locator(`[data-stop="${target}"]`).isVisible();
      const closedAfterJump = await mobile.locator("[data-route-menu-item]").count();
      report("Э2", "на 390px клик по пункту уводит к остановке", jumped);
      report("Э2", "после перехода меню закрывается", closedAfterJump === 0);

      await mobile.close();
    }

    // --- Э3: здания из ассетов владельца -------------------------------------
    if (wanted("Э3")) {
      const page = await openPage(browser);

      // Дома маршрута — картинки владельца, отданные через next/image
      const houses = await page.locator("[data-scene-object] img").evaluateAll((els) =>
        els.map((el) => ({ src: el.getAttribute("src"), alt: el.getAttribute("alt") })),
      );
      report(
        "Э3",
        "дома маршрута рисуются ассетами",
        houses.length >= 6,
        `объектов сцены: ${houses.length}`,
      );
      report(
        "Э3",
        "ассеты идут через оптимизатор картинок",
        houses.every((h) => h.src?.startsWith("/_next/image")),
        houses[0]?.src?.slice(0, 40),
      );
      report(
        "Э3",
        "у каждого дома есть текстовая подпись",
        houses.every((h) => (h.alt ?? "").length > 0),
      );

      // Тень рисуется кодом: запечённая в картинку в тёмной теме читается лужей
      const shadow = await page.evaluate(() => {
        const holder = document.querySelector("[data-scene-object]");
        const layer = holder?.firstElementChild;
        if (!layer) return null;
        const style = getComputedStyle(layer);
        // Тень — радиальный градиент (фильтр blur был дороже на скролле)
        return style.backgroundImage !== "none" ? style.backgroundImage : style.backgroundColor;
      });
      report(
        "Э3",
        "тень под домом рисуется кодом",
        Boolean(shadow) && shadow !== "rgba(0, 0, 0, 0)" && shadow !== "none",
        shadow?.slice(0, 40) ?? "нет слоя",
      );

      // Ленивость: то, что ещё не подъехало к экрану, грузиться не должно
      const lazyStart = await page.evaluate(
        () => [...document.querySelectorAll("[data-scene-object] img")].filter((el) => el.complete && el.naturalWidth > 0).length,
      );
      await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight * 0.85, behavior: "instant" });
      });
      await page.waitForTimeout(2500);
      const lazyEnd = await page.evaluate(
        () => [...document.querySelectorAll("[data-scene-object] img")].filter((el) => el.complete && el.naturalWidth > 0).length,
      );
      report(
        "Э3",
        "картинки домов грузятся по мере подхода, а не все сразу",
        lazyStart < houses.length && lazyEnd > lazyStart,
        `на первом экране ${lazyStart}, после скролла ${lazyEnd} из ${houses.length}`,
      );

      // Доска лежит по центру столешницы: центры считаются по замерам файлов
      // (вершины столешницы и поля клеток), а не по краям картинок
      const chess = await page.evaluate(() => {
        const scene = document.querySelector("[data-chess-scene]");
        const imgs = scene?.querySelectorAll("img");
        if (!imgs || imgs.length < 2) return null;
        const table = imgs[0].getBoundingClientRect();
        const board = imgs[1].getBoundingClientRect();
        const tableCenter = { x: table.left + table.width * (319 / 640), y: table.top + table.height * (179 / 645) };
        const boardCenter = { x: board.left + board.width / 2, y: board.top + board.height * ((21 + 363) / 2 / 424) };
        return { dx: Math.round(boardCenter.x - tableCenter.x), dy: Math.round(boardCenter.y - tableCenter.y) };
      });
      report(
        "Э3",
        "шахматная доска лежит по центру столешницы",
        Boolean(chess) && Math.abs(chess.dx) <= 2 && Math.abs(chess.dy) <= 2,
        chess ? `смещение ${chess.dx}px, ${chess.dy}px` : "сцены нет",
      );

      await page.close();

      // Тёмная тема: ассеты дневные, ночью их перекрашивает фильтр
      const dark = await openPage(browser, { colorScheme: "dark" });
      const filters = await dark.evaluate(() => {
        const art = document.querySelector(".scene-art");
        return art ? getComputedStyle(art).filter : null;
      });
      report(
        "Э3",
        "в тёмной теме ассеты перекрашены, а не оставлены дневными",
        Boolean(filters) && filters !== "none",
        filters ?? "нет ассетов",
      );
      await dark.screenshot({ path: `${OUT}/dark-scene.png` });
      await dark.close();

      // Вес: исходники весят по полтора мегабайта, в сцену идут ужатые копии.
      // Подписка ставится до загрузки — иначе счётчик остаётся нулевым
      const weighed = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      let bytes = 0;
      weighed.on("response", async (res) => {
        if (!/scene|_next\/image/.test(res.url())) return;
        try {
          bytes += (await res.body()).length;
        } catch {
          // ответ мог не долететь — на бюджет это не влияет
        }
      });
      await weighed.goto(BASE, { waitUntil: "networkidle" });
      await weighed.waitForTimeout(2000);
      report(
        "Э3",
        "картинки первого экрана укладываются в бюджет",
        bytes < 900 * 1024,
        `${Math.round(bytes / 1024)} КБ`,
      );
      await weighed.close();
    }

    // --- Критика (22.09.2026): что нашла дизайн-критика и что нельзя вернуть ---
    // Один визуальный язык (без арта кодом), одна нумерация, hero — имя,
    // ничего «недоделанного» на виду, доступность с клавиатуры, статичный режим.
    if (wanted("Критика")) {
      const page = await openPage(browser);

      // Черновики (развилка без ассета) на маршрут не выходят, слова
      // «плейсхолдер» посетитель не видит
      const draftInDom = [];
      for (const id of draftStopIds()) {
        if ((await page.locator(`[data-stop="${id}"]`).count()) > 0) draftInDom.push(id);
      }
      report("Критика", "черновые остановки не рендерятся", draftInDom.length === 0, draftInDom.join(", "));
      const placeholderShown = await page.evaluate(() => /плейсхолдер/i.test(document.body.innerText));
      report("Критика", "плейсхолдер посетителю не показывается", !placeholderShown);

      // Нумерация только в свёрнутом списке узких экранов: ни кикера над
      // заголовком, ни цифр на зарубках дорожки, ни «01» и процента в панели
      const numbering = await page.evaluate(() => {
        const stop = document.querySelector("[data-stop]");
        const heading = stop?.querySelector("h1, h2");
        const marker = stop?.querySelector(":scope > span[aria-hidden]");
        const hud = document.querySelector("header")?.innerText ?? "";
        return {
          kickerBefore: heading?.previousElementSibling !== null,
          markerText: (marker?.textContent ?? "").trim(),
          hudNumber: /\b\d{2}\b/.test(hud),
          hudPercent: /\d+%/.test(hud),
        };
      });
      report("Критика", "над заголовком остановки нет кикера", !numbering.kickerBefore);
      report("Критика", "зарубка на дорожке без номера", numbering.markerText === "", numbering.markerText);
      report(
        "Критика",
        "в панели нет номера остановки и процента",
        !numbering.hudNumber && !numbering.hudPercent,
      );

      // Hero: h1 — имя, заметно крупнее заголовков домов; дисплейный
      // подзаголовок не длиннее двух строк на 1440
      const hero = await page.evaluate(() => {
        const h1 = document.querySelector("[data-stop] h1");
        const h2 = document.querySelector("[data-stop] h2");
        const sub = h1?.nextElementSibling?.nextElementSibling;
        const lines = (el) => {
          const cs = getComputedStyle(el);
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
          return Math.round(el.getBoundingClientRect().height / lh);
        };
        return {
          h1: parseFloat(getComputedStyle(h1).fontSize),
          h2: parseFloat(getComputedStyle(h2).fontSize),
          h1Text: h1?.textContent?.trim(),
          subLines: sub ? lines(sub) : 99,
          subDisplay: sub ? /Unbounded/i.test(getComputedStyle(sub).fontFamily) : false,
        };
      });
      const nameRu = readFileSync("src/lib/content.ts", "utf8").match(/name:\s*\{\s*ru:\s*"([^"]+)"/)[1];
      report("Критика", "hero: h1 — это имя из content.ts", hero.h1Text === nameRu, hero.h1Text);
      report(
        "Критика",
        "hero: имя заметно крупнее заголовка дома",
        hero.h1 >= hero.h2 * 1.6,
        `${hero.h1}px против ${hero.h2}px`,
      );
      report(
        "Критика",
        "hero: дисплейный подзаголовок не больше 2 строк на 1440",
        hero.subDisplay && hero.subLines <= 2,
        `строк: ${hero.subLines}`,
      );

      // Дома не обещают клика до Э5
      const houseCursor = await page
        .locator("[data-scene-object]")
        .first()
        .evaluate((el) => getComputedStyle(el).cursor);
      report("Критика", "дом не показывает курсор-руку", houseCursor !== "pointer", houseCursor);

      // Один визуальный язык: светило — свечение без нарисованного диска,
      // площадка на маршруте одна и собрана из ассетов, стол — деталь, не здание
      const skyGlow = await page.evaluate(() => {
        const body = document.querySelector("[data-sky-body]");
        const visible = body && [...body.children].find((el) => getComputedStyle(el).display !== "none");
        if (!visible) return null;
        return {
          nested: visible.children.length,
          gradient: getComputedStyle(visible).backgroundImage.startsWith("radial-gradient"),
        };
      });
      report(
        "Критика",
        "светило — свечение без нарисованного диска",
        Boolean(skyGlow) && skyGlow.nested === 0 && skyGlow.gradient,
        skyGlow ? `вложенных узлов: ${skyGlow.nested}` : "нет узла",
      );
      // До 29.09.2026 проверка требовала ровно одну площадку — шахматы: корт
      // волейбола был SVG-контуром и его сняли. С ассетом корта площадка
      // вернулась, поэтому инвариант записан по существу, строже прежнего:
      // каждая площадка собрана из ассетов владельца (/scene/), а кодом у неё
      // нарисован разве что мяч (свой SVG с токенами --ball)
      const landmarks = await page.locator("[data-landmark]").evaluateAll((els) =>
        els.map((el) => ({
          kind: el.dataset.landmark,
          art: [...el.querySelectorAll("img")].some((img) => /\/scene\//.test(decodeURIComponent(img.currentSrc || img.src))),
          drawn: [...el.querySelectorAll("svg")].filter(
            (svg) => !svg.querySelector('[fill="var(--color-ball)"]') && !svg.closest("[data-volley-ball]"),
          ).length,
        })),
      );
      report(
        "Критика",
        "на маршруте нет площадок, нарисованных кодом",
        landmarks.length >= 1 &&
          landmarks.some((l) => l.kind === "chess") &&
          landmarks.every((l) => l.art && l.drawn === 0),
        `площадки: ${landmarks.map((l) => `${l.kind}${l.art ? "" : " без ассета"}${l.drawn ? ` +${l.drawn} svg` : ""}`).join(", ") || "нет"}`,
      );
      const tableRatio = await page.evaluate(() => {
        const table = document.querySelector("[data-chess-scene] img")?.getBoundingClientRect();
        const houses = [...document.querySelectorAll("[data-scene-object] img")]
          .map((el) => el.getBoundingClientRect().width)
          .filter((w) => w > 0);
        if (!table || houses.length === 0) return null;
        return table.width / Math.max(...houses);
      });
      report(
        "Критика",
        "шахматный стол меньше половины дома",
        tableRatio !== null && tableRatio < 0.55,
        tableRatio !== null ? `отношение ${tableRatio.toFixed(2)}` : "нет сцены",
      );

      // Всплывашка площадки: Escape закрывает и возвращает фокус, клик мимо закрывает
      const story = page.getByRole("button", { name: /Шахматы/i });
      await story.scrollIntoViewIfNeeded();
      await story.click();
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const escaped = await story.evaluate((el) => ({
        expanded: el.getAttribute("aria-expanded"),
        focused: document.activeElement === el,
      }));
      report(
        "Критика",
        "Escape закрывает подпись площадки и возвращает фокус на кнопку",
        escaped.expanded === "false" && escaped.focused,
      );
      await story.click();
      await page.waitForTimeout(300);
      await page.mouse.click(1000, 450);
      await page.waitForTimeout(300);
      report(
        "Критика",
        "клик мимо подписи площадки закрывает её",
        (await story.getAttribute("aria-expanded")) === "false",
      );

      // Клавиатура: первый таб — ссылка «К маршруту», по фокусу она видна;
      // триггер списка остановок на десктопе скрыт и в таб не попадает.
      // Страница перезагружается: после клика мышью браузер продолжает обход
      // табом от точки клика, а не с начала документа
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      await page.keyboard.press("Tab");
      await page.waitForTimeout(300);
      const skip = await page.evaluate(() => {
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          isSkip: el?.matches("[data-skip-link]"),
          target: el?.getAttribute("href") === "#route" && Boolean(document.getElementById("route")),
          opacity: cs.opacity,
          onScreen: r.top >= 0 && r.bottom > 0,
        };
      });
      report("Критика", "первый таб — ссылка «К маршруту», ведёт на #route", skip.isSkip && skip.target);
      report(
        "Критика",
        "skip-link по фокусу виден поверх панели",
        skip.opacity === "1" && skip.onScreen,
        `opacity ${skip.opacity}`,
      );
      const trigger = await page.evaluate(() => {
        let node = document.querySelector("[data-route-menu-trigger]");
        while (node) {
          if (getComputedStyle(node).display === "none") return "none";
          node = node.parentElement;
        }
        return "visible";
      });
      report("Критика", "триггер списка остановок скрыт на 1440 и не фокусируется", trigger === "none");

      // Поверхности браузера: свой icon.svg, метаданные шаринга, фокус акцентом,
      // color-scheme в согласии с темой, скроллбар тонированный
      const iconHref = await page.evaluate(
        () => document.querySelector('link[rel="icon"]')?.getAttribute("href") ?? "",
      );
      report(
        "Критика",
        "иконка сайта — свой icon.svg, не favicon.ico",
        /^\/icon\.svg/.test(iconHref),
        iconHref || "нет link[rel=icon]",
      );
      const share = await page.evaluate(() => ({
        ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? "",
        ogLocale: document.querySelector('meta[property="og:locale"]')?.content ?? "",
        twitter: document.querySelector('meta[name="twitter:card"]')?.content ?? "",
      }));
      report(
        "Критика",
        "метаданные шаринга: og:title, og:locale, twitter:card",
        // Пока картинки для шеринга не было, верной карточкой была `summary`.
        // Картинка появилась (app/opengraph-image.tsx) — теперь требование
        // строже: крупная карточка, как и в блоке «Шеринг»
        share.ogTitle.length > 0 && share.ogLocale === "ru_RU" && share.twitter === "summary_large_image",
        JSON.stringify(share),
      );
      const focusRing = await page.evaluate(async () => {
        const btn = document.querySelector('button[aria-label="Сменить тему"]');
        btn.focus({ focusVisible: true });
        await new Promise((r) => setTimeout(r, 250));
        const cs = getComputedStyle(btn);
        const probe = document.createElement("span");
        probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
        document.body.appendChild(probe);
        const accentRgb = getComputedStyle(probe).color;
        probe.remove();
        return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, accentRgb };
      });
      report(
        "Критика",
        "фокус на кнопке темы обведён акцентом, не браузерным outline: auto",
        focusRing.style === "solid" && parseFloat(focusRing.width) >= 2 && focusRing.color === focusRing.accentRgb,
        JSON.stringify(focusRing),
      );
      const surfaces = await page.evaluate(() => {
        const html = getComputedStyle(document.documentElement);
        return {
          scheme: html.colorScheme,
          dark: document.documentElement.classList.contains("dark"),
          scrollbar: html.scrollbarWidth,
          scrollbarColor: html.scrollbarColor,
        };
      });
      report("Критика", "color-scheme совпадает с темой", surfaces.scheme === (surfaces.dark ? "dark" : "light"), surfaces.scheme);
      report(
        "Критика",
        "скроллбар тонкий и тонированный",
        surfaces.scrollbar === "thin" && surfaces.scrollbarColor !== "auto",
        surfaces.scrollbarColor,
      );

      // Английский: подпись кнопки темы и подпись площадки берутся из файлов
      // и переключаются вместе с языком, без кириллицы и без длинных тире
      const ruLabel = await page.getByRole("button", { name: /тему/i }).getAttribute("aria-label");
      await page.evaluate(() => sessionStorage.setItem("cv-lang", "en"));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const enLabel = await page
        .locator("button[aria-label]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).find((l) => /theme/i.test(l)) ?? "");
      report(
        "Критика",
        "подпись кнопки темы переключается вместе с языком",
        ruLabel === "Сменить тему" && enLabel === "Switch theme",
        `${ruLabel} / ${enLabel}`,
      );
      const storyEn = page.getByRole("button", { name: /Chess/i });
      await storyEn.scrollIntoViewIfNeeded();
      await storyEn.click();
      await page.waitForTimeout(300);
      const enText = (await page.locator("[data-landmark=chess] p").allTextContents()).join(" ");
      report(
        "Критика",
        "подпись площадки переключается на английский без тире и кириллицы",
        enText.includes(trophySummary("chess", "en").slice(0, 30)) && !/[а-яё]/i.test(enText) && !enText.includes("—"),
        enText.slice(0, 60),
      );
      await page.evaluate(() => sessionStorage.setItem("cv-lang", "ru"));
      await page.close();

      // Статичный режим: облака не складываются в колонну, остановка в кадре
      // стоит без смещения и без fade — контент раскрыт сразу
      const reduced = await openPage(browser, { reducedMotion: "reduce" });
      const cloudXs = await reduced.evaluate(() =>
        [...document.querySelectorAll(".cloud-drift")].slice(0, 12).map((el) => Math.round(el.getBoundingClientRect().left)),
      );
      report(
        "Критика",
        "reduced-motion: облака стоят на разных позициях, а не колонной",
        new Set(cloudXs).size >= 6,
        cloudXs.join(", "),
      );
      await reduced.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.45, behavior: "instant" }));
      await reduced.waitForTimeout(900);
      const inFrame = await reduced.evaluate(() =>
        [...document.querySelectorAll("[data-stop]")]
          .filter((li) => {
            const r = li.getBoundingClientRect();
            return r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5;
          })
          .map((li) => {
            const cs = getComputedStyle(li.querySelector(":scope > div"));
            return { id: li.dataset.stop, transform: cs.transform, opacity: cs.opacity };
          }),
      );
      report(
        "Критика",
        "reduced-motion: остановка в кадре без смещения и раскрыта",
        inFrame.length > 0 && inFrame.every((s) => s.transform === "none" && s.opacity === "1"),
        JSON.stringify(inFrame),
      );
      // Остановки за кадром тоже раскрыты: статичный режим — не «сайт, где всё
      // появляется по скроллу», а страница, которую можно читать сразу
      const offscreenHidden = await reduced.evaluate(() =>
        [...document.querySelectorAll("[data-stop] > div")].filter((el) => getComputedStyle(el).opacity !== "1").length,
      );
      report("Критика", "reduced-motion: все остановки раскрыты без скролла", offscreenHidden === 0, `скрытых: ${offscreenHidden}`);
      await reduced.close();
    }

    // --- Э4: раскладка городка (дорога зигзагом, масштаб домов, непересечение) --
    // Блок написан по двум замечаниям владельца:
    //   «изображения иногда друг на друга заходят» и «дома на маленьких экранах
    //   слишком большие, даже на макбуке».
    // Оба дефекта ловились глазами через раз: они вылезают не на первом экране и
    // не на той ширине, на которой смотрят. Поэтому каждая ширина открывается
    // один раз и с неё собирается всё сразу, а маршрут проезжается насквозь.
    if (wanted("Э4")) {
      // 1280 и 1440 — макбуки, с них и пришла жалоба на размер домов;
      // 1728 — большой монитор, где городок, наоборот, не должен рассыпаться
      // на мелочь; 390–1024 держат мобильный и планшетный край.
      //
      // Третье число — какую долю ширины окна дому разрешено занимать. От 1024
      // это 34%: там у колонки есть поля, и дом шире трети превращает остановку
      // в обложку. Ниже 1024 колонка идёт во всю ширину экрана, боковых полей
      // нет вовсе, и та же треть дала бы на телефоне картинку в 133px — дом
      // перестал бы читаться. Там потолок шире, но всё равно не «пол-экрана»:
      // ориентир по замерам — 240–280px на 390 и 260–290px на 768
      const TOWN_VIEWS = [
        [390, 844, 0.78],
        [768, 1024, 0.42],
        [1024, 768, 0.34],
        [1280, 720, 0.34],
        [1440, 900, 0.34],
        [1728, 1080, 0.34],
      ];
      // Проезд по всему маршруту: дома и декор разложены по всей его длине, и
      // заезжают друг на друга обычно где-то в середине, а не на первом экране
      const TOWN_RATIOS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
      // У PNG/WebP с альфой прозрачная рамка шире самого рисунка, поэтому
      // касание рамками — норма. Дефект — когда картинки реально заходят друг
      // на друга, отсюда порог долей площади меньшей из пары, а не ноль
      const OVERLAP_LIMIT = 0.12;

      // Урна приезжает отдельным ассетом и расставляется по карте города;
      // на узких ширинах декора нет вовсе, поэтому наличие копим по всем
      const binsByWidth = [];

      for (const [width, height, maxShare] of TOWN_VIEWS) {
        const view = await openPage(browser, {
          viewport: { width, height },
          isMobile: width <= 430,
          hasTouch: width <= 430,
        });

        // Дорога: меряется один раз, её геометрия от скролла не зависит
        const road = await view.evaluate(() => {
          const route = document.getElementById("route");
          const parts = [...document.querySelectorAll("[data-road]")];
          if (!route || parts.length === 0) return { present: false };

          // Дорога может быть и одним полотном, и лентой по сегментам —
          // считаем объединение, чтобы контракт не диктовал число узлов
          let top = Infinity;
          let bottom = -Infinity;
          let left = Infinity;
          let right = -Infinity;
          let withPath = 0;

          for (const part of parts) {
            const box = part.getBoundingClientRect();
            top = Math.min(top, box.top);
            bottom = Math.max(bottom, box.bottom);

            // Горизонтальную протяжённость меряем по самой линии, а не по
            // рамке svg: растянутая на всю ширину рамка ничего не доказывает,
            // внутри неё может лежать прямая вертикальная полоса
            const paths = part.matches("path") ? [part] : [...part.querySelectorAll("path")];
            for (const path of paths) {
              const ctm = typeof path.getScreenCTM === "function" ? path.getScreenCTM() : null;
              if (!ctm || typeof path.getPointAtLength !== "function") continue;
              withPath += 1;
              const total = path.getTotalLength();
              for (let i = 0; i <= 200; i += 1) {
                const point = path.getPointAtLength((total * i) / 200);
                const x = point.x * ctm.a + point.y * ctm.c + ctm.e;
                left = Math.min(left, x);
                right = Math.max(right, x);
              }
            }
          }

          if (withPath === 0) {
            for (const part of parts) {
              const box = part.getBoundingClientRect();
              left = Math.min(left, box.left);
              right = Math.max(right, box.right);
            }
          }

          return {
            present: true,
            withPath,
            routeHeight: Math.round(route.getBoundingClientRect().height),
            roadHeight: Math.round(bottom - top),
            spread: Math.round(right - left),
          };
        });

        // Ниже 768 дорога сжимается к краю экрана, зигзаг там не требуется
        if (width >= 768) {
          report(
            "Э4",
            `${width}px: полотно дороги есть в разметке`,
            road.present,
            road.present ? `линий пути: ${road.withPath}` : "нет элемента [data-road]",
          );
          report(
            "Э4",
            `${width}px: дорога тянется на всю длину маршрута`,
            road.present && road.roadHeight >= road.routeHeight * 0.9,
            road.present ? `дорога ${road.roadHeight}px из ${road.routeHeight}px маршрута` : "",
          );
          report(
            "Э4",
            `${width}px: дорога идёт зигзагом, а не прямой полосой`,
            road.present && road.spread >= width * 0.2,
            road.present ? `размах по горизонтали ${road.spread}px, нужно ≥ ${Math.round(width * 0.2)}px` : "",
          );
        }

        const houses = [];
        const collisions = new Set();
        const floating = new Set();
        let overflow = 0;
        let bins = 0;
        let decorSeen = 0;
        let artSeen = 0;

        for (const ratio of TOWN_RATIOS) {
          await view.evaluate((r) => {
            window.scrollTo({ top: document.body.scrollHeight * r, behavior: "instant" });
          }, ratio);
          await view.waitForTimeout(700);

          const frame = await view.evaluate((limit) => {
            const vw = innerWidth;
            const vh = innerHeight;
            const onScreen = (r) =>
              r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
            const nameOf = (el) => {
              if (!el) return "объект";
              const src = decodeURIComponent(el.currentSrc || el.getAttribute("src") || "");
              return src.match(/\/scene\/([\w.-]+)/)?.[1] ?? src.slice(-20);
            };

            const houseBoxes = [...document.querySelectorAll("[data-scene-object] img")]
              .map((el) => el.getBoundingClientRect())
              .filter(onScreen)
              .map((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }));

            // Шахматы выведены из проверки намеренно: фигуры стоят на доске,
            // доска — на столе, пересечение там и есть смысл сцены
            const art = [...document.querySelectorAll("[data-scene-object] img, [data-scenery] img")]
              .filter((el) => !el.closest("[data-chess-scene]"))
              .map((el) => ({ name: nameOf(el), r: el.getBoundingClientRect() }))
              .filter((item) => onScreen(item.r));

            const hits = [];
            for (let i = 0; i < art.length; i += 1) {
              for (let j = i + 1; j < art.length; j += 1) {
                const a = art[i].r;
                const b = art[j].r;
                const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (w <= 0 || h <= 0) continue;
                const share = (w * h) / Math.min(a.width * a.height, b.width * b.height);
                if (share > limit) {
                  hits.push(`${art[i].name} × ${art[j].name} — ${Math.round(share * 100)}%`);
                }
              }
            }

            // Якорь у декора — низ объекта: он обязан стоять на земле внутри
            // маршрута, а не висеть над его началом или свисать под хвост.
            // Заодно ловим объекты, срезанные краем экрана больше чем наполовину
            const route = document.getElementById("route")?.getBoundingClientRect();
            const off = [];
            let decor = 0;
            if (route) {
              for (const el of document.querySelectorAll("[data-scenery]")) {
                const r = el.getBoundingClientRect();
                if (!onScreen(r)) continue;
                decor += 1;
                const label = nameOf(el.querySelector("img"));
                // Смотрим именно нижнюю грань: она и есть точка, которой объект
                // касается земли. Верхушка дерева может уходить выше начала
                // маршрута — это крона, а не «висящий» объект
                if (r.bottom < route.top - 2 || r.bottom > route.bottom + 2) {
                  off.push(`${label}: низ объекта вне маршрута`);
                } else if (Math.min(r.right, vw) - Math.max(r.left, 0) < r.width / 2) {
                  off.push(`${label}: срезан краем окна`);
                }
              }
            }

            return {
              houses: houseBoxes,
              hits,
              off,
              decor,
              art: art.length,
              // Переполнение меряем по документу: именно оно даёт полосу внизу
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              bins: document.querySelectorAll('img[src*="trash-bin"]').length,
            };
          }, OVERLAP_LIMIT);

          houses.push(...frame.houses);
          frame.hits.forEach((hit) => collisions.add(hit));
          frame.off.forEach((item) => floating.add(item));
          overflow = Math.max(overflow, frame.overflow);
          bins = Math.max(bins, frame.bins);
          decorSeen = Math.max(decorSeen, frame.decor);
          artSeen = Math.max(artSeen, frame.art);

          // Кадр из середины маршрута — его потом смотрят глазами
          if (ratio === 0.45) await view.screenshot({ path: `${OUT}/town-${width}.png` });
        }

        binsByWidth.push(`${width}: ${bins}`);

        const widths = houses.map((h) => h.w);
        const maxWidth = widths.length > 0 ? Math.max(...widths) : 0;
        const minWidth = widths.length > 0 ? Math.min(...widths) : 0;
        const maxHeight = houses.length > 0 ? Math.max(...houses.map((h) => h.h)) : 0;

        // Главная жалоба: дом занимает пол-экрана и превращает остановку в
        // обложку. Ограничение двойное — по ширине окна и по его высоте:
        // на низком ноуте (1280×720) дом упирался именно в высоту
        report(
          "Э4",
          `${width}px: дом не распирает экран`,
          houses.length > 0 && maxWidth <= width * maxShare && maxHeight <= height * 0.48,
          `самый крупный ${maxWidth}×${maxHeight}px, предел ${Math.round(width * maxShare)}×${Math.round(height * 0.48)}px`,
        );
        // Обратный край: «уменьшили» не должно превратиться в «потеряли»
        report(
          "Э4",
          `${width}px: дом не измельчал`,
          houses.length > 0 && minWidth >= width * 0.15,
          `самый мелкий ${minWidth}px, минимум ${Math.round(width * 0.15)}px (всего домов в кадрах: ${houses.length})`,
        );
        report(
          "Э4",
          `${width}px: картинки сцены не налезают друг на друга`,
          collisions.size === 0,
          collisions.size === 0
            ? `картинок в кадрах: ${artSeen}`
            : [...collisions].slice(0, 4).join("; ") + (collisions.size > 4 ? ` … всего ${collisions.size}` : ""),
        );
        report(
          "Э4",
          `${width}px: декор стоит на земле и не срезан краем`,
          floating.size === 0,
          floating.size === 0
            ? `объектов в кадрах: ${decorSeen}`
            : [...floating].slice(0, 3).join("; ") + (floating.size > 3 ? ` … всего ${floating.size}` : ""),
        );
        report(
          "Э4",
          `${width}px: нет горизонтальной прокрутки`,
          overflow <= 1,
          `перебор: ${overflow}px`,
        );

        await view.close();
      }

      // Пройденная часть дороги обязана быть ВИДНОЙ, а не просто присутствовать
      // в разметке. Грабли: у полотна стоит `vector-effect: non-scaling-stroke`,
      // и с ним браузер считает `stroke-dasharray` в экранных пикселях, переставая
      // нормировать его по `pathLength="1"`. Доля 0,24 превращалась в штрих
      // шириной 0,24px — в разметке всё на месте и старая проверка «прогресс
      // меняется» проходила, а на экране прогресса не было вовсе
      {
        const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight * 0.4, behavior: "instant" }));
        await page.waitForTimeout(1600);
        const dash = await page.evaluate(() => {
          const el = [...document.querySelectorAll("[data-route-progress]")].find(
            (node) => node.ownerSVGElement.getBoundingClientRect().width > 0,
          );
          if (!el) return null;
          const [drawn, gap] = getComputedStyle(el).strokeDasharray.split(",").map(parseFloat);
          return { drawn: Math.round(drawn), gap: Math.round(gap) };
        });
        report(
          "Э4",
          "пройденная часть дороги видна на экране, а не схлопнута в микропунктир",
          Boolean(dash) && dash.drawn > 200 && dash.drawn < dash.gap,
          dash ? `штрих ${dash.drawn}px из ${dash.gap}px пути` : "нет видимого пути прогресса",
        );
        await page.close();
      }

      // Урна: ассет приходит отдельно, ставится по карте города. Проверяем и
      // присутствие на маршруте, и то, что файл реально отдаётся сервером —
      // битый путь даёт пустое место, которое на скриншоте не отличить от фона
      const probe = await browser.newPage();
      const binFile = await probe.request.get(new URL("/scene/trash-bin.svg", BASE).href);
      report(
        "Э4",
        "файл урны отдаётся сервером",
        binFile.ok(),
        `/scene/trash-bin.svg → ${binFile.status()}`,
      );
      await probe.close();
      report(
        "Э4",
        "на маршруте стоит хотя бы одна урна",
        binsByWidth.some((row) => !row.endsWith(": 0")),
        `урн по ширинам — ${binsByWidth.join(", ")}`,
      );

      // --- Шаг 3, предпросмотр персонажа (23.09.2026) --------------------------
      // Проверяется посадка: ноги на полотне, он едет с прокруткой, пройденная
      // линия кончается у ног, ниже 768 его нет. С 29.09.2026 он ещё и ходит:
      // проверки ходьбы — блок ниже.
      // Ноги — не низ-середина кадра: с 29.09.2026 у каждой позы своя точка ног
      // стойки (манифест, `feetX`/`feetY`, доли кадра). Берём её из окна кадра в
      // пикселях — так проверка ловит и сдвиг спрайта относительно тела
      const feetManifest = JSON.parse(readFileSync("src/lib/walk-manifest.json", "utf8"));
      const walkerState = (view) =>
        view.evaluate((manifest) => {
          const body = document.querySelector("[data-walker]");
          // Окно кадра видимой позы: картинка внутри — вся полоса кадров, она шире окна
          const frame = [...(body?.querySelectorAll("[data-walker-frame]") ?? [])].find(
            (el) => getComputedStyle(el).visibility === "visible",
          );
          const art = frame?.getBoundingClientRect();
          if (!art || art.width === 0) return { shown: false };
          const anchor = manifest[frame.getAttribute("data-walker-frame")];
          const feet = { x: art.left + art.width * anchor.feetX, y: art.top + art.height * anchor.feetY };
          const svg = document.querySelector("[data-road]");
          const road = svg.querySelector("path");
          const progress = svg.querySelector("[data-route-progress]");
          const ctm = road.getScreenCTM();
          const len = road.getTotalLength();
          // Выборка ленты в экранных координатах: и расстояние от ног до оси,
          // и точка, где кончается штрих пройденного пути
          const dash = parseFloat(progress.style.strokeDasharray) || 0;
          let walkedTo = null;
          let acc = 0;
          let prev = null;
          let nearest = Infinity;
          for (let i = 0; i <= 3000; i += 1) {
            const p = road.getPointAtLength((len * i) / 3000);
            const q = new DOMPoint(p.x, p.y).matrixTransform(ctm);
            if (prev) acc += Math.hypot(q.x - prev.x, q.y - prev.y);
            if (walkedTo === null && acc >= dash) walkedTo = q;
            nearest = Math.min(nearest, Math.hypot(q.x - feet.x, q.y - feet.y));
            prev = q;
          }
          // Половина ширины полотна на экране: толщина штриха главной ленты
          const halfRoad = parseFloat(getComputedStyle(svg.querySelectorAll("path")[3]).strokeWidth) / 2;
          return {
            shown: true,
            feet,
            nearest: Math.round(nearest),
            halfRoad: Math.round(halfRoad),
            walkedGap: walkedTo ? Math.round(Math.hypot(walkedTo.x - feet.x, walkedTo.y - feet.y)) : null,
            height: Math.round(art.height),
          };
        }, feetManifest);
      for (const [width, height] of [
        [768, 1024],
        [1440, 900],
      ]) {
        const view = await openPage(browser, { viewport: { width, height } });
        await view.mouse.wheel(0, 1);
        await view.waitForTimeout(800);
        const first = await walkerState(view);
        await view.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.37));
        await view.mouse.wheel(0, 1);
        await view.waitForTimeout(1600);
        const later = await walkerState(view);
        const docFirst = first.feet && first.feet.y;
        report(
          "Э4",
          `${width}px: персонаж стоит ногами на полотне дороги`,
          first.shown && later.shown && first.nearest <= first.halfRoad && later.nearest <= later.halfRoad,
          JSON.stringify({ first, later }),
        );
        report(
          "Э4",
          `${width}px: пройденная часть дороги кончается у ног персонажа`,
          later.walkedGap !== null && later.walkedGap <= 8,
          `зазор ${later.walkedGap}px`,
        );
        report(
          "Э4",
          `${width}px: персонаж остаётся в кадре при прокрутке`,
          later.feet.y > 0 && later.feet.y <= height && Math.abs(later.feet.y - docFirst) < height * 0.2,
          `ноги на ${Math.round(later.feet.y)}px`,
        );
        report("Э4", `${width}px: персонаж без ошибок в консоли`, view.errors.length === 0, view.errors.slice(0, 2).join(" | "));
        await view.close();
      }
      const narrowWalker = await openPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      report("Э4", "390px: персонажа нет (дорога там прямая по кромке)", !(await walkerState(narrowWalker)).shown);
      await narrowWalker.close();

      // --- Шаг 3, ходьба (29.09.2026) ------------------------------------------
      // Ролики владельца нарезаны в полосы кадров (`npm run walk`). Ломаться тут
      // может тихо: полоса не грузится, кадр не меняется, ноги застряли в одной
      // позе, зеркало не срабатывает — на скриншоте всё это выглядит как «стоит».
      const walkManifest = JSON.parse(readFileSync("src/lib/walk-manifest.json", "utf8"));
      const walkProbe = await openPage(browser, { viewport: { width: 1440, height: 900 } });
      for (const pose of ["down", "diag"]) {
        const response = await walkProbe.request.get(`${BASE}${walkManifest[pose].src}`);
        report("Э4", `полоса кадров ходьбы «${pose}» отдаётся сервером`, response.ok(), `${walkManifest[pose].src} → ${response.status()}`);
      }
      const walkFrames = await walkProbe.evaluate(() => {
        const strips = {};
        for (const pose of ["down", "diag"]) {
          const img = document.querySelector(`[data-walker-frame="${pose}"] img`);
          strips[pose] = img ? { natural: img.naturalWidth, height: img.naturalHeight } : null;
        }
        return strips;
      });
      for (const pose of ["down", "diag"]) {
        const { frames, frameWidth, frameHeight } = walkManifest[pose];
        const got = walkFrames[pose];
        report(
          "Э4",
          `полоса «${pose}» загрузилась и сходится с манифестом`,
          Boolean(got) && got.natural === frameWidth * (frames + 1) && got.height === frameHeight,
          got ? `${got.natural}x${got.height}, ждали ${frameWidth * (frames + 1)}x${frameHeight}` : "картинки нет",
        );
      }

      // Поза в данный момент: какая видна, на сколько сдвинута полоса (px), зеркало
      const walkNow = () =>
        walkProbe.evaluate(() => {
          const frames = [...document.querySelectorAll("[data-walker-frame]")];
          const visible = frames.find((el) => getComputedStyle(el).visibility === "visible");
          const strip = visible?.querySelector("img");
          const moved = strip ? new DOMMatrix(getComputedStyle(strip).transform).m41 : 0;
          const flipped = visible?.firstElementChild && getComputedStyle(visible.firstElementChild).transform !== "none";
          return {
            pose: visible?.getAttribute("data-walker-frame") ?? null,
            raw: moved,
            stripWidth: strip ? strip.offsetWidth : 0,
            flipped: Boolean(flipped),
          };
        });
      const frameIndex = (now, pose) => Math.round((-now.raw / now.stripWidth) * (walkManifest[pose].frames + 1));

      // Едем по маршруту мелкими шагами прокрутки и записываем, что видно
      const seen = { poses: new Set(), flipped: false, frames: new Set(), moved: 0 };
      const total = await walkProbe.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      for (let y = 0; y < total; y += 47) {
        await walkProbe.evaluate((to) => window.scrollTo(0, to), y);
        await walkProbe.mouse.wheel(0, 1);
        await walkProbe.waitForTimeout(24);
        const now = await walkNow();
        if (now.pose) {
          seen.poses.add(now.pose);
          seen.frames.add(`${now.pose}:${frameIndex(now, now.pose)}`);
        }
        if (now.pose === "diag" && now.flipped) seen.flipped = true;
      }
      report("Э4", "по маршруту он идёт и прямо, и по диагонали", seen.poses.has("down") && seen.poses.has("diag"), [...seen.poses].join(", "));
      report(
        "Э4",
        "в пути кадры сменяются: не одна и не две позы",
        seen.frames.size >= 20,
        `разных кадров за проезд — ${seen.frames.size}`,
      );
      report("Э4", "на диагонали влево персонаж зеркалится", seen.flipped);

      // Остановился — встал в стойку (последний кадр полосы), а не замер на шаге
      await walkProbe.waitForTimeout(1200);
      const rest = await walkNow();
      report(
        "Э4",
        "остановившись, персонаж встаёт в позу стойки",
        rest.pose !== null && frameIndex(rest, rest.pose) === walkManifest[rest.pose].frames,
        `поза ${rest.pose}, кадр ${rest.pose ? frameIndex(rest, rest.pose) : "?"} из ${rest.pose ? walkManifest[rest.pose].frames : "?"}`,
      );
      report("Э4", "ходьба без ошибок в консоли", walkProbe.errors.length === 0, walkProbe.errors.slice(0, 2).join(" | "));
      await walkProbe.screenshot({ path: `${OUT}/walker-standing.png` });
      await walkProbe.close();

      // reduced-motion: не ходит, стоит
      const walkCalm = await openPage(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      const calmFrames = new Set();
      const calmTotal = await walkCalm.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      for (let y = 0; y < calmTotal; y += 400) {
        await walkCalm.evaluate((to) => window.scrollTo(0, to), y);
        await walkCalm.waitForTimeout(40);
        const snapshot = await walkCalm.evaluate(() => {
          const visible = [...document.querySelectorAll("[data-walker-frame]")].find(
            (el) => getComputedStyle(el).visibility === "visible",
          );
          const strip = visible?.querySelector("img");
          return strip
            ? { pose: visible.getAttribute("data-walker-frame"), moved: new DOMMatrix(getComputedStyle(strip).transform).m41, width: strip.offsetWidth }
            : null;
        });
        if (snapshot) {
          calmFrames.add(Math.round((-snapshot.moved / snapshot.width) * (walkManifest[snapshot.pose].frames + 1)) === walkManifest[snapshot.pose].frames);
        }
      }
      report("Э4", "при reduced-motion персонаж не ходит, всегда в стойке", calmFrames.size === 1 && calmFrames.has(true), `${[...calmFrames].join(",")}`);
      await walkCalm.close();
    }

    // --- Э5: интерьер-комната ------------------------------------------------
    // Комната — это модальный слой поверх маршрута, и почти все её дефекты
    // невидимы на скриншоте: фокус, ушедший на маршрут под комнатой, съехавший
    // за время открытия скролл, перспектива, оставшаяся на телефоне. Поэтому
    // блок почти целиком про поведение, а не про картинку.
    //
    // Селекторы — контракт с компонентом комнаты:
    //   [data-room]                    корневой слой открытой комнаты
    //   [data-room-stage]              узел, несущий perspective
    //   [data-room-backdrop]           подложка, клик по которой закрывает
    //   [data-room-close]              кнопка закрытия
    //   [data-room-slot="wall|shelf|slate"]  слоты с контентом
    //   [data-room-trigger="<id>"]     дом-кнопка, открывающая комнату
    if (wanted("Э5")) {
      // Прототип интерьера был спайком под решение по 3D. Решение принято,
      // код переехал в компонент — папка обязана исчезнуть, иначе в проекте
      // навсегда остаётся вторая, неподдерживаемая версия комнаты
      report(
        "Э5",
        "папки src/app/proto в репозитории нет",
        !existsSync("src/app/proto"),
        existsSync("src/app/proto") ? "src/app/proto ещё на месте" : "",
      );

      const withRoom = roomStopIds();
      const withoutRoom = routeStopIds().filter((id) => !withRoom.includes(id));

      /**
       * Контраст считаем сами по формуле WCAG: берём каждый видимый текстовый
       * узел комнаты, цвет текста и реальный фон под ним (ближайшие предки с
       * непрозрачным фоном, сложенные по альфе). Цвета прогоняем через канвас,
       * а не разбираем строку: плоскости комнаты красятся через `color-mix`, и
       * `getComputedStyle` отдаёт их в `oklab` — регуляркой это не разобрать.
       */
      const roomContrast = (view) =>
        view.evaluate(() => {
          const room = document.querySelector("[data-room]");
          if (!room) return null;

          const ctx = document.createElement("canvas").getContext("2d", {
            willReadFrequently: true,
          });
          const rgba = (color) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = "rgba(0, 0, 0, 0)";
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            return [r, g, b, a / 255];
          };
          const over = (top, bottom) =>
            [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));
          const lum = ([r, g, b]) => {
            const ch = [r, g, b].map((v) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
          };
          // Фон под элементом: поднимаемся по предкам, пока не наберём
          // непрозрачный слой, и складываем найденное сверху вниз
          const bgUnder = (el) => {
            const stack = [];
            for (let node = el; node; node = node.parentElement) {
              const color = rgba(getComputedStyle(node).backgroundColor);
              if (color[3] > 0) stack.push(color);
              if (color[3] >= 0.999) break;
            }
            // Низ стопки — холст страницы: если ни один предок не оказался
            // непрозрачным, считаем подложку белой (светлее не бывает)
            let layer = [255, 255, 255];
            for (let i = stack.length - 1; i >= 0; i -= 1) layer = over(stack[i], layer);
            return layer;
          };

          const measured = [];
          const walker = document.createTreeWalker(room, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const text = (node.nodeValue || "").trim();
            if (!text) continue;

            const el = node.parentElement;
            if (!el) continue;
            const box = el.getBoundingClientRect();
            if (box.width < 1 || box.height < 1) continue;

            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || Number(style.opacity) < 0.5) continue;

            const size = parseFloat(style.fontSize);
            const bold = Number(style.fontWeight) >= 700;
            // WCAG AA: обычный текст 4.5:1, крупный (24px или 18.67px жирным) 3:1
            const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;

            const bg = bgUnder(el);
            const fg = over(rgba(style.color), bg);
            const light = lum(fg);
            const dark = lum(bg);
            const ratio =
              (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);

            measured.push({
              text: text.slice(0, 24),
              ratio: Math.round(ratio * 100) / 100,
              need,
            });
          }

          const worst = measured.reduce(
            (acc, item) => (acc === null || item.ratio < acc.ratio ? item : acc),
            null,
          );
          return { count: measured.length, failed: measured.filter((m) => m.ratio < m.need), worst };
        });

      /** Подвести остановку к центру экрана: дом за кадром не кликнуть. */
      const bringUp = async (view, id) => {
        await view.evaluate((stop) => {
          document
            .querySelector(`[data-stop="${stop}"]`)
            ?.scrollIntoView({ block: "center", behavior: "instant" });
        }, id);
        await view.waitForTimeout(700);
      };

      /** Открыть комнату кликом по дому и дождаться анимации входа. */
      const openRoom = async (view, id) => {
        await bringUp(view, id);
        // Кнопок входа у дома две: накладка по клетке городка (от 768px) и сам
        // дом в потоке (узкий экран). В разметке обе, видна одна — кликаем ту,
        // что видит посетитель, иначе на 390px клик уходит в скрытую накладку
        const trigger = view.locator(`[data-room-trigger="${id}"] >> visible=true`);
        if ((await trigger.count()) === 0) return false;
        await trigger.first().click();
        await view.waitForTimeout(900);
        return (await view.locator("[data-room]").count()) > 0;
      };

      const roomGone = async (view) => {
        await view.waitForTimeout(700);
        return (await view.locator("[data-room]").count()) === 0;
      };

      const page = await openPage(browser);

      // 1. Дом с контентом открывается кликом
      const openedBy = [];
      for (const id of withRoom) {
        const ok = await openRoom(page, id);
        openedBy.push(`${id}: ${ok ? "открылась" : "нет"}`);
        if (ok) {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(700);
        }
      }
      report(
        "Э5",
        `комната открывается кликом по дому с контентом (${withRoom.length})`,
        withRoom.length > 0 && openedBy.every((row) => row.endsWith("открылась")),
        openedBy.join(", "),
      );

      // 2. Дом без контента не притворяется кнопкой: ни курсора-руки, ни роли.
      // Обещание клика, за которым ничего нет, — ровно то «недоделанное на
      // виду», которое проект держит вне показа
      const mute = await page.evaluate((ids) => {
        const bad = [];
        for (const id of ids) {
          const stop = document.querySelector(`[data-stop="${id}"]`);
          if (!stop) continue;
          if (stop.querySelector("[data-room-trigger]")) bad.push(`${id}: триггер`);
          const art = stop.querySelector("[data-scene-object]");
          if (!art) continue;
          const clickable = art.closest("button, a, [role='button']");
          if (clickable) bad.push(`${id}: ${clickable.tagName.toLowerCase()}`);
          if (getComputedStyle(art).cursor === "pointer") bad.push(`${id}: курсор-рука`);
        }
        return bad;
      }, withoutRoom);
      report(
        "Э5",
        `дом без контента не кнопка и не показывает курсор-руку (${withoutRoom.length})`,
        mute.length === 0,
        mute.join(", "),
      );

      // 3. И по клику по нему комната не открывается
      let strayRoom = "";
      for (const id of withoutRoom) {
        const art = page.locator(`[data-stop="${id}"] [data-scene-object]`);
        if ((await art.count()) === 0) continue;
        await bringUp(page, id);
        await art.first().click({ force: true });
        await page.waitForTimeout(500);
        if ((await page.locator("[data-room]").count()) > 0) {
          strayRoom = id;
          await page.keyboard.press("Escape");
          await page.waitForTimeout(500);
          break;
        }
      }
      report("Э5", "клик по дому без контента комнату не открывает", strayRoom === "", strayRoom);

      const stopId = withRoom[0];

      // 4. Три способа выйти — три отдельные проверки: в прошлый раз ломался
      // ровно один из них, а общая проверка «закрывается» этого не показала
      const openedForEscape = await openRoom(page, stopId);
      if (openedForEscape) await page.keyboard.press("Escape");
      const byEscape = openedForEscape && (await roomGone(page));
      report("Э5", "комната закрывается по Escape", byEscape, openedForEscape ? "" : "комната не открылась");

      const openedForButton = await openRoom(page, stopId);
      const closeButton = page.locator("[data-room-close]");
      const hasCloseButton = openedForButton && (await closeButton.count()) > 0;
      if (hasCloseButton) await closeButton.first().click();
      const byButton = hasCloseButton && (await roomGone(page));
      report("Э5", "комната закрывается кнопкой закрытия", byButton, hasCloseButton ? "" : "нет [data-room-close]");

      const openedForOutside = await openRoom(page, stopId);
      const backdrop = page.locator("[data-room-backdrop]");
      const hasBackdrop = openedForOutside && (await backdrop.count()) > 0;
      // Клик в угол подложки: середина занята самой комнатой
      if (hasBackdrop) await backdrop.first().click({ position: { x: 6, y: 6 } });
      const byOutside = hasBackdrop && (await roomGone(page));
      report("Э5", "комната закрывается кликом вне", byOutside, hasBackdrop ? "" : "нет [data-room-backdrop]");

      // 5. Фокус-ловушка и возврат фокуса. Без ловушки таб уводит на маршрут
      // под комнатой: человек с клавиатуры оказывается в невидимом слое
      const trapped = await openRoom(page, stopId);
      let escapedAt = null;
      let landedOn = "";
      if (trapped) {
        for (let i = 0; i < 12; i += 1) {
          await page.keyboard.press("Tab");
          const where = await page.evaluate(() => {
            const room = document.querySelector("[data-room]");
            const active = document.activeElement;
            return {
              inside: Boolean(room && active && room.contains(active)),
              tag: active ? active.tagName.toLowerCase() : "нет",
            };
          });
          if (!where.inside && escapedAt === null) {
            escapedAt = i + 1;
            landedOn = where.tag;
          }
        }
      }
      report(
        "Э5",
        "фокус-ловушка: 12 табов не уводят фокус на маршрут",
        trapped && escapedAt === null,
        escapedAt === null ? "" : `ушёл на ${escapedAt}-м табе на <${landedOn}>`,
      );

      // Возврат фокуса именно на дом-триггер: иначе после выхода фокус падает
      // в начало документа и клавиатурный зритель теряет место в маршруте
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
      const focusBack = await page.evaluate((id) => {
        const trigger = document.querySelector(`[data-room-trigger="${id}"]`);
        const active = document.activeElement;
        return {
          ok: Boolean(trigger) && trigger === active,
          active: active ? `${active.tagName.toLowerCase()}${active.dataset?.roomTrigger ? `[${active.dataset.roomTrigger}]` : ""}` : "нет",
        };
      }, stopId);
      report("Э5", "после закрытия фокус вернулся на дом-триггер", focusBack.ok, focusBack.active);

      // 6. Скролл-лок. Маршрут под комнатой не должен ехать от колеса, а после
      // выхода зритель обязан оказаться там же, откуда заходил
      await bringUp(page, stopId);
      const scrollBefore = await page.evaluate(() => Math.round(window.scrollY));
      const openedForScroll = await openRoom(page, stopId);
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(1200);
      const scrollWhileOpen = await page.evaluate(() => Math.round(window.scrollY));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1000);
      const scrollAfter = await page.evaluate(() => Math.round(window.scrollY));
      report(
        "Э5",
        "фон не скроллится, пока комната открыта",
        openedForScroll && Math.abs(scrollWhileOpen - scrollBefore) <= 2,
        `было ${scrollBefore}px, стало ${scrollWhileOpen}px`,
      );
      report(
        "Э5",
        "после закрытия позиция скролла та же",
        openedForScroll && Math.abs(scrollAfter - scrollBefore) <= 2,
        `было ${scrollBefore}px, стало ${scrollAfter}px`,
      );

      // 7. Контент слотов — живой текст в DOM, а не картинка с надписью:
      // его выделяют мышью и читает скринридер (раздел 4.2 концепта)
      const openedForSlots = await openRoom(page, stopId);
      const slots = await page.evaluate(() =>
        [...document.querySelectorAll("[data-room-slot]")].map((el) => ({
          name: el.dataset.roomSlot,
          chars: (el.textContent || "").trim().length,
        })),
      );
      report(
        "Э5",
        "у комнаты есть заполненные слоты",
        openedForSlots && slots.length > 0,
        slots.map((s) => s.name).join(", ") || "слотов нет",
      );
      report(
        "Э5",
        "текст всех непустых слотов лежит в DOM",
        slots.length > 0 && slots.every((s) => s.chars > 0),
        slots.map((s) => `${s.name}: ${s.chars} симв.`).join(", "),
      );
      if (openedForSlots) await page.screenshot({ path: `${OUT}/room-light.png` });

      // 8. Контраст в светлой теме
      const lightContrast = await roomContrast(page);
      report(
        "Э5",
        "контраст текста комнаты проходит AA в светлой теме",
        Boolean(lightContrast) && lightContrast.failed.length === 0,
        lightContrast
          ? lightContrast.failed.length === 0
            ? `узлов: ${lightContrast.count}, худший ${lightContrast.worst?.ratio}:1`
            : lightContrast.failed
                .slice(0, 3)
                .map((f) => `«${f.text}» ${f.ratio}:1 при ${f.need}`)
                .join(", ")
          : "комната не открыта",
      );
      await page.close();

      // 9. Контраст в тёмной теме: палитра там другая, и провалиться легко
      // именно на приглушённом тексте
      const dark = await openPage(browser, { colorScheme: "dark" });
      const darkOpened = await openRoom(dark, stopId);
      if (darkOpened) await dark.screenshot({ path: `${OUT}/room-dark.png` });
      const darkContrast = await roomContrast(dark);
      report(
        "Э5",
        "контраст текста комнаты проходит AA в тёмной теме",
        darkOpened && Boolean(darkContrast) && darkContrast.failed.length === 0,
        darkContrast
          ? darkContrast.failed.length === 0
            ? `узлов: ${darkContrast.count}, худший ${darkContrast.worst?.ratio}:1`
            : darkContrast.failed
                .slice(0, 3)
                .map((f) => `«${f.text}» ${f.ratio}:1 при ${f.need}`)
                .join(", ")
          : "комната не открыта",
      );
      await dark.close();

      // 10. Плоская подача. На 390px и при reduced-motion перспективы быть не
      // должно вовсе: на телефоне повёрнутая плоскость съедает ширину строки,
      // а в статичном режиме 3D-камера — ровно то движение, от которого человек
      // отказался в настройках системы
      const flatViews = [
        ["на 390px", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, `${OUT}/room-390.png`],
        ["при prefers-reduced-motion", { reducedMotion: "reduce" }, `${OUT}/room-reduced.png`],
      ];
      for (const [label, options, shot] of flatViews) {
        const view = await openPage(browser, options);
        const opened = await openRoom(view, stopId);
        if (opened) await view.screenshot({ path: shot });
        const perspective = await view.evaluate(() => {
          const nodes = [
            ...document.querySelectorAll("[data-room], [data-room-stage]"),
          ];
          return nodes.map((el) => ({
            tag: el.dataset.roomStage !== undefined ? "stage" : "room",
            perspective: getComputedStyle(el).perspective,
            transformStyle: getComputedStyle(el).transformStyle,
          }));
        });
        report(
          "Э5",
          `комната отдаётся плоской панелью ${label}`,
          opened &&
            perspective.length > 0 &&
            perspective.every((p) => p.perspective === "none"),
          perspective.map((p) => `${p.tag}: ${p.perspective}`).join(", ") || "комната не открыта",
        );
        await view.close();
      }
    }

    // --- Картинка для шеринга: ссылка на сайт не должна выглядеть голой ------
    if (wanted("Шеринг")) {
      const page = await openPage(browser);

      // Сама картинка: генерируется Next по файловой конвенции, и если satori
      // спотыкается о формат ассета, воркер отдаёт пустой ответ — на глаз это
      // не видно, потому что метатеги при этом на месте
      const image = await page.request.get(new URL("/opengraph-image", BASE).href);
      const type = image.headers()["content-type"] ?? "";
      const bytes = (await image.body()).length;
      report(
        "Шеринг",
        "картинка для шеринга отдаётся и это настоящий PNG",
        image.ok() && /image\/png/.test(type) && bytes > 20 * 1024,
        `${image.status()} ${type}, ${Math.round(bytes / 1024)} КБ`,
      );

      // Заголовок и описание страницы. Грабли: opengraph-image.tsx качал шрифты
      // с Google `await`-ом на уровне модуля, а Next импортирует этот модуль и
      // ради метаданных страницы. Запрос упал — и главная отдалась без <title>
      // и без единого og-тега, хотя сама картинка потом генерировалась
      const head = await page.evaluate(() => ({
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      }));
      report(
        "Шеринг",
        "у страницы есть заголовок и описание",
        head.title.length > 0 && head.description.length > 0,
        head.title || "пустой <title>",
      );
      const ogSource = readFileSync("src/app/opengraph-image.tsx", "utf8");
      report(
        "Шеринг",
        "картинка шеринга не ходит в сеть",
        !/\bfetch\(/.test(ogSource),
        /\bfetch\(/.test(ogSource) ? "в opengraph-image.tsx есть fetch(" : "шрифты и ассеты читаются с диска",
      );

      // Метатеги: без размеров и alt превью в мессенджерах собирается криво
      const tags = await page.evaluate(() => {
        const meta = (selector) => document.querySelector(selector)?.getAttribute("content") ?? "";
        return {
          image: meta('meta[property="og:image"]'),
          width: meta('meta[property="og:image:width"]'),
          height: meta('meta[property="og:image:height"]'),
          alt: meta('meta[property="og:image:alt"]'),
          card: meta('meta[name="twitter:card"]'),
          twitterImage: meta('meta[name="twitter:image"]'),
        };
      });
      const altRu = readFileSync("src/lib/content.ts", "utf8").match(/ogAlt:\s*\{\s*ru:\s*"([^"]+)"/)?.[1] ?? "";
      report(
        "Шеринг",
        "og:image описан размерами и подписью",
        tags.image.length > 0 && tags.width === "1200" && tags.height === "630" && tags.alt === altRu,
        `${tags.width}×${tags.height}, alt: ${tags.alt.slice(0, 40)}`,
      );
      report(
        "Шеринг",
        "карточка twitter крупная и берёт ту же картинку",
        tags.card === "summary_large_image" && tags.twitterImage === tags.image,
        `${tags.card}`,
      );

      // sharp разжимает webp для картинки на сборке: в devDependencies он ломает
      // прод-установку с --omit=dev, и падает именно сборка, а не рантайм
      const pkg = JSON.parse(readFileSync("package.json", "utf8"));
      report(
        "Шеринг",
        "sharp объявлен рабочей зависимостью, а не dev",
        Boolean(pkg.dependencies?.sharp) && !pkg.devDependencies?.sharp,
        `dependencies: ${Boolean(pkg.dependencies?.sharp)}`,
      );

      await page.close();
    }

    // --- Палитра: поиск и прыжок по городу с клавиатуры (⌘K) ------------------
    if (wanted("Палитра")) {
      const S = "Палитра";
      const content = readFileSync("src/lib/content.ts", "utf8");
      const uiRu = (key) => content.match(new RegExp(`${key}:\\s*\\{\\s*ru:\\s*"([^"]+)"`))?.[1] ?? "";
      const stopIds = routeStopIds();

      const isOpen = async (view) => (await view.locator("[data-palette]").count()) > 0;
      const options = (view) =>
        view.$$eval('[data-palette] [role="option"]', (els) =>
          els.map((el) => ({
            id: el.dataset.paletteOption,
            text: el.textContent.toLocaleLowerCase("ru").replace(/ё/g, "е"),
            marks: el.querySelectorAll("[data-palette-match]").length,
          })),
        );
      // Какая команда выбрана — по aria-activedescendant, а не по классу:
      // скринридер видит именно его
      const activeCommand = (view) =>
        view.evaluate(() => {
          const input = document.querySelector("[data-palette-input]");
          const id = input?.getAttribute("aria-activedescendant");
          return id ? (document.getElementById(id)?.dataset.paletteOption ?? null) : null;
        });
      const isDark = (view) => view.evaluate(() => document.documentElement.classList.contains("dark"));

      const page = await openPage(browser);

      // Горячая клавиша: обе раскладки модификатора, повтор закрывает
      await page.keyboard.press("Meta+K");
      await page.waitForTimeout(150);
      const openedMeta = await isOpen(page);
      // Появление авторское: у панели есть анимация (при reduced-motion — нет, ниже)
      const animated = await page.evaluate(
        () => document.querySelector("[data-palette-panel]")?.getAnimations().length ?? 0,
      );
      await page.keyboard.press("Meta+K");
      await page.waitForTimeout(150);
      const closedMeta = !(await isOpen(page));
      await page.keyboard.press("Control+K");
      await page.waitForTimeout(150);
      const openedCtrl = await isOpen(page);
      await page.keyboard.press("Control+K");
      await page.waitForTimeout(150);
      const closedCtrl = !(await isOpen(page));
      report(
        S,
        "⌘K и Ctrl+K открывают палитру, повторное нажатие закрывает",
        openedMeta && closedMeta && openedCtrl && closedCtrl,
        `⌘K ${openedMeta}/${closedMeta}, Ctrl+K ${openedCtrl}/${closedCtrl}`,
      );
      report(S, "у палитры есть появление (анимация на панели)", animated > 0, `анимаций: ${animated}`);

      // Escape и возврат фокуса: открываем с кнопки темы, туда же и вернуться
      await page.getByRole("button", { name: /тему/i }).focus();
      await page.keyboard.press("Control+K");
      await page.waitForTimeout(200);
      const focusInInput = await page.evaluate(() =>
        document.activeElement?.hasAttribute("data-palette-input"),
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const focusBack = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
      report(
        S,
        "фокус в поле при открытии; Escape закрывает и возвращает фокус туда, где он был",
        focusInInput && !(await isOpen(page)) && /тему/i.test(focusBack),
        `в поле: ${focusInInput}, после: «${focusBack}»`,
      );

      // ARIA: combobox + listbox, activedescendant указывает на настоящий option
      await page.keyboard.press("Control+K");
      await page.waitForTimeout(250);
      const aria = await page.evaluate(() => {
        const input = document.querySelector("[data-palette-input]");
        const list = document.getElementById(input?.getAttribute("aria-controls") ?? "");
        const active = document.getElementById(input?.getAttribute("aria-activedescendant") ?? "");
        const dialog = document.querySelector('[data-palette] [role="dialog"]');
        return {
          role: input?.getAttribute("role"),
          expanded: input?.getAttribute("aria-expanded"),
          listRole: list?.getAttribute("role"),
          activeRole: active?.getAttribute("role"),
          activeSelected: active?.getAttribute("aria-selected"),
          activeInList: Boolean(list && active && list.contains(active)),
          selected: document.querySelectorAll('[role="option"][aria-selected="true"]').length,
          modal: dialog?.getAttribute("aria-modal"),
          named: (dialog?.getAttribute("aria-label") ?? "").length > 0,
        };
      });
      report(
        S,
        "ARIA: combobox → listbox, aria-activedescendant указывает на выбранный option",
        aria.role === "combobox" &&
          aria.expanded === "true" &&
          aria.listRole === "listbox" &&
          aria.activeRole === "option" &&
          aria.activeSelected === "true" &&
          aria.activeInList &&
          aria.selected === 1 &&
          aria.modal === "true" &&
          aria.named,
        JSON.stringify(aria),
      );

      // Команды: все остановки из route.ts плюс тема, язык и резюме
      const all = (await options(page)).map((option) => option.id);
      const missingStops = stopIds.filter((id) => !all.includes(`stop-${id}`));
      const missingCommands = ["theme", "lang", "cv"].filter((id) => !all.includes(id));
      report(
        S,
        `в палитре все остановки маршрута (${stopIds.length}) и команды темы, языка и резюме`,
        missingStops.length === 0 && missingCommands.length === 0,
        [...missingStops, ...missingCommands].join(", "),
      );

      // Стрелки зациклены, Home/End — к краям
      const first = await activeCommand(page);
      await page.keyboard.press("ArrowUp");
      const wrappedUp = await activeCommand(page);
      await page.keyboard.press("ArrowDown");
      const wrappedDown = await activeCommand(page);
      await page.keyboard.press("End");
      const atEnd = await activeCommand(page);
      await page.keyboard.press("Home");
      const atHome = await activeCommand(page);
      report(
        S,
        "стрелки зациклены, Home и End ведут к краям списка",
        first === all[0] &&
          wrappedUp === all.at(-1) &&
          wrappedDown === all[0] &&
          atEnd === all.at(-1) &&
          atHome === all[0],
        `${first} ↑${wrappedUp} ↓${wrappedDown} End ${atEnd} Home ${atHome}`,
      );

      // Фокус-ловушка
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      const trapped = await page.evaluate(() => document.activeElement?.hasAttribute("data-palette-input"));
      report(S, "Tab не выводит фокус из палитры", Boolean(trapped));

      // Фон не прокручивается: колесо над завесой
      const scrollBefore = await page.evaluate(() => window.scrollY);
      await page.mouse.move(80, 820);
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(700);
      const scrollAfter = await page.evaluate(() => window.scrollY);
      report(
        S,
        "пока палитра открыта, страница под ней не прокручивается",
        Math.abs(scrollAfter - scrollBefore) < 2 && (await isOpen(page)),
        `${scrollBefore} → ${scrollAfter}`,
      );

      // Фильтр: остаются только совпадения, совпадение подсвечено
      const input = page.locator("[data-palette-input]");
      await input.fill("кейс");
      await page.waitForTimeout(150);
      const filtered = await options(page);
      report(
        S,
        "ввод фильтрует список: остаются только совпадения, найденное подсвечено",
        filtered.length > 0 &&
          filtered.length < all.length &&
          filtered.every((option) => option.text.includes("кейс") && option.marks > 0),
        filtered.map((option) => option.id).join(", "),
      );
      await page.screenshot({ path: `${OUT}/palette-query.png` });

      // Регистр и ё/е: «ТЕМН» находит «тёмную тему»
      await input.fill("ТЕМН");
      await page.waitForTimeout(150);
      const caseless = await options(page);
      report(
        S,
        "поиск не различает регистр и ё/е («ТЕМН» → «тёмную»)",
        caseless.some((option) => option.id === "theme" && option.marks > 0),
        caseless.map((option) => option.id).join(", "),
      );

      // Пустой результат — внятное состояние, а не пустой блок
      await input.fill("жжщщ");
      await page.waitForTimeout(150);
      const empty = await page.evaluate(() => ({
        options: document.querySelectorAll('[data-palette] [role="option"]').length,
        text: document.querySelector("[data-palette-empty]")?.textContent ?? "",
        visible: (document.querySelector("[data-palette-empty]")?.getBoundingClientRect().height ?? 0) > 40,
        active: document.querySelector("[data-palette-input]")?.getAttribute("aria-activedescendant"),
      }));
      report(
        S,
        "пустой результат показывает «ничего не нашлось»",
        empty.options === 0 && empty.visible && empty.text.includes(uiRu("paletteEmpty")) && !empty.active,
        empty.text.slice(0, 60),
      );
      await page.screenshot({ path: `${OUT}/palette-empty.png` });

      // Команда темы с клавиатуры
      const darkBefore = await isDark(page);
      await input.fill("тема");
      await page.waitForTimeout(150);
      const themeFirst = await activeCommand(page);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const darkAfter = await isDark(page);
      report(
        S,
        "команда темы с клавиатуры меняет класс dark",
        themeFirst === "theme" && darkAfter !== darkBefore && !(await isOpen(page)),
        `первая строка: ${themeFirst}, dark ${darkBefore} → ${darkAfter}`,
      );
      // Вернуть тему — через ту же палитру, заодно второй прогон команды
      await page.keyboard.press("Control+K");
      await page.waitForTimeout(200);
      await input.fill("тема");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);

      // Прыжок к остановке: стрелки + Enter
      const targetIndex = Math.min(4, stopIds.length - 1);
      const target = stopIds[targetIndex];
      await page.keyboard.press("Control+K");
      await page.waitForTimeout(200);
      for (let i = 0; i < targetIndex; i += 1) await page.keyboard.press("ArrowDown");
      const chosen = await activeCommand(page);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2600);
      const landed = await page.evaluate((id) => {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        return rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), vh: window.innerHeight } : null;
      }, target);
      report(
        S,
        `стрелки и Enter уводят к остановке «${target}»`,
        chosen === `stop-${target}` &&
          landed !== null &&
          landed.top < landed.vh * 0.4 &&
          landed.bottom > landed.vh * 0.4 &&
          !(await isOpen(page)),
        `выбрана ${chosen}, остановка: ${JSON.stringify(landed)}`,
      );

      // Кнопка в панели обязательна: без неё о палитре узнают только те, кто
      // сам догадался нажать ⌘K. Открывает ту же палитру, что и клавиша
      const trigger = page.locator("[data-palette-trigger] >> visible=true");
      const triggerCount = await trigger.count();
      report(S, "кнопка палитры стоит в панели", triggerCount > 0, `видимых: ${triggerCount}`);
      if (triggerCount > 0) {
        await trigger.first().click();
        await page.waitForTimeout(250);
        const byButton = await isOpen(page);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        const backOnTrigger = await page.evaluate(() =>
          document.activeElement?.hasAttribute("data-palette-trigger"),
        );
        report(
          S,
          "кнопка в панели открывает палитру, фокус возвращается на неё",
          byButton && Boolean(backOnTrigger),
          `открыла: ${byButton}, фокус вернулся: ${backOnTrigger}`,
        );
      }

      // Английский интерфейс: поиск по-русски всё равно работает
      await page.evaluate(() => sessionStorage.setItem("cv-lang", "en"));
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      await page.keyboard.press("Control+K");
      await page.waitForTimeout(250);
      const cyrillicInEnglish = await page.evaluate(() =>
        /[а-яё]/i.test(document.querySelector("[data-palette]")?.textContent ?? "") ||
        /[а-яё]/i.test(document.querySelector("[data-palette-input]")?.placeholder ?? ""),
      );
      report(S, "в английском интерфейсе в палитре нет кириллицы", !cyrillicInEnglish);
      await page.locator("[data-palette-input]").fill("кейсы");
      await page.waitForTimeout(150);
      const crossLang = await page.evaluate(() => {
        const option = document.querySelector('[data-palette-option="stop-cases"]');
        return {
          found: Boolean(option),
          count: document.querySelectorAll('[data-palette] [role="option"]').length,
          alt: option?.querySelector("[data-palette-alt]")?.textContent ?? "",
        };
      });
      report(
        S,
        "при английском интерфейсе находит по-русски («кейсы» → дом кейсов)",
        crossLang.found && crossLang.count === 1 && /кейс/i.test(crossLang.alt),
        JSON.stringify(crossLang),
      );
      await page.evaluate(() => sessionStorage.setItem("cv-lang", "ru"));
      await page.close();

      // 390px: почти во всю ширину, с отступами, без горизонтальной прокрутки
      const mobile = await openPage(browser, {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      await mobile.keyboard.press("Control+K");
      await mobile.waitForTimeout(300);
      const fit = await mobile.evaluate(() => {
        const rect = document.querySelector("[data-palette-panel]")?.getBoundingClientRect();
        return rect
          ? {
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              vw: window.innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
            }
          : null;
      });
      report(
        S,
        "на 390px палитра не шире экрана и держит боковые отступы",
        fit !== null &&
          fit.left >= 8 &&
          fit.right <= fit.vw - 8 &&
          fit.width >= fit.vw - 48 &&
          fit.scrollWidth <= fit.vw,
        JSON.stringify(fit),
      );
      await mobile.screenshot({ path: `${OUT}/palette-mobile.png` });
      await mobile.close();

      // Статичный режим: палитра стоит на месте с первого кадра, прыжок мгновенный
      const calm = await openPage(browser, { reducedMotion: "reduce" });
      await calm.keyboard.press("Control+K");
      const still = await calm.evaluate(() => {
        const panel = document.querySelector("[data-palette-panel]");
        const veil = document.querySelector("[data-palette-veil]");
        return {
          animations: (panel?.getAnimations().length ?? -1) + (veil?.getAnimations().length ?? -1),
          opacity: panel ? getComputedStyle(panel).opacity : null,
          transform: panel ? getComputedStyle(panel).transform : null,
        };
      });
      report(
        S,
        "при reduced-motion палитра открывается без анимации",
        still.animations === 0 && still.opacity === "1" && still.transform === "none",
        JSON.stringify(still),
      );
      const calmTarget = stopIds[Math.min(2, stopIds.length - 1)];
      await calm.locator("[data-palette-input]").fill("");
      for (let i = 0; i < Math.min(2, stopIds.length - 1); i += 1) await calm.keyboard.press("ArrowDown");
      await calm.keyboard.press("Enter");
      await calm.waitForTimeout(300);
      const calmLanded = await calm.evaluate((id) => {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        return rect ? Math.round(rect.top) : null;
      }, calmTarget);
      report(
        S,
        "в статичном режиме прыжок к остановке мгновенный",
        calmLanded !== null && Math.abs(calmLanded) < 4,
        `«${calmTarget}» top ${calmLanded}`,
      );
      await calm.close();
    }

    // --- Коротко: резюме одним экраном (/cv) --------------------------------
    // Быстрый путь для нанимающего: отдельная серверная страница, вход из
    // панели, печать в PDF. Факты — из profile.ts и trophies.ts; раздел без
    // фактов не рендерится вовсе, даже заголовком.
    if (wanted("Коротко")) {
      const cvUrl = new URL("/cv", BASE).href;
      const contentSrc = readFileSync("src/lib/content.ts", "utf8");
      const nameRu = contentSrc.match(/\bname:\s*\{\s*ru:\s*"([^"]+)"/)?.[1] ?? "";
      const trophiesSrc = readFileSync("src/lib/trophies.ts", "utf8");
      const trophyIds = [...trophiesSrc.matchAll(/^\s{4}id:\s*"([^"]+)"/gm)].map((m) => m[1]);

      // 1. Страница отдаётся и называет себя сама, а не заголовком главной
      const page = await openPage(browser);
      const mainTitle = await page.title();
      const response = await page.goto(cvUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const cvTitle = await page.title();
      report(
        "Коротко",
        "/cv отдаёт 200 и имеет свой <title>",
        response?.status() === 200 && cvTitle.length > 0 && cvTitle !== mainTitle,
        `${response?.status()} «${cvTitle}»`,
      );

      // 2. Имя — из content.ts, в h1 страницы
      const h1 = await page.evaluate(() => document.querySelector("[data-cv-page] h1")?.textContent ?? "");
      report("Коротко", "на /cv есть имя из content.ts", nameRu.length > 0 && h1.includes(nameRu), h1 || "нет h1");

      // 3. Образование и награды — тексты из trophies.ts, видимые
      const shown = await page.evaluate(
        (ids) =>
          ids.map((id) => {
            const el = document.querySelector(`[data-cv-trophy="${id}"]`);
            const box = el?.getBoundingClientRect();
            return { id, text: el?.textContent ?? "", visible: Boolean(box && box.height > 0) };
          }),
        trophyIds,
      );
      const trophiesOk =
        trophyIds.length > 0 &&
        shown.every((item) => item.visible && item.text.includes(trophySummary(item.id)));
      report(
        "Коротко",
        "видны образование и награды из trophies.ts",
        trophiesOk,
        shown.map((item) => `${item.id}:${item.visible && item.text.includes(trophySummary(item.id)) ? "ок" : "нет"}`).join(", "),
      );

      // 4. Пустых разделов нет: у каждого заголовка раздела есть содержимое,
      //    и заголовков вне разделов нет вовсе
      const sections = await page.evaluate(() => {
        const main = document.querySelector("[data-cv-page]");
        const list = [...main.querySelectorAll("[data-cv-section]")].map((section) => {
          const body = section.querySelector(":scope > div");
          return {
            id: section.getAttribute("data-cv-section"),
            chars: (body?.innerText ?? "").trim().length,
            height: body?.getBoundingClientRect().height ?? 0,
          };
        });
        return { list, h2: main.querySelectorAll("h2").length };
      });
      report(
        "Коротко",
        "пустые разделы не рендерятся",
        sections.list.length > 0 &&
          sections.h2 === sections.list.length &&
          sections.list.every((s) => s.chars > 0 && s.height > 0),
        sections.list.map((s) => `${s.id}: ${s.chars} симв.`).join(", "),
      );

      // Факты берутся из общей модели: комнаты читают тот же profile.ts
      const roomsSrc = readFileSync("src/lib/rooms.tsx", "utf8");
      const pageSrc = readFileSync("src/app/cv/page.tsx", "utf8");
      report(
        "Коротко",
        "комнаты и /cv читают факты из одного profile.ts",
        /from "@\/lib\/profile"/.test(roomsSrc) && /from "@\/lib\/profile"/.test(pageSrc) && !/route"/.test(pageSrc),
        "rooms.tsx и cv/page.tsx",
      );

      // Карта маршрута и рой здесь не нужны: вели бы в никуда и мешали читать
      const layers = await page.evaluate(() =>
        [...document.querySelectorAll("nav.fixed, [data-cursor-swarm]")].map((el) => getComputedStyle(el).display),
      );
      report("Коротко", "на /cv нет карты маршрута и роя", layers.every((d) => d === "none"), layers.join(", "));

      // 5. Язык: после переключения на странице ни кириллицы, ни длинных тире
      await page.locator("[data-lang-toggle]").click();
      await page.waitForTimeout(300);
      const english = await page.evaluate(() => document.querySelector("[data-cv-page]").innerText);
      const cyr = english.match(/[А-Яа-яЁё]+/g) ?? [];
      report(
        "Коротко",
        "после переключения на английский нет кириллицы и длинных тире",
        cyr.length === 0 && !english.includes("—"),
        cyr.slice(0, 3).join(" ") || "чисто",
      );
      await page.locator("[data-lang-toggle]").click();
      await page.waitForTimeout(200);

      // Обратная дорога: на /cv вместо «CV» стоит «В город»
      const townHref = await page.locator("[data-town-link]").getAttribute("href").catch(() => null);
      report("Коротко", "на /cv есть ссылка обратно в город", townHref === "/", String(townHref));

      // 6. Кнопка в панели главной ведёт на /cv и действительно туда приводит
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const cvHref = await page.locator("[data-hud] [data-cv-link]").getAttribute("href").catch(() => null);
      if (cvHref) {
        await page.locator("[data-hud] [data-cv-link]").click();
        await page.waitForURL(/\/cv$/, { timeout: 5000 }).catch(() => {});
      }
      report(
        "Коротко",
        "кнопка в панели главной ведёт на /cv",
        cvHref === "/cv" && new URL(page.url()).pathname === "/cv",
        `href=${cvHref}, пришли на ${new URL(page.url()).pathname}`,
      );
      await page.close();

      // 7. Узкий экран: панель в одну строку, без прокрутки вбок. Самый тесный
      //    случай — английское имя (оно длиннее); /cv и главная — разный набор кнопок
      for (const width of [360, 390]) {
        for (const path of ["/", "/cv"]) {
          for (const lang of ["ru", "en"]) {
            const narrow = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
            await narrow.addInitScript((l) => sessionStorage.setItem("cv-lang", l), lang);
            await narrow.goto(new URL(path, BASE).href, { waitUntil: "networkidle" });
            await narrow.waitForTimeout(400);
            const hud = await narrow.evaluate(() => {
              const row = document.querySelector("[data-hud] > div.flex");
              const name = row.firstElementChild.firstElementChild;
              const cluster = row.lastElementChild;
              // Только видимые: скрытый на этой ширине элемент (кнопка палитры
              // ниже md) даёт нулевой прямоугольник с top 0 и «выпадал бы из
              // ряда», хотя посетитель его не видит
              const buttons = [...cluster.children]
                .map((el) => el.getBoundingClientRect())
                .filter((r) => r.width > 0 && r.height > 0);
              const nameBox = name.getBoundingClientRect();
              const lineHeight = parseFloat(getComputedStyle(name).lineHeight) || nameBox.height;
              return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                oneRow: buttons.every((b) => Math.abs(b.top - buttons[0].top) < 1),
                nameOneLine: nameBox.height < lineHeight * 1.5,
                gap: cluster.getBoundingClientRect().left - nameBox.right,
                clusterRight: cluster.getBoundingClientRect().right,
              };
            });
            report(
              "Коротко",
              `панель на ${width}px (${path}, ${lang}) в одну строку, без прокрутки вбок`,
              hud.overflow <= 0 && hud.oneRow && hud.nameOneLine && hud.gap >= 4 && hud.clusterRight <= width,
              `вбок ${hud.overflow}px, кнопки в ряд: ${hud.oneRow}, имя в строку: ${hud.nameOneLine}, зазор ${Math.round(hud.gap)}px`,
            );
            if (width === 390 && lang === "ru") {
              await narrow.screenshot({ path: `${OUT}/cv-hud-390${path === "/" ? "-main" : "-cv"}.png`, clip: { x: 0, y: 0, width, height: 72 } });
            }
            await narrow.close();
          }
        }
      }

      // 8. Печать: без панели, белый лист, ничего не вылезает за A4. Тёмная тема —
      //    самый трудный случай: токены должны перекраситься сами
      const print = await browser.newPage({ viewport: { width: 794, height: 1123 }, colorScheme: "dark" });
      await print.goto(cvUrl, { waitUntil: "networkidle" });
      await print.waitForTimeout(400);
      await print.emulateMedia({ media: "print" });
      const printed = await print.evaluate(() => {
        const hud = document.querySelector("[data-hud]");
        const main = document.querySelector("[data-cv-page]");
        const vw = document.documentElement.clientWidth;
        return {
          dark: document.documentElement.classList.contains("dark"),
          hud: hud ? getComputedStyle(hud).display : "нет",
          body: getComputedStyle(document.body).backgroundColor,
          grid: getComputedStyle(main).backgroundImage,
          ink: getComputedStyle(main.querySelector("h1")).color,
          overflow: document.documentElement.scrollWidth - vw,
          cut: [...main.querySelectorAll("[data-cv-section], header")].filter(
            (el) => el.getBoundingClientRect().right > vw + 0.5,
          ).length,
        };
      });
      report("Коротко", "при печати панель скрыта", printed.hud === "none", printed.hud);
      report(
        "Коротко",
        "при печати лист белый, без сетки, текст тёмный — даже из тёмной темы",
        printed.dark && printed.body === "rgb(255, 255, 255)" && printed.grid === "none" && /^rgb\((\d+), (\d+), (\d+)\)$/.test(printed.ink) &&
          printed.ink.match(/\d+/g).slice(0, 3).every((c) => Number(c) < 80),
        `фон ${printed.body}, сетка ${printed.grid}, текст ${printed.ink}, тёмная тема: ${printed.dark}`,
      );
      report(
        "Коротко",
        "при печати ничего не обрезано по ширине A4",
        printed.overflow <= 0 && printed.cut === 0,
        `вбок ${printed.overflow}px, за краем блоков: ${printed.cut}`,
      );
      await print.emulateMedia({ media: "screen" });
      const pdf = await print.pdf({ format: "A4", preferCSSPageSize: true });
      report("Коротко", "резюме печатается в PDF", pdf.length > 10 * 1024, `${Math.round(pdf.length / 1024)} КБ`);
      await print.close();
    }

    // --- Э9: мини-игра «Собери интерфейс» ------------------------------------
    // Критерии — docs/этапы.md, блок Э9. Почти всё здесь — поведение, а не
    // картинка: магнит, возврат, тач, клавиатура, ачивка «один раз», скролл
    // мимо игры. Скриншоты глазами этого не покажут.
    //
    // Селекторы — контракт с src/components/minigame:
    //   [data-minigame]                 корень игры; [data-complete] — собрано
    //   [data-block="<id>"]             блок в лотке (button, card, input, nav)
    //   [data-slot="<id>"]              место в макете; [data-filled] — занято
    //   [data-placed="<id>"]            блок, вставший в слот
    //   [data-dragging]                 блок в руке
    //   [data-minigame-status]          строка состояния (role="status")
    //   [data-minigame-skip]            «Пропустить»
    //   [data-minigame-again]           «Собрать заново» после финала
    //   [data-minigame-achievement]     ачивка — только при первом сборе
    //   [data-minigame-tray] / [data-minigame-layout]  лоток и макет
    if (wanted("Э9")) {
      const S9 = "Э9";
      const ids = routeStopIds();
      const nextStop = ids[ids.indexOf("minigame") + 1];
      const ACH = readFileSync("src/lib/unlocked.ts", "utf8").match(/MINIGAME_ACHIEVEMENT = "([^"]+)"/)?.[1];
      const PIECE_IDS = ["nav", "card", "input", "button"];

      const toGame = async (view) => {
        // Колесо прерывает анимацию Lenis, иначе он доедет до прошлой цели;
        // пауза — чтобы его собственный доезд на 1px кончился до прыжка
        await view.mouse.wheel(0, 1);
        await view.waitForTimeout(300);
        await view.evaluate(() =>
          document.querySelector("[data-minigame]")?.scrollIntoView({ block: "center", behavior: "instant" }),
        );
        await view.waitForTimeout(1300);
      };
      const boxOf = (view, selector) =>
        view.locator(selector).first().evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, w: r.width, h: r.height };
        });
      const mouseDrag = async (view, from, to, steps = 12) => {
        await view.mouse.move(from.x, from.y);
        await view.mouse.down();
        for (let i = 1; i <= steps; i += 1) {
          await view.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
        }
        await view.mouse.up();
      };
      const dragPiece = async (view, piece, slot = piece) =>
        mouseDrag(view, await boxOf(view, `[data-block="${piece}"]`), await boxOf(view, `[data-slot="${slot}"]`));
      const achCount = (view) =>
        view.evaluate((id) => {
          try {
            return JSON.parse(sessionStorage.getItem("cv-unlocked") ?? "[]").filter((x) => x === id).length;
          } catch {
            return -1;
          }
        }, ACH);
      const same = (a, b, tol = 2) =>
        Math.abs(a.left - b.left) <= tol && Math.abs(a.top - b.top) <= tol && Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol;

      report(S9, "id ачивки игры объявлен в src/lib/unlocked.ts", Boolean(ACH), ACH ?? "нет MINIGAME_ACHIEVEMENT");

      // «Пропустить» видна с первого кадра: она есть уже в серверной разметке,
      // а не появляется после гидратации или первого хода
      {
        const probe = await browser.newPage();
        const html = await (await probe.request.get(BASE)).text();
        await probe.close();
        report(
          S9,
          "игра и «Пропустить» есть уже в серверной разметке",
          html.includes("data-minigame-skip") && html.includes('data-block="nav"'),
        );
      }

      // --- Мышь: магнит, правильный слот, неправильный слот, финал, повтор -----
      const page = await openPage(browser);
      await toGame(page);

      const skipShown = await page.locator("[data-minigame-skip]").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && getComputedStyle(el).visibility !== "hidden";
      });
      report(S9, "«Пропустить» видна, как только игра в кадре", skipShown);
      const counts = await page.evaluate(() => ({
        blocks: document.querySelectorAll("[data-minigame] [data-block]").length,
        slots: document.querySelectorAll("[data-minigame] [data-slot]").length,
      }));
      report(S9, "ровно 4 блока и 4 слота", counts.blocks === 4 && counts.slots === 4, JSON.stringify(counts));

      // Правильный слот: блок встаёт и фиксируется ровно по месту
      const navSlot = await boxOf(page, '[data-slot="nav"]');
      await dragPiece(page, "nav");
      const justPlacedAnimated = await page.evaluate(
        () => document.querySelector('[data-placed="nav"]')?.getAnimations().length ?? 0,
      );
      await page.waitForTimeout(700);
      const navPlaced = await page.evaluate(() => ({
        filled: Boolean(document.querySelector('[data-slot="nav"][data-filled]')),
        inTray: document.querySelectorAll('[data-block="nav"]').length,
      }));
      const navBox = await boxOf(page, '[data-placed="nav"]');
      report(
        S9,
        "мышь: правильный слот принимает блок и фиксирует его по месту",
        navPlaced.filled && navPlaced.inTray === 0 && same(navBox, navSlot),
        `занят: ${navPlaced.filled}, в лотке: ${navPlaced.inTray}`,
      );
      report(S9, "блок долетает до слота анимацией", justPlacedAnimated > 0, `анимаций: ${justPlacedAnimated}`);

      // Магнит: отпустили не в слоте, а в 10px за его краем — всё равно встал
      const buttonSlot = await boxOf(page, '[data-slot="button"]');
      const nearby = { x: buttonSlot.left + buttonSlot.w + 10, y: buttonSlot.y };
      await mouseDrag(page, await boxOf(page, '[data-block="button"]'), nearby);
      await page.waitForTimeout(700);
      const snapped = (await page.locator('[data-placed="button"]').count()) === 1;
      report(
        S9,
        "магнит: отпущенный рядом со слотом блок встаёт на место",
        snapped && same(await boxOf(page, '[data-placed="button"]'), buttonSlot),
      );

      // Неправильный слот: блок возвращается туда, откуда его взяли
      const cardHome = await boxOf(page, '[data-block="card"]');
      await dragPiece(page, "card", "input");
      const returning = await page.evaluate(
        () => document.querySelector('[data-block="card"]')?.getAnimations().length ?? 0,
      );
      await page.waitForTimeout(800);
      const cardBack = await boxOf(page, '[data-block="card"]');
      const inputEmpty = (await page.locator('[data-slot="input"][data-filled]').count()) === 0;
      report(
        S9,
        "мышь: неправильный слот возвращает блок на исходное место",
        inputEmpty && same(cardBack, cardHome, 1),
        `было ${Math.round(cardHome.left)},${Math.round(cardHome.top)} → стало ${Math.round(cardBack.left)},${Math.round(cardBack.top)}`,
      );
      report(S9, "возврат в лоток — мягкая анимация, а не прыжок", returning > 0, `анимаций: ${returning}`);
      const wrongText = await page.locator("[data-minigame-status]").textContent();
      report(S9, "неправильный слот объявляется в строке состояния", /Карточка/.test(wrongText ?? ""), wrongText ?? "");

      // Финал: все четыре — реакция и ачивка, записанная в журнал сессии
      const before = await achCount(page);
      await dragPiece(page, "card");
      await page.waitForTimeout(600);
      await dragPiece(page, "input");
      await page.waitForTimeout(1400);
      const final = await page.evaluate(() => ({
        complete: document.querySelector("[data-minigame]")?.hasAttribute("data-complete"),
        badge: Boolean(document.querySelector("[data-minigame-achievement]")),
        status: document.querySelector("[data-minigame-status]")?.textContent ?? "",
      }));
      const afterFirst = await achCount(page);
      report(
        S9,
        "сбор всех четырёх даёт финал и ачивку в sessionStorage",
        final.complete && final.badge && before === 0 && afterFirst === 1,
        `ачивок до: ${before}, после: ${afterFirst}; «${final.status}»`,
      );
      await page.screenshot({ path: `${OUT}/minigame-done.png` });

      // Повторный сбор: реакция есть, второй ачивки нет
      await page.locator("[data-minigame-again]").click();
      await page.waitForTimeout(600);
      const reset = await page.locator("[data-minigame] [data-block]").count();
      for (const id of PIECE_IDS) {
        await dragPiece(page, id);
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(900);
      const again = await page.evaluate(() => ({
        complete: document.querySelector("[data-minigame]")?.hasAttribute("data-complete"),
        badge: document.querySelectorAll("[data-minigame-achievement]").length,
      }));
      const afterSecond = await achCount(page);
      report(
        S9,
        "повторный сбор не выдаёт ачивку второй раз",
        reset === 4 && again.complete && again.badge === 0 && afterSecond === 1,
        `блоков после «заново»: ${reset}, ачивок: ${afterSecond}, значок: ${again.badge}`,
      );

      // Игра не держит маршрут: колесо над ней крутит страницу
      await page.reload({ waitUntil: "networkidle" });
      await toGame(page);
      const trayCenter = await boxOf(page, "[data-minigame-tray]");
      const yBefore = await page.evaluate(() => window.scrollY);
      await page.mouse.move(trayCenter.x, trayCenter.y);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(1200);
      const yAfter = await page.evaluate(() => window.scrollY);
      report(S9, "колесо над игрой крутит маршрут", yAfter - yBefore > 200, `сдвиг ${Math.round(yAfter - yBefore)}px`);

      // «Пропустить» уводит к следующей остановке и уносит туда фокус
      await toGame(page);
      await page.locator("[data-minigame-skip]").click();
      await page.waitForTimeout(1600);
      const skipped = await page.evaluate((id) => {
        const stop = document.querySelector(`[data-stop="${id}"]`);
        const r = stop?.getBoundingClientRect();
        return {
          top: r ? Math.round(r.top) : null,
          focusInside: Boolean(stop?.contains(document.activeElement)),
        };
      }, nextStop);
      report(
        S9,
        `«Пропустить» уводит к следующей остановке (${nextStop})`,
        skipped.top !== null && Math.abs(skipped.top) <= 80 && skipped.focusInside,
        JSON.stringify(skipped),
      );

      // Раскладка: остановка не распухла (маршрут считает остановки равными),
      // игра не на верстаке и не на дороге
      await toGame(page);
      const place = await page.evaluate(() => {
        const stop = document.querySelector('[data-stop="minigame"]');
        const other = document.querySelector('[data-stop="skills"]');
        const game = document.querySelector("[data-minigame]").getBoundingClientRect();
        const house = [...stop.querySelectorAll("[data-scene-object] img")]
          .map((el) => el.getBoundingClientRect())
          .find((r) => r.width > 0);
        const mark = stop.querySelector(".stop-mark").getBoundingClientRect();
        const board = document.querySelector(".minigame-board").getBoundingClientRect();
        const hits = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return {
          stopH: Math.round(stop.getBoundingClientRect().height),
          otherH: Math.round(other.getBoundingClientRect().height),
          onHouse: hits(board, house),
          pastRoad: Math.round(board.right - mark.left),
          gameRight: Math.round(game.right),
        };
      });
      report(
        S9,
        "1440: остановка игры той же высоты, что соседние",
        Math.abs(place.stopH - place.otherH) <= 1,
        `${place.stopH} против ${place.otherH}px`,
      );
      report(S9, "1440: игра не лежит на верстаке", !place.onHouse);
      report(S9, "1440: игра не заезжает на дорогу", place.pastRoad < 0, `до дороги ${-place.pastRoad}px`);
      await toGame(page);
      await page.screenshot({ path: `${OUT}/minigame-1440.png` });
      report(S9, "страница с игрой без ошибок в консоли", page.errors.length === 0, page.errors.slice(0, 2).join(" | "));
      await page.close();

      // --- Клавиатура: без мыши, выбрать блок → выбрать слот --------------------
      const keys = await openPage(browser);
      await toGame(keys);
      const activeIs = (selector) => keys.evaluate((s) => Boolean(document.activeElement?.matches(s)), selector);
      const tabTo = async (selector) => {
        for (let i = 0; i < 14; i += 1) {
          if (await activeIs(selector)) return true;
          await keys.keyboard.press("Tab");
        }
        return activeIs(selector);
      };
      await keys.locator("[data-minigame-skip]").focus();
      await keys.keyboard.press("Tab");
      const firstBlock = await keys.evaluate(() => document.activeElement?.dataset.block ?? null);
      report(S9, "клавиатура: после «Пропустить» Tab ведёт в блоки", Boolean(firstBlock), String(firstBlock));

      // Взять и положить обратно по Escape
      await keys.keyboard.press("Enter");
      const pressed = await keys.evaluate(() => document.activeElement?.getAttribute("aria-pressed"));
      const pickedText = await keys.locator("[data-minigame-status]").textContent();
      await keys.keyboard.press("Escape");
      const released = await keys.evaluate(() => document.activeElement?.getAttribute("aria-pressed"));
      report(
        S9,
        "клавиатура: Enter берёт блок, Escape кладёт обратно, шаг объявляется",
        pressed === "true" && released === "false" && /в руке|picked/i.test(pickedText ?? ""),
        `aria-pressed ${pressed} → ${released}; «${pickedText}»`,
      );
      const live = await keys.locator("[data-minigame-status]").getAttribute("role");
      report(S9, "строка состояния — живой регион (role=status)", live === "status");

      // Неправильное место с клавиатуры: блок остаётся в руке, слот пуст
      const first = firstBlock;
      const wrongSlot = PIECE_IDS.find((id) => id !== first);
      await keys.keyboard.press("Enter");
      await tabTo(`[data-slot="${wrongSlot}"]`);
      await keys.keyboard.press("Enter");
      const kbWrong = await keys.evaluate((id) => ({
        filled: Boolean(document.querySelector(`[data-slot="${id}"][data-filled]`)),
        status: document.querySelector("[data-minigame-status]")?.textContent ?? "",
      }), wrongSlot);
      report(S9, "клавиатура: чужое место блок не принимает", !kbWrong.filled && /не встаёт|doesn't fit/.test(kbWrong.status), kbWrong.status);

      // Сбор целиком: фокус сам переезжает на следующий блок
      let kbOk = true;
      for (let step = 0; step < 4; step += 1) {
        const id = await keys.evaluate(() => document.activeElement?.dataset.block ?? null);
        if (!id) {
          // Первый блок уже в руке после неправильной попытки — берём его
          if (step === 0) {
            await tabTo(`[data-block="${first}"]`);
          } else {
            kbOk = false;
            break;
          }
        }
        const current = id ?? first;
        if (!(await keys.evaluate(() => document.activeElement?.getAttribute("aria-pressed") === "true"))) {
          await keys.keyboard.press("Space");
        }
        if (!(await tabTo(`[data-slot="${current}"]`))) {
          kbOk = false;
          break;
        }
        await keys.keyboard.press("Space");
        await keys.waitForTimeout(500);
      }
      const kbDone = await keys.evaluate(() => ({
        complete: document.querySelector("[data-minigame]")?.hasAttribute("data-complete"),
        focusAgain: Boolean(document.activeElement?.matches("[data-minigame-again]")),
      }));
      report(
        S9,
        "клавиатура собирает игру без мыши, фокус уходит на «Собрать заново»",
        kbOk && kbDone.complete && kbDone.focusAgain,
        JSON.stringify(kbDone),
      );
      await keys.close();

      // --- Тач на 390px: настоящие касания через CDP ---------------------------
      const touch = await openPage(browser, {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await toGame(touch);
      await touch.evaluate(() => {
        window.__mgPointerTypes = [];
        document
          .querySelector("[data-minigame]")
          .addEventListener("pointerdown", (e) => window.__mgPointerTypes.push(e.pointerType), true);
      });
      const cdp = await touch.context().newCDPSession(touch);
      const swipe = async (from, to, steps = 12) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
        for (let i = 1; i <= steps; i += 1) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
          });
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };
      const tNavSlot = await boxOf(touch, '[data-slot="nav"]');
      await swipe(await boxOf(touch, '[data-block="nav"]'), tNavSlot);
      await touch.waitForTimeout(700);
      const tPlaced = (await touch.locator('[data-slot="nav"][data-filled]').count()) === 1;
      const tCardHome = await boxOf(touch, '[data-block="card"]');
      await swipe(tCardHome, await boxOf(touch, '[data-slot="button"]'));
      await touch.waitForTimeout(800);
      const tCardBack = await boxOf(touch, '[data-block="card"]');
      const types = await touch.evaluate(() => window.__mgPointerTypes);
      report(
        S9,
        "тач 390px: перетаскивание пальцем ставит блок в слот",
        tPlaced && same(await boxOf(touch, '[data-placed="nav"]'), tNavSlot),
        `pointerType: ${[...new Set(types)].join(", ") || "нет событий"}`,
      );
      report(S9, "тач 390px: чужой слот возвращает блок", same(tCardBack, tCardHome, 1));
      report(S9, "тач идёт через Pointer Events (pointerType=touch)", types.includes("touch"), types.join(", "));
      report(
        S9,
        "390px: «Пропустить» видна в кадре",
        await touch.locator("[data-minigame-skip]").evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight;
        }),
      );
      await touch.screenshot({ path: `${OUT}/minigame-390.png` });
      await touch.close();

      // --- reduced-motion: та же игра без анимаций -----------------------------
      const still = await openPage(browser, { reducedMotion: "reduce" });
      await toGame(still);
      const animationsNow = () =>
        still.evaluate(() => document.querySelector("[data-minigame]").getAnimations({ subtree: true }).length);
      const stillSlot = await boxOf(still, '[data-slot="nav"]');
      await dragPiece(still, "nav");
      const rmPlacedAnims = await animationsNow();
      const rmPlacedBox = await boxOf(still, '[data-placed="nav"]');
      const rmCardHome = await boxOf(still, '[data-block="card"]');
      await dragPiece(still, "card", "input");
      const rmReturnAnims = await animationsNow();
      const rmCardNow = await boxOf(still, '[data-block="card"]');
      for (const id of ["card", "input", "button"]) await dragPiece(still, id);
      const rmFinalAnims = await animationsNow();
      const rmComplete = await still.evaluate(() => document.querySelector("[data-minigame]")?.hasAttribute("data-complete"));
      report(
        S9,
        "reduced-motion: блок встаёт сразу, без полёта",
        rmPlacedAnims === 0 && same(rmPlacedBox, stillSlot),
        `анимаций: ${rmPlacedAnims}`,
      );
      report(
        S9,
        "reduced-motion: чужой слот возвращает блок сразу, без анимации",
        rmReturnAnims === 0 && same(rmCardNow, rmCardHome, 1),
        `анимаций: ${rmReturnAnims}`,
      );
      report(
        S9,
        "reduced-motion: игра собирается, финал без анимаций",
        rmComplete && rmFinalAnims === 0,
        `собрано: ${rmComplete}, анимаций: ${rmFinalAnims}`,
      );
      await still.close();

      // --- Английский: ни кириллицы, ни длинных тире — и в подписях для скринридера
      const en = await openPage(browser);
      await en.evaluate(() => sessionStorage.setItem("cv-lang", "en"));
      await en.reload({ waitUntil: "networkidle" });
      await en.waitForTimeout(400);
      const enText = await en.evaluate(() => {
        const root = document.querySelector("[data-minigame]");
        const labels = [...root.querySelectorAll("[aria-label]"), root].map((el) => el.getAttribute("aria-label"));
        return [root.textContent ?? "", ...labels].join(" | ");
      });
      report(
        S9,
        "английская версия игры без кириллицы и длинных тире",
        !/[а-яё]/i.test(enText) && !enText.includes("—"),
        enText.match(/[^|]*[а-яё—][^|]*/i)?.[0]?.slice(0, 60) ?? "",
      );
      await en.evaluate(() => sessionStorage.setItem("cv-lang", "ru"));
      await en.close();

      // --- Ширины: без переполнения, игра в своей колонке, остановка не распухла
      for (const [width, height] of [
        [390, 844],
        [768, 1024],
        [1024, 768],
        [1280, 720],
        [1440, 900],
      ]) {
        const view = await openPage(browser, {
          viewport: { width, height },
          isMobile: width <= 430,
          hasTouch: width <= 430,
        });
        await toGame(view);
        const fit = await view.evaluate(() => {
          const game = document.querySelector("[data-minigame]").getBoundingClientRect();
          const board = document.querySelector(".minigame-board").getBoundingClientRect();
          const stop = document.querySelector('[data-stop="minigame"]').getBoundingClientRect();
          const other = document.querySelector('[data-stop="skills"]').getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            inside: board.left >= 0 && board.right <= innerWidth && board.right <= game.right + 1,
            stopH: Math.round(stop.height),
            otherH: Math.round(other.height),
          };
        });
        report(
          S9,
          `${width}px: игра без горизонтального переполнения и в своей колонке`,
          fit.overflow <= 1 && fit.inside,
          `перебор ${fit.overflow}px`,
        );
        // Ниже 768 остановки идут обычным потоком (дом над текстом) и дорога
        // там прямая — равенство высот важно только серпантину
        if (width >= 768) {
          report(
            S9,
            `${width}px: остановка игры не выше соседних`,
            Math.abs(fit.stopH - fit.otherH) <= 1,
            `${fit.stopH} против ${fit.otherH}px`,
          );
        }
        // Строка состояния не меняет высоту от сообщения: иначе колонка
        // перецентрируется и доска прыгает под пальцем
        const statusH = async () =>
          view.locator("[data-minigame-status]").evaluate((el) => Math.round(el.getBoundingClientRect().height));
        const hintH = await statusH();
        const boardTop = (await boxOf(view, ".minigame-board")).top;
        await view.locator('[data-block="input"]').click();
        await view.locator('[data-slot="nav"]').click();
        await view.waitForTimeout(400);
        const wrongH = await statusH();
        const boardTopAfter = (await boxOf(view, ".minigame-board")).top;
        report(
          S9,
          `${width}px: доска не прыгает при смене сообщения`,
          hintH === wrongH && Math.abs(boardTop - boardTopAfter) <= 1,
          `строка ${hintH} → ${wrongH}px, доска сдвинулась на ${Math.round(boardTopAfter - boardTop)}px`,
        );
        await view.close();
      }

      // --- Раунды 2 и 3 (23.09.2026): адаптив и «найди баг» ---------------------
      // Первый раунд проверен выше и не меняется. Здесь — что после его финала
      // есть «Дальше», телефонный раунд собирается в узкую колонку, а в третьем
      // три бага отличаются от эталона и чинятся щелчком.
      const MASTER = readFileSync("src/lib/unlocked.ts", "utf8").match(/MINIGAME_MASTER = "([^"]+)"/)?.[1];
      const masterCount = (view) =>
        view.evaluate((id) => {
          try {
            return JSON.parse(sessionStorage.getItem("cv-unlocked") ?? "[]").filter((x) => x === id).length;
          } catch {
            return -1;
          }
        }, MASTER);
      const levelOf = (view) => view.locator("[data-minigame-layout]").getAttribute("data-level");
      const finishRound = async (view) => {
        for (const id of PIECE_IDS) {
          await dragPiece(view, id);
          await view.waitForTimeout(500);
        }
        await view.waitForTimeout(700);
      };
      const toNext = async (view) => {
        await view.locator("[data-minigame-next]").click();
        await view.waitForTimeout(700);
      };

      const rounds = await openPage(browser);
      await toGame(rounds);
      const boardBefore = await boxOf(rounds, "[data-minigame-layout]");
      await finishRound(rounds);
      report(S9, "раунды: после первого сбора есть «Дальше»", (await rounds.locator("[data-minigame-next]").count()) === 1);
      await toNext(rounds);

      // Раунд 2: телефон
      const phone = await rounds.evaluate(() => {
        const frame = document.querySelector("[data-minigame-phone]")?.getBoundingClientRect();
        const slots = [...document.querySelectorAll("[data-minigame-layout] [data-slot]")].map((el) => el.getBoundingClientRect());
        return {
          frame: Boolean(frame),
          blocks: document.querySelectorAll("[data-minigame] [data-block]").length,
          slots: slots.length,
          inside: Boolean(frame) && slots.every((r) => r.left >= frame.left && r.right <= frame.right && r.top >= frame.top && r.bottom <= frame.bottom),
          column: slots.every((r) => Math.abs(r.left - slots[0].left) < 1 && Math.abs(r.width - slots[0].width) < 1),
          status: document.querySelector("[data-minigame-status]")?.textContent ?? "",
        };
      });
      const boardPhone = await boxOf(rounds, "[data-minigame-layout]");
      report(
        S9,
        "раунд 2: макет — телефон, 4 блока и 4 места одной колонкой внутри корпуса",
        (await levelOf(rounds)) === "1" && phone.frame && phone.blocks === 4 && phone.slots === 4 && phone.inside && phone.column,
        JSON.stringify(phone),
      );
      report(S9, "раунд 2: доска того же размера, что в первом", same(boardBefore, boardPhone, 1));
      await dragPiece(rounds, "input", "button");
      await rounds.waitForTimeout(700);
      report(S9, "раунд 2: чужое место блок не принимает", (await rounds.locator('[data-placed="input"]').count()) === 0);
      const phoneSlot = await boxOf(rounds, '[data-slot="card"]');
      await dragPiece(rounds, "card");
      const phoneFlying = await rounds.evaluate(() => document.querySelector('[data-placed="card"]')?.getAnimations().length ?? 0);
      await rounds.waitForTimeout(600);
      report(
        S9,
        "раунд 2: блок долетает и садится ровно в место телефона",
        phoneFlying > 0 && same(await boxOf(rounds, '[data-placed="card"]'), phoneSlot),
        `анимаций: ${phoneFlying}`,
      );
      for (const id of ["nav", "input", "button"]) {
        await dragPiece(rounds, id);
        await rounds.waitForTimeout(500);
      }
      await rounds.waitForTimeout(700);
      const phoneDone = await rounds.evaluate(() => ({
        complete: document.querySelector("[data-minigame]")?.hasAttribute("data-complete"),
        // Навбар телефона без слов-ссылок: они свернулись в «бургер»
        compactNav: !/кейсы|cases/.test(document.querySelector('[data-placed="nav"]')?.textContent ?? ""),
        // Все лица помещаются в свои места: ничего не вылезло
        fits: [...document.querySelectorAll("[data-placed]")].every((el) => el.scrollHeight <= el.clientHeight + 1),
      }));
      report(S9, "раунд 2: собирается, лица блоков в компактном виде и не вылезают", phoneDone.complete && phoneDone.compactNav && phoneDone.fits, JSON.stringify(phoneDone));
      await rounds.screenshot({ path: `${OUT}/minigame-phone.png` });
      await toNext(rounds);

      // Раунд 3: эталон слева, вёрстка с тремя багами справа
      const bugs = await rounds.evaluate(() => {
        const ref = document.querySelector("[data-minigame-reference]");
        const build = document.querySelector("[data-minigame-layout]");
        const faces = ref ? [...ref.querySelectorAll(":scope > div > div")] : [];
        const targets = [...build.querySelectorAll("[data-bug-target]")];
        const dx = build.getBoundingClientRect().left - ref.getBoundingClientRect().left;
        const dy = build.getBoundingClientRect().top - ref.getBoundingClientRect().top;
        const differs = targets.map((el, i) => {
          const a = el.getBoundingClientRect();
          const b = faces[i].getBoundingClientRect();
          const moved = Math.abs(a.left - b.left - dx) > 2 || Math.abs(a.top - b.top - dy) > 2 || Math.abs(a.width - b.width) > 2 || Math.abs(a.height - b.height) > 2;
          // Скругление сравнивается у видимого лица, а не у обёртки: у лица своя
          // рамка, и радиус обёртки глазом не виден
          const radius =
            getComputedStyle(el.firstElementChild).borderTopLeftRadius !==
            getComputedStyle(faces[i].firstElementChild).borderTopLeftRadius;
          // Выравнивание текста внутри тоже сравнивается: кнопка-обёртка
          // центрировала заголовок карточки, и это был нечаянный четвёртый баг
          const align = [...el.querySelectorAll("*")].some(
            (node, k) => getComputedStyle(node).textAlign !== getComputedStyle(faces[i].querySelectorAll("*")[k] ?? node).textAlign,
          );
          return { id: el.dataset.bugTarget, differs: moved || radius || align };
        });
        return { faces: faces.length, targets: targets.length, differs };
      });
      const buggy = bugs.differs.filter((d) => d.differs).map((d) => d.id);
      report(
        S9,
        "раунд 3: эталон из 4 блоков и вёрстка, где ровно три блока отличаются",
        (await levelOf(rounds)) === "2" && bugs.faces === 4 && bugs.targets === 4 && buggy.length === 3 && !buggy.includes("nav"),
        JSON.stringify(bugs),
      );
      report(S9, "раунд 3: доска того же размера, что в первом", same(boardBefore, await boxOf(rounds, "[data-minigame-layout]"), 1));
      await rounds.screenshot({ path: `${OUT}/minigame-bugs.png` });
      await rounds.locator('[data-bug-target="nav"]').click();
      await rounds.waitForTimeout(400);
      const decoy = await rounds.evaluate(() => ({
        fixed: document.querySelectorAll("[data-fixed]").length,
        status: document.querySelector("[data-minigame-status]")?.textContent ?? "",
      }));
      report(S9, "раунд 3: верный блок не считается багом", decoy.fixed === 0 && /по макету|matches/.test(decoy.status), decoy.status);
      await rounds.locator('[data-bug-target="card"]').click();
      const fixFlying = await rounds.evaluate(() => document.querySelector('[data-bug-target="card"]')?.getAnimations().length ?? 0);
      await rounds.waitForTimeout(600);
      const cardFixed = await rounds.evaluate(() => {
        const ref = document.querySelector("[data-minigame-reference]").getBoundingClientRect();
        const build = document.querySelector("[data-minigame-layout]").getBoundingClientRect();
        const face = document.querySelectorAll("[data-minigame-reference] > div > div")[1].getBoundingClientRect();
        const cardEl = document.querySelector('[data-bug-target="card"]');
        const card = cardEl.getBoundingClientRect();
        const refNodes = document.querySelectorAll("[data-minigame-reference] > div > div")[1].querySelectorAll("*");
        const sameAlign = [...cardEl.querySelectorAll("*")].every(
          (node, k) => getComputedStyle(node).textAlign === getComputedStyle(refNodes[k]).textAlign,
        );
        return (
          sameAlign &&
          Math.abs(card.left - build.left - (face.left - ref.left)) < 1.5 &&
          Math.abs(card.top - build.top - (face.top - ref.top)) < 1.5
        );
      });
      report(S9, "раунд 3: найденный баг встаёт как в макете, с анимацией", cardFixed && fixFlying > 0, `анимаций: ${fixFlying}`);
      const masterBefore = await masterCount(rounds);
      await rounds.locator('[data-bug-target="input"]').click();
      await rounds.locator('[data-bug-target="button"]').click();
      await rounds.waitForTimeout(1300);
      const bugsDone = await rounds.evaluate(() => ({
        complete: document.querySelector("[data-minigame]")?.hasAttribute("data-complete"),
        badge: Boolean(document.querySelector("[data-minigame-achievement]")),
        next: document.querySelectorAll("[data-minigame-next]").length,
      }));
      report(
        S9,
        "раунд 3: три бага — финал и ачивка «Ревьюер» в sessionStorage один раз",
        Boolean(MASTER) && bugsDone.complete && bugsDone.badge && bugsDone.next === 0 && masterBefore === 0 && (await masterCount(rounds)) === 1,
        JSON.stringify(bugsDone),
      );
      await rounds.screenshot({ path: `${OUT}/minigame-master.png` });

      // Награда за третий раунд: кнопка открывает «Разбор сайта», Escape
      // закрывает, фокус возвращается на кнопку
      await rounds.locator("[data-minigame-xray]").click();
      await rounds.waitForTimeout(1000);
      const xrayOpened = (await rounds.locator("[data-xray]").count()) === 1;
      await rounds.keyboard.press("Escape");
      await rounds.waitForTimeout(1000);
      const xrayBack = await rounds.evaluate(() => ({
        closed: !document.querySelector("[data-xray]"),
        focus: Boolean(document.activeElement?.matches("[data-minigame-xray]")),
      }));
      report(
        S9,
        "1440: финал третьего раунда открывает разбор сайта, фокус возвращается на кнопку",
        xrayOpened && xrayBack.closed && xrayBack.focus,
        JSON.stringify({ xrayOpened, ...xrayBack }),
      );
      await rounds.locator("[data-minigame-again]").click();
      await rounds.waitForTimeout(700);
      report(
        S9,
        "после третьего раунда «Сначала» возвращает в первый",
        (await levelOf(rounds)) === "0" && (await rounds.locator("[data-minigame] [data-block]").count()) === 4,
      );
      report(S9, "раунды без ошибок в консоли", rounds.errors.length === 0, rounds.errors.slice(0, 2).join(" | "));
      await rounds.close();

      // Клавиатура проходит третий раунд, фокус после финала — на «Сначала»
      const kb3 = await openPage(browser);
      await toGame(kb3);
      await finishRound(kb3);
      await toNext(kb3);
      await finishRound(kb3);
      await toNext(kb3);
      const focusStart = await kb3.evaluate(() => document.activeElement?.dataset.bugTarget ?? null);
      for (const id of ["card", "input", "button"]) {
        await kb3.locator(`[data-bug-target="${id}"]`).focus();
        await kb3.keyboard.press("Enter");
        await kb3.waitForTimeout(450);
      }
      await kb3.waitForTimeout(300);
      const kbFinal = await kb3.evaluate(() => ({
        complete: document.querySelector("[data-minigame]")?.hasAttribute("data-complete"),
        focusAgain: Boolean(document.activeElement?.matches("[data-minigame-again]")),
      }));
      report(
        S9,
        "раунд 3 с клавиатуры: фокус входит в вёрстку, после финала — на «Сначала»",
        focusStart !== null && kbFinal.complete && kbFinal.focusAgain,
        JSON.stringify({ focusStart, ...kbFinal }),
      );
      await kb3.close();

      // reduced-motion: раунды те же, без анимаций
      const still3 = await openPage(browser, { reducedMotion: "reduce" });
      await toGame(still3);
      await finishRound(still3);
      await toNext(still3);
      await finishRound(still3);
      await toNext(still3);
      await still3.locator('[data-bug-target="card"]').click();
      const rm3 = await still3.evaluate(() => document.querySelector("[data-minigame]").getAnimations({ subtree: true }).length);
      report(S9, "reduced-motion: раунды 2–3 проходятся без анимаций", rm3 === 0 && (await levelOf(still3)) === "2", `анимаций: ${rm3}`);
      await still3.close();

      // Английский и узкий экран: тексты раундов без кириллицы, строка
      // состояния не меняет высоту, доска не вылезает
      for (const [width, height] of [
        [390, 844],
        [1024, 768],
      ]) {
        const view = await openPage(browser, { viewport: { width, height }, isMobile: width <= 430, hasTouch: width <= 430 });
        await view.evaluate(() => sessionStorage.setItem("cv-lang", "en"));
        await view.reload({ waitUntil: "networkidle" });
        await toGame(view);
        const statusH = () => view.locator("[data-minigame-status]").evaluate((el) => Math.round(el.getBoundingClientRect().height));
        const h1 = await statusH();
        for (const id of PIECE_IDS) {
          await view.locator(`[data-block="${id}"]`).click();
          await view.locator(`[data-slot="${id}"]`).click();
          await view.waitForTimeout(350);
        }
        await view.locator("[data-minigame-next]").click();
        await view.waitForTimeout(500);
        const h2 = await statusH();
        const text2 = await view.locator("[data-minigame]").textContent();
        for (const id of PIECE_IDS) {
          await view.locator(`[data-block="${id}"]`).click();
          await view.locator(`[data-slot="${id}"]`).click();
          await view.waitForTimeout(350);
        }
        await view.locator("[data-minigame-next]").click();
        await view.waitForTimeout(500);
        const h3 = await statusH();
        const text3 = await view.locator("[data-minigame]").textContent();
        for (const id of ["card", "input", "button"]) {
          await view.locator(`[data-bug-target="${id}"]`).click();
          await view.waitForTimeout(300);
        }
        await view.waitForTimeout(900);
        // Разбор есть только от 1024px: ниже кнопка скрыта, а не ведёт в никуда
        const xrayShown = await view.locator("[data-minigame-xray]").isVisible();
        report(S9, `${width}px: кнопка разбора ${width >= 1024 ? "видна" : "скрыта"} в финале`, xrayShown === width >= 1024);
        const overflow = await view.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        report(
          S9,
          `${width}px, EN: раунды 2–3 без кириллицы, строка состояния одной высоты, без переполнения`,
          !/[а-яё—]/i.test(text2 + text3) && h1 === h2 && h2 === h3 && overflow <= 1,
          `строка ${h1}/${h2}/${h3}px, перебор ${overflow}px`,
        );
        await view.evaluate(() => sessionStorage.setItem("cv-lang", "ru"));
        await view.close();
      }
    }

    if (wanted("Разбор")) {
      // --- Разбор сайта (x-ray): награда за мини-игру ---------------------------
      // Экран раскладывается в 3D на слои-копии. Проверяем, что слоёв хватает и
      // они на разной глубине, что копии стоят там же, где оригиналы, что
      // подсветка, сетка, Escape, возврат фокуса и скролла работают, и что
      // ниже 1024px и без ачивки входа нет.
      const SX = "Разбор";
      const MASTER_ID = readFileSync("src/lib/unlocked.ts", "utf8").match(/MINIGAME_MASTER = "([^"]+)"/)?.[1];
      report(SX, "id ачивки всех раундов объявлен в src/lib/unlocked.ts", Boolean(MASTER_ID));

      const xrayPage = async (options = {}, { unlocked = true, lang = "ru" } = {}) => {
        const view = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...options });
        const errors = [];
        view.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        view.on("pageerror", (e) => errors.push(String(e)));
        view.errors = errors;
        await view.addInitScript(
          ([id, on, l]) => {
            if (on) sessionStorage.setItem("cv-unlocked", JSON.stringify([id]));
            sessionStorage.setItem("cv-lang", l);
          },
          [MASTER_ID, unlocked, lang],
        );
        await view.goto(BASE, { waitUntil: "networkidle" });
        await view.waitForTimeout(600);
        return view;
      };
      // Остановка в середине маршрута: в кадре дом, декор, дорога и текст
      const toStop = async (view) => {
        const ids = routeStopIds();
        await view.evaluate((id) => {
          const stop = document.querySelector(`[data-stop="${id}"]`);
          window.scrollTo(0, stop.getBoundingClientRect().top + window.scrollY - 120);
        }, ids[Math.min(3, ids.length - 1)]);
        await view.waitForTimeout(1300);
      };
      const paletteHasXray = async (view) => {
        await view.keyboard.press("Control+k");
        await view.waitForTimeout(350);
        await view.keyboard.type("разобрать");
        await view.waitForTimeout(200);
        return view.evaluate(() => Boolean(document.querySelector('[data-palette-option="xray"]')));
      };
      // Открыть с кнопки палитры в панели: на неё же потом должен вернуться фокус
      const openXrayFromTrigger = async (view, settle = 1100) => {
        await view.locator("[data-palette-trigger]").click();
        await view.waitForTimeout(350);
        await view.keyboard.type("разобрать");
        await view.waitForTimeout(200);
        await view.keyboard.press("Enter");
        if (settle) await view.waitForTimeout(settle);
      };
      // Глубина пластин — translateZ из вычисленной матрицы (m43)
      const plateDepths = (view) =>
        view.evaluate(() =>
          [...document.querySelectorAll("[data-xray-plate]")].map((el) => {
            const m = getComputedStyle(el).transform.match(/matrix3d\(([^)]+)\)/);
            return m ? Number(m[1].split(",")[14]) : 0;
          }),
        );

      // --- Без ачивки и на узком экране команды нет -----------------------------
      {
        const locked = await xrayPage({}, { unlocked: false });
        report(SX, "без ачивки всех раундов команды в палитре нет", !(await paletteHasXray(locked)));
        await locked.close();

        const narrow = await xrayPage({ viewport: { width: 1000, height: 800 } });
        report(SX, "ниже 1024px команды в палитре нет", !(await paletteHasXray(narrow)));
        await narrow.close();
      }

      // --- Открытие, слои, копии на своих местах --------------------------------
      const page = await xrayPage();
      await toStop(page);
      report(SX, "с ачивкой команда «Разобрать сайт» в палитре есть", await paletteHasXray(page));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);

      const scrollBefore = await page.evaluate(() => window.scrollY);
      // Прямоугольник первого дома в кадре — копия обязана встать туда же
      const houseBefore = await page.evaluate(() => {
        const house = [...document.querySelectorAll("[data-stop] [data-scene-object]")].find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
        });
        const r = house?.getBoundingClientRect();
        return r
          ? { left: r.left, top: r.top, w: r.width, h: r.height, src: house.querySelector("img")?.getAttribute("src") }
          : null;
      });

      await openXrayFromTrigger(page, 0);
      await page.waitForTimeout(120);
      const early = await plateDepths(page);
      await page.waitForTimeout(1100);

      const state = await page.evaluate(() => ({
        open: document.querySelector("[data-xray]")?.getAttribute("data-xray-state") ?? null,
        z: getComputedStyle(document.querySelector("[data-xray]") ?? document.body).zIndex,
        plates: document.querySelectorAll("[data-xray-plate]").length,
        filled: [...document.querySelectorAll("[data-xray-host]")].filter((h) => h.childElementCount > 0).length,
        buttons: document.querySelectorAll("[data-xray-layer]").length,
        dialog: document.querySelector("[data-xray-panel]")?.getAttribute("role"),
        focusInside: Boolean(document.activeElement?.closest("[data-xray-panel]")),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      report(SX, "разбор открывается из палитры", state.open === "open", JSON.stringify(state));
      report(SX, "слой разбора — z-60, как комната", state.z === "60", `z-index ${state.z}`);
      report(SX, "слоёв не меньше 6, у каждого кнопка в списке", state.plates >= 6 && state.buttons === state.plates, `${state.plates} пластин, ${state.buttons} кнопок`);
      report(SX, "в пластинах лежат копии: заполнено не меньше 6", state.filled >= 6, `${state.filled}`);
      report(SX, "диалог с фокусом внутри", state.dialog === "dialog" && state.focusInside);
      report(SX, "нет горизонтальной прокрутки", state.overflow <= 0, `${state.overflow}px`);

      const depths = await plateDepths(page);
      const distinct = new Set(depths.map((z) => Math.round(z))).size;
      report(SX, "слои на разной глубине (разные translateZ)", distinct >= 6, depths.map((z) => Math.round(z)).join(" / "));
      report(
        SX,
        "раскрытие анимируется, а не встаёт сразу",
        Math.max(...early) < Math.max(...depths) - 1,
        `через 120 мс ${Math.round(Math.max(...early))}px из ${Math.round(Math.max(...depths))}px`,
      );

      // Копия дома — по той же точке экрана. Меряем в плоской позе: сцена и
      // пластины на миг сбрасываются в «без 3D» — ровно так разбор выглядит в
      // первый кадр открытия — и возвращаются обратно
      const houseCopy = await page.evaluate((src) => {
        const copy = [...document.querySelectorAll('[data-xray-plate="town"] [data-scene-object]')].find(
          (el) => el.querySelector("img")?.getAttribute("src") === src,
        );
        if (!copy) return null;
        const flat = [document.querySelector("[data-xray-stage]"), ...document.querySelectorAll("[data-xray-plate]")];
        const saved = flat.map((el) => el.style.transform);
        flat.forEach((el) => (el.style.transform = "none"));
        const r = copy.getBoundingClientRect();
        flat.forEach((el, i) => (el.style.transform = saved[i]));
        return { left: r.left, top: r.top, w: r.width, h: r.height };
      }, houseBefore?.src);
      report(
        SX,
        "копия дома стоит там же, где дом на экране (±2px)",
        Boolean(houseBefore && houseCopy) &&
          Math.abs(houseBefore.left - houseCopy.left) <= 2 &&
          Math.abs(houseBefore.top - houseCopy.top) <= 2 &&
          Math.abs(houseBefore.w - houseCopy.w) <= 2,
        `${JSON.stringify(houseBefore)} → ${JSON.stringify(houseCopy)}`,
      );

      // Копии инертны: в пластинах нечего фокусировать
      const inertOk = await page.evaluate(() =>
        [...document.querySelectorAll("[data-xray-host]")].every((h) => h.inert),
      );
      report(SX, "копии инертны — фокус и клики в них не попадают", inertOk);

      // Подписи: имя и одна техническая строка у каждого слоя, по-русски
      const labelsRu = await page.evaluate(() =>
        [...document.querySelectorAll("[data-xray-layer]")].map((b) => ({
          name: b.querySelector(".font-medium")?.textContent ?? "",
          note: b.querySelector("[data-xray-note]")?.textContent ?? "",
        })),
      );
      report(
        SX,
        "у каждого слоя имя и техническая строка (ru)",
        labelsRu.length >= 6 && labelsRu.every((l) => /[а-яё]/i.test(l.name) && l.note.trim().length > 0),
        labelsRu.map((l) => l.name).join(", "),
      );

      // Наведение: слой приподнимается, остальные приглушаются
      const zTownBefore = depths[[...(await page.evaluate(() => [...document.querySelectorAll("[data-xray-plate]")].map((p) => p.dataset.xrayPlate)))].indexOf("town")];
      await page.hover('[data-xray-layer="town"]');
      await page.waitForTimeout(500);
      const hover = await page.evaluate(() =>
        [...document.querySelectorAll("[data-xray-plate]")].map((p) => ({
          id: p.dataset.xrayPlate,
          opacity: Number(getComputedStyle(p).opacity),
        })),
      );
      const zTownHover = (await plateDepths(page))[hover.findIndex((p) => p.id === "town")];
      const townOpacity = hover.find((p) => p.id === "town")?.opacity ?? 0;
      const others = hover.filter((p) => p.id !== "town");
      report(
        SX,
        "наведение на слой приглушает остальные",
        townOpacity === 1 && others.every((p) => p.opacity < 0.5),
        others.map((p) => `${p.id} ${p.opacity.toFixed(2)}`).join(", "),
      );
      report(SX, "наведённый слой приподнимается", zTownHover > zTownBefore + 10, `${Math.round(zTownBefore)} → ${Math.round(zTownHover)}px`);

      // Фокус с клавиатуры делает то же, что наведение
      await page.mouse.move(1400, 880);
      await page.locator('[data-xray-layer="road"]').focus();
      await page.waitForTimeout(450);
      const focusDim = await page.evaluate(() => ({
        road: Number(getComputedStyle(document.querySelector('[data-xray-plate="road"]')).opacity),
        hud: Number(getComputedStyle(document.querySelector('[data-xray-plate="hud"]')).opacity),
      }));
      report(SX, "фокус кнопки слоя подсвечивает его, как наведение", focusDim.road === 1 && focusDim.hud < 0.5, JSON.stringify(focusDim));

      // Сетка клеток из town.ts поверх городка
      await page.locator("[data-xray-grid-toggle]").click();
      await page.waitForTimeout(300);
      const gridState = await page.evaluate(() => {
        const grid = document.querySelector("[data-xray-grid]");
        const d = grid?.querySelector("path")?.getAttribute("d") ?? "";
        return {
          visible: Boolean(grid && !grid.hidden),
          pressed: document.querySelector("[data-xray-grid-toggle]")?.getAttribute("aria-pressed"),
          segments: (d.match(/M/g) ?? []).length,
        };
      });
      report(SX, "переключатель рисует сетку клеток над городком", gridState.visible && gridState.pressed === "true" && gridState.segments > 50, JSON.stringify(gridState));
      await page.locator("[data-xray-grid-toggle]").click();
      await page.mouse.move(1400, 880);
      await page.locator("[data-xray-panel]").focus();
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${OUT}/xray-light.png` });

      // Палитра поверх разбора не открывается
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(300);
      report(SX, "палитра ⌘K поверх разбора не открывается", !(await page.evaluate(() => Boolean(document.querySelector("[data-palette]")))));

      // Escape: сборка обратно, скролл на месте, фокус на кнопке, с которой открыли
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1000);
      const closed = await page.evaluate(() => ({
        gone: !document.querySelector("[data-xray]"),
        scrollY: window.scrollY,
        focus: document.activeElement?.hasAttribute("data-palette-trigger") ?? false,
      }));
      report(SX, "Escape закрывает разбор", closed.gone);
      report(SX, "после закрытия скролл на том же месте", Math.abs(closed.scrollY - scrollBefore) <= 2, `${scrollBefore} → ${closed.scrollY}`);
      report(SX, "фокус возвращается на кнопку, открывшую разбор", closed.focus);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(600);
      const scrolls = await page.evaluate(() => window.scrollY);
      report(SX, "после закрытия страница снова скроллится", scrolls > closed.scrollY + 50, `${closed.scrollY} → ${scrolls}`);
      report(SX, "нет ошибок в консоли", page.errors.length === 0, page.errors.slice(0, 3).join(" | "));
      await page.close();

      // --- Английский: подписи переведены, без длинных тире --------------------
      {
        const en = await xrayPage({}, { lang: "en" });
        await toStop(en);
        await openXrayFromTrigger(en);
        const text = await en.evaluate(() => document.querySelector("[data-xray-panel]")?.textContent ?? "");
        report(SX, "подписи слоёв есть на английском, без кириллицы и длинных тире", text.length > 100 && !/[а-яё—]/i.test(text), text.slice(0, 80));
        await en.close();
      }

      // --- Тёмная тема: скриншот ----------------------------------------------
      {
        const dark = await xrayPage({ colorScheme: "dark" });
        await toStop(dark);
        await openXrayFromTrigger(dark);
        await dark.mouse.move(1400, 880);
        await dark.locator("[data-xray-panel]").focus();
        await dark.waitForTimeout(300);
        await dark.screenshot({ path: `${OUT}/xray-dark.png` });
        report(SX, "тёмная тема: разбор открыт, без ошибок", Boolean(await dark.$('[data-xray-state="open"]')) && dark.errors.length === 0, dark.errors.slice(0, 2).join(" | "));
        await dark.close();
      }

      // --- reduced-motion: разобранное состояние сразу, без анимации -----------
      {
        const reduced = await xrayPage({ reducedMotion: "reduce" });
        await toStop(reduced);
        await openXrayFromTrigger(reduced, 0);
        await reduced.waitForTimeout(300);
        const first = await plateDepths(reduced);
        await reduced.waitForTimeout(700);
        const later = await plateDepths(reduced);
        const spread = new Set(first.map((z) => Math.round(z))).size;
        report(
          SX,
          "reduced-motion: слои разложены сразу и дальше не едут",
          spread >= 6 && first.every((z, i) => Math.abs(z - later[i]) < 0.5),
          `${first.map(Math.round).join("/")} → ${later.map(Math.round).join("/")}`,
        );
        await reduced.keyboard.press("Escape");
        await reduced.waitForTimeout(150);
        report(SX, "reduced-motion: закрывается сразу", !(await reduced.$("[data-xray]")));
        await reduced.close();
      }
    }

    // --- Блоки «town-polish» (29.09.2026): каждая секция — свой модуль -----
    // Модуль в scripts/verify/ экспортирует `stage` (имя для --stage) и
    // `run(ctx)`. Отдельные файлы — чтобы блоки, которые делаются параллельно,
    // не правили один и тот же участок этого файла.
    const ctx = { browser, openPage, report, BASE, OUT, sleep, routeStopIds, roomStopIds };
    for (const file of readdirSync(new URL("./verify/", import.meta.url)).filter((f) => f.endsWith(".mjs")).sort()) {
      const section = await import(new URL(`./verify/${file}`, import.meta.url));
      if (wanted(section.stage)) await section.run(ctx);
    }

    // --- Э6+: сюда добавляются проверки следующих этапов ---------------------
    // Шаблон проверки для нового этапа:
    //   if (wanted("Э6")) { const page = await openPage(browser); ... report("Э6", ...); await page.close(); }
  } finally {
    await browser.close();
    if (server) server.kill("SIGTERM");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nИтог: ${results.length - failed.length}/${results.length} проверок пройдено. Скриншоты: ${OUT}/`,
  );

  if (failed.length > 0) {
    console.log("\nНе пройдено:");
    for (const f of failed) console.log(`  ${f.stage} ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nПроверка сорвалась: ${err.message}`);
  process.exit(2);
});
