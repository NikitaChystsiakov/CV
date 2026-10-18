/**
 * Блок 1 «Персонаж и дорога» (29.09.2026).
 *
 * Персонаж ходит по четырём роликам: вниз лицом и вверх спиной, прямо и по
 * диагонали. Тихо ломается здесь многое: он пятится вместо разворота, на
 * быстрой прокрутке ноги мелькают, одна из поз выше других, на стыке прямой и
 * диагонали ноги прыгают с дороги. Скриншот ничего из этого не покажет, поэтому
 * проверки — про геометрию и про смену кадров.
 */

import { readFileSync } from "node:fs";

export const stage = "Б1";

const S = stage;
const POSES = ["down", "diag", "up", "upDiag"];
const FORWARD = new Set(["down", "diag"]);
const BACK = new Set(["up", "upDiag"]);

/** Рост стоящего персонажа в базовых пикселях городка — walker.tsx, HEIGHT. */
const HEIGHT = 120;
/** Потолок частоты шага — walker.tsx, MAX_CADENCE, циклов в секунду. */
const MAX_CADENCE = 2;

export async function run({ browser, openPage, report, BASE, OUT }) {
  const manifest = JSON.parse(readFileSync("src/lib/walk-manifest.json", "utf8"));

  // --- Конвейер: четыре полосы, одна стойка ---------------------------------
  report(S, "в манифесте четыре позы ходьбы", POSES.every((p) => manifest[p]), Object.keys(manifest).join(", "));
  const heights = POSES.map((p) => manifest[p]?.standHeight);
  report(S, "рост стойки в полосе у всех поз один", new Set(heights).size === 1, heights.join("/"));
  report(
    S,
    "у каждой позы в манифесте точка ног и длина шага",
    POSES.every((p) => {
      const a = manifest[p];
      return a && a.feetX > 0.2 && a.feetX < 0.8 && a.feetY > 0.85 && a.feetY <= 1 && a.stride > 20;
    }),
    POSES.map((p) => `${p}: ${manifest[p]?.feetX}/${manifest[p]?.feetY}/${manifest[p]?.stride}`).join(", "),
  );

  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  for (const pose of POSES) {
    const response = await page.request.get(`${BASE}${manifest[pose].src}`);
    report(S, `полоса «${pose}» отдаётся сервером`, response.ok(), `${manifest[pose].src} → ${response.status()}`);
  }
  const strips = await page.evaluate(
    (poses) =>
      Object.fromEntries(
        poses.map((pose) => {
          const img = document.querySelector(`[data-walker-frame="${pose}"] img`);
          return [pose, img ? [img.naturalWidth, img.naturalHeight] : null];
        }),
      ),
    POSES,
  );
  for (const pose of POSES) {
    const { frames, frameWidth, frameHeight } = manifest[pose];
    const got = strips[pose];
    report(
      S,
      `полоса «${pose}» загрузилась и сходится с манифестом`,
      Boolean(got) && got[0] === frameWidth * (frames + 1) && got[1] === frameHeight,
      got ? got.join("x") : "картинки нет",
    );
  }

  // --- Геометрия всех поз: рост и точка ног ---------------------------------
  const geometry = await page.evaluate((m) => {
    const body = document.querySelector("[data-walker]").getBoundingClientRect();
    const road = document.querySelector("[data-road]");
    // Базовый пиксель городка на экране: ширина дороги-SVG в базовых px — 1428
    const unit = road.getBoundingClientRect().width / 1428;
    return {
      unit,
      poses: [...document.querySelectorAll("[data-walker-frame]")].map((el) => {
        const pose = el.getAttribute("data-walker-frame");
        const r = el.getBoundingClientRect();
        const a = m[pose];
        return {
          pose,
          stand: (r.height * a.standHeight) / a.frameHeight,
          feetGap: Math.hypot(r.left + r.width * a.feetX - body.left, r.top + r.height * a.feetY - body.top),
        };
      }),
    };
  }, manifest);
  const stands = geometry.poses.map((p) => p.stand);
  report(
    S,
    "на экране рост стойки у всех четырёх поз один",
    geometry.poses.length === 4 && Math.max(...stands) - Math.min(...stands) < 0.5,
    geometry.poses.map((p) => `${p.pose} ${p.stand.toFixed(1)}px`).join(", "),
  );
  report(
    S,
    `рост персонажа — ${HEIGHT} базовых px`,
    Math.abs(stands[0] / geometry.unit - HEIGHT) < 2,
    `${(stands[0] / geometry.unit).toFixed(1)} при --town-unit ${geometry.unit.toFixed(3)}px`,
  );
  report(
    S,
    "точка ног у всех поз в одной точке дороги: на стыке прямой и диагонали он не прыгает",
    geometry.poses.every((p) => p.feetGap < 1.5),
    geometry.poses.map((p) => `${p.pose} ${p.feetGap.toFixed(2)}px`).join(", "),
  );

  // --- Направление: вниз лицом, вверх спиной --------------------------------
  const visiblePose = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll("[data-walker-frame]")].find(
        (node) => getComputedStyle(node).visibility === "visible",
      );
      return el?.getAttribute("data-walker-frame") ?? null;
    });
  const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const start = Math.round(total * 0.3);
  await page.evaluate((y) => window.scrollTo(0, y), start);
  await page.mouse.wheel(0, 1);
  await page.waitForTimeout(1500);

  const drive = async (from, dir, steps) => {
    const seen = [];
    for (let k = 1; k <= steps; k += 1) {
      await page.evaluate((y) => window.scrollTo(0, y), from + dir * k * 45);
      await page.waitForTimeout(40);
      seen.push(await visiblePose());
    }
    return seen;
  };
  const down = await drive(start, 1, 40);
  // Шаг вниз по маршруту — лицом к зрителю: и сразу, и всю дорогу
  report(
    S,
    "прокрутка вниз — идёт лицом (down/diag)",
    down.every((p) => FORWARD.has(p)),
    [...new Set(down)].join(", "),
  );
  await page.screenshot({ path: `${OUT}/b1-walk-down.png` });
  await page.waitForTimeout(500);
  const upFrom = start + 40 * 45;
  const up = await drive(upFrom, -1, 40);
  // Разворот не мгновенный (гистерезис), но дальше — только спиной
  const afterTurn = up.slice(4);
  report(
    S,
    "прокрутка вверх — идёт спиной (up/upDiag), а не пятится",
    afterTurn.every((p) => BACK.has(p)) && afterTurn.includes("up") && afterTurn.includes("upDiag"),
    up.join(","),
  );
  await page.screenshot({ path: `${OUT}/b1-walk-up.png` });
  await page.waitForTimeout(1200);
  const rest = await visiblePose();
  report(S, "остановившись после хода вверх, стоит спиной", BACK.has(rest), `поза ${rest}`);

  // Дрожь: мелкие движения туда-сюда не разворачивают его
  const jitter = [];
  const here = upFrom - 40 * 45;
  await page.evaluate((y) => window.scrollTo(0, y), here + 900);
  await page.waitForTimeout(1500);
  for (let k = 0; k < 16; k += 1) {
    await page.evaluate((y) => window.scrollTo(0, y), here + 900 + (k % 2 === 0 ? 4 : 0));
    await page.waitForTimeout(40);
    jitter.push(await visiblePose());
  }
  report(S, "дрожь прокрутки в пару пикселей не разворачивает его", new Set(jitter).size === 1, jitter.join(","));

  // --- Потолок частоты шага --------------------------------------------------
  // Меряем в самой странице по кадрам анимации: прокрутка за кадр и видимый
  // кадр полосы. Фазу считаем по сдвигу кадра (по модулю цикла)
  const cadence = (pxPerSecond, ms) =>
    page.evaluate(
      ({ m, speed, duration, from }) =>
        new Promise((resolve) => {
          window.scrollTo(0, from);
          const samples = [];
          const t0 = performance.now();
          const tick = (now) => {
            const t = now - t0;
            window.scrollTo(0, from + (speed * t) / 1000);
            const el = [...document.querySelectorAll("[data-walker-frame]")].find(
              (node) => getComputedStyle(node).visibility === "visible",
            );
            const strip = el?.querySelector("img");
            if (el && strip) {
              const pose = el.getAttribute("data-walker-frame");
              const moved = new DOMMatrix(getComputedStyle(strip).transform).m41;
              samples.push({ t, pose, frame: Math.round((-moved / strip.offsetWidth) * (m[pose].frames + 1)) });
            }
            if (t < duration) requestAnimationFrame(tick);
            else {
              let cycles = 0;
              const frames = new Set();
              for (let k = 1; k < samples.length; k += 1) {
                const a = samples[k - 1];
                const b = samples[k];
                frames.add(`${b.pose}:${b.frame}`);
                const n = m[b.pose].frames;
                if (a.pose !== b.pose || a.frame >= n || b.frame >= n) continue;
                cycles += ((b.frame - a.frame + n) % n) / n;
              }
              resolve({ perSecond: cycles / (duration / 1000), frames: frames.size, samples: samples.length });
            }
          };
          requestAnimationFrame(tick);
        }),
      { m: manifest, speed: pxPerSecond, duration: ms, from: Math.round(total * 0.1) },
    );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const fast = await cadence(6000, 1600);
  report(
    S,
    `быстрая прокрутка: не больше ${MAX_CADENCE} шагов в секунду, ноги не мелькают`,
    fast.perSecond <= MAX_CADENCE * 1.15 && fast.perSecond > 0.5,
    `${fast.perSecond.toFixed(2)} цикла/с, кадров анимации ${fast.samples}`,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  const slow = await cadence(45, 3000);
  report(
    S,
    "медленная прокрутка: кадры идут по пути, шаг сменяется",
    slow.frames >= 6 && slow.perSecond < MAX_CADENCE * 0.9,
    `${slow.perSecond.toFixed(2)} цикла/с, разных кадров ${slow.frames}`,
  );
  report(S, "ходьба без ошибок в консоли", page.errors.length === 0, page.errors.slice(0, 2).join(" | "));
  await page.close();

  // --- Посадка на полотно на всех ширинах, где он есть -----------------------
  const onRoad = (view) =>
    view.evaluate((m) => {
      const frame = [...document.querySelectorAll("[data-walker-frame]")].find(
        (el) => getComputedStyle(el).visibility === "visible",
      );
      const art = frame?.getBoundingClientRect();
      if (!art || art.width === 0) return null;
      const a = m[frame.getAttribute("data-walker-frame")];
      const feet = { x: art.left + art.width * a.feetX, y: art.top + art.height * a.feetY };
      const svg = document.querySelector("[data-road]");
      const road = svg.querySelector("path");
      const ctm = road.getScreenCTM();
      const len = road.getTotalLength();
      let nearest = Infinity;
      for (let i = 0; i <= 3000; i += 1) {
        const p = road.getPointAtLength((len * i) / 3000);
        const q = new DOMPoint(p.x, p.y).matrixTransform(ctm);
        nearest = Math.min(nearest, Math.hypot(q.x - feet.x, q.y - feet.y));
      }
      const halfRoad = parseFloat(getComputedStyle(svg.querySelectorAll("path")[3]).strokeWidth) / 2;
      return { nearest: Math.round(nearest), halfRoad: Math.round(halfRoad) };
    }, manifest);
  for (const [width, height] of [
    [768, 1024],
    [1024, 768],
    [1280, 720],
    [1440, 900],
    [1728, 1117],
  ]) {
    const view = await openPage(browser, { viewport: { width, height } });
    const max = await view.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const rows = [];
    for (const share of [0, 0.23, 0.51, 0.77]) {
      await view.evaluate((y) => window.scrollTo(0, y), Math.round(max * share));
      await view.mouse.wheel(0, 1);
      await view.waitForTimeout(1300);
      rows.push(await onRoad(view));
    }
    report(
      S,
      `${width}×${height}: ноги на полотне дороги в любой точке маршрута`,
      rows.every((r) => r && r.nearest <= r.halfRoad * 0.6),
      rows.map((r) => (r ? `${r.nearest}/${r.halfRoad}` : "нет")).join(", "),
    );
    await view.close();
  }

  // --- Скриншоты для глаз: шесть ширин, обе темы -----------------------------
  for (const scheme of ["light", "dark"]) {
    for (const [width, height] of [
      [390, 844],
      [768, 1024],
      [1024, 768],
      [1280, 720],
      [1440, 900],
      [1728, 1117],
    ]) {
      const view = await openPage(browser, { viewport: { width, height }, colorScheme: scheme });
      const max = await view.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      await view.evaluate((y) => window.scrollTo(0, y), Math.round(max * 0.16));
      await view.mouse.wheel(0, 1);
      await view.waitForTimeout(1500);
      await view.screenshot({ path: `${OUT}/b1-${scheme}-${width}.png` });
      await view.close();
    }
  }
}
