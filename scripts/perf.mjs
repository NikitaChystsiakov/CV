#!/usr/bin/env node
/**
 * Замер плавности скролла маршрута — только на прод-сборке.
 *
 *   npm run build && PORT=3300 npm start
 *   npm run perf -- --url=http://localhost:3300 [--dpr=2] [--width=1440 --height=900] [--seconds=12]
 *   npm run perf -- ... --css="[data-backdrop]{display:none}"   A/B: что стоит слой
 *
 * `--css` подкладывает стиль перед замером. Это инструмент сравнения «с
 * этим и без этого» в одних и тех же условиях машины: абсолютные цифры на
 * занятой машине плавают, а чередование прогонов с опцией и без неё — нет.
 *
 * Правила замера проекта: CPU замедлен вчетверо через CDP, прокрутка — колесом
 * (едет Lenis, как у посетителя), по всему маршруту туда и обратно. Время
 * кадров пишется requestAnimationFrame в самой странице. Dev-режим для выводов
 * не годится: там React в режиме разработки и неоптимизированные картинки.
 *
 * Итог: средний FPS, 95-й перцентиль длительности кадра, число длинных кадров
 * (> 50 мс) и кадров, пропустивших хотя бы один vsync (> 20 мс).
 */

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const URL_ = argOf("url", "http://localhost:3300");
const DPR = Number(argOf("dpr", "1"));
const WIDTH = Number(argOf("width", "1440"));
const HEIGHT = Number(argOf("height", "900"));
const SECONDS = Number(argOf("seconds", "12"));
const CPU = Number(argOf("cpu", "4"));
const THEME = argOf("theme", "light");
const CSS = argOf("css", "");

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const caches = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), "Library", "Caches", "ms-playwright"),
    join(homedir(), ".cache", "ms-playwright"),
  ].filter(Boolean);
  for (const cache of caches) {
    if (!existsSync(cache)) continue;
    for (const rev of readdirSync(cache).filter((d) => d.startsWith("chromium-")).sort().reverse()) {
      for (const rel of [
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chrome-linux/chrome",
        "chrome-linux64/chrome",
      ]) {
        if (existsSync(join(cache, rev, rel))) return join(cache, rev, rel);
      }
    }
  }
  return null;
}

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: DPR });
  await page.goto(URL_, { waitUntil: "networkidle" });
  if (THEME === "dark") {
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload({ waitUntil: "networkidle" });
  }

  if (CSS) await page.addStyleTag({ content: CSS });

  // Прогрев: картинки маршрута загружены и декодированы до замера — иначе
  // меряется сеть, а не скролл
  const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let y = 0; y <= total; y += 400) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => {
      window.__frames.push(now - last);
      last = now;
      if (!window.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Колесо: ~100px за 50 мс — уверенная, но не бешеная прокрутка. Вниз до
  // конца, потом вверх: персонаж разворачивается, дорога перерисовывается
  const started = Date.now();
  let dir = 1;
  while (Date.now() - started < SECONDS * 1000) {
    await page.mouse.wheel(0, 100 * dir);
    await page.waitForTimeout(50);
    const y = await page.evaluate(() => window.scrollY);
    if (dir > 0 && y >= total - 10) dir = -1;
    else if (dir < 0 && y <= 10) dir = 1;
  }

  const frames = await page.evaluate(() => {
    window.__stop = true;
    return window.__frames.slice(2);
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const sorted = [...frames].sort((a, b) => a - b);
  const sum = frames.reduce((a, b) => a + b, 0);
  const result = {
    viewport: `${WIDTH}×${HEIGHT}@${DPR}x`,
    cpu: `×${CPU}`,
    theme: THEME,
    ...(CSS ? { css: CSS } : {}),
    frames: frames.length,
    fps: Math.round((frames.length / sum) * 1000 * 10) / 10,
    p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
    over20: frames.filter((f) => f > 20).length,
    over50: frames.filter((f) => f > 50).length,
  };
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
