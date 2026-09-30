#!/usr/bin/env node
/**
 * Замер плавности прокрутки маршрута — только против прод-сборки.
 *
 *   npm run build && PORT=3300 npm start
 *   node scripts/perf.mjs --url=http://localhost:3300 [--cpu=4] [--dpr=1] [--seconds=12]
 *
 * Как меряет: Chromium с замедлением процессора через CDP
 * (`Emulation.setCPUThrottlingRate`), прокрутка колесом — так её получает
 * Lenis, как у живого человека, — ровным темпом от начала маршрута до конца.
 * Длительности кадров собираются в самой странице по requestAnimationFrame.
 * Dev-режим для выводов не годится: там React в режиме разработки и
 * несжатые чанки, цифры будут хуже прода в разы.
 *
 * Выводит средний FPS, 95-й перцентиль кадра и число длинных кадров
 * (> 32 мс — то, что глаз видит как рывок; > 50 мс — «long task»).
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
const CPU = Number(argOf("cpu", "4"));
const DPR = Number(argOf("dpr", "1"));
const SECONDS = Number(argOf("seconds", "12"));
const WIDTH = Number(argOf("width", "1440"));
const HEIGHT = Number(argOf("height", "900"));
const SCHEME = argOf("scheme", "light");
/** Эксперимент: стиль, подмешанный в страницу перед замером (например, выключить слой) */
const CSS = argOf("css", "");
/**
 * `--trace`: кроме кадров, сумма процессорного времени (thread time, а не
 * время на стене) по видам работы из трассировки Chromium. На общей машине,
 * где рядом что-то считается, FPS шумит, а объём работы — почти нет: им и
 * сравниваются версии между собой.
 */
const TRACE = args.includes("--trace");

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const cache of [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), "Library", "Caches", "ms-playwright"),
    join(homedir(), ".cache", "ms-playwright"),
  ].filter(Boolean)) {
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
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: DPR,
  colorScheme: SCHEME,
});
await page.goto(URL_, { waitUntil: "networkidle" });
if (CSS) await page.addStyleTag({ content: CSS });
await page.waitForTimeout(1500);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
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

if (TRACE) {
  await browser.startTracing(page, {
    categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc", "blink"],
  });
}

// Колесо: шаг 100px каждые ~50 мс — быстрая, но человеческая прокрутка
const stepPx = 100;
const pauseMs = Math.max(16, Math.round((SECONDS * 1000) / (total / stepPx)));
await page.mouse.move(WIDTH / 2, HEIGHT / 2);
for (let y = 0; y < total; y += stepPx) {
  await page.mouse.wheel(0, stepPx);
  await page.waitForTimeout(pauseMs);
}
await page.waitForTimeout(800);

const frames = await page.evaluate(() => {
  window.__stop = true;
  return window.__frames.slice(2);
});
let work = null;
if (TRACE) {
  const events = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
  const kinds = {
    paint: ["Paint", "PaintImage"],
    raster: ["RasterTask", "RasterizerTaskImpl::RunOnWorkerThread"],
    decode: ["ImageDecodeTask", "Decode Image", "Decode LazyPixelRef"],
    layout: ["Layout", "UpdateLayoutTree", "RecalculateStyles", "PrePaint"],
    script: ["FunctionCall", "EvaluateScript", "FireAnimationFrame"],
  };
  work = {};
  for (const [kind, names] of Object.entries(kinds)) {
    const us = events
      .filter((e) => e.ph === "X" && names.includes(e.name))
      .reduce((sum, e) => sum + (e.tdur ?? e.dur ?? 0), 0);
    work[kind] = Math.round(us / 1000);
  }
}
await browser.close();

const sorted = [...frames].sort((a, b) => a - b);
const sum = frames.reduce((a, b) => a + b, 0);
const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
console.log(
  JSON.stringify(
    {
      url: URL_,
      viewport: `${WIDTH}x${HEIGHT}@${DPR}`,
      scheme: SCHEME,
      cpu: `x${CPU}`,
      frames: frames.length,
      avgFps: Number((1000 / (sum / frames.length)).toFixed(1)),
      p95ms: Number(p(0.95).toFixed(1)),
      p99ms: Number(p(0.99).toFixed(1)),
      over32ms: frames.filter((f) => f > 32).length,
      over50ms: frames.filter((f) => f > 50).length,
      maxMs: Number(sorted[sorted.length - 1].toFixed(1)),
      ...(work ? { cpuMs: work } : {}),
    },
    null,
    2,
  ),
);
