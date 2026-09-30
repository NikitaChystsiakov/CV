/**
 * Блок 4 «Интерьеры комнат» (30.09.2026).
 *
 * CSS-комната получила свет: окно с небом по теме, пятно света, тени в углах,
 * предметы на полке трофеев из ассетов владельца. И слот под интерьер
 * картинкой (ROOM_ART): есть файл — фоном идёт арт, контент на точках. Файлов
 * пока нет, поэтому режим картинки проверяется на dev-превью с фикстурой.
 */

import { readFileSync } from "node:fs";

export const stage = "Б4";
const S = stage;

export async function run({ browser, openPage, report, BASE, OUT }) {
  const openRoom = async (options) => {
    const page = await openPage(browser, options);
    const trigger = page.locator('[data-room-trigger="experience"]:visible').first();
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await trigger.click();
    await page.waitForTimeout(1600);
    return page;
  };

  // --- Свет и окно в обеих темах ------------------------------------------------
  const skies = {};
  for (const scheme of ["light", "dark"]) {
    const page = await openRoom({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const state = await page.evaluate(() => {
      const win = document.querySelector("[data-room] [data-room-window]");
      const r = win?.getBoundingClientRect();
      return {
        window: Boolean(r && r.width > 20 && r.height > 20),
        sky: win ? getComputedStyle(win).backgroundImage : "",
        shade: document.querySelectorAll("[data-room] .room-shade").length,
      };
    });
    skies[scheme] = state.sky;
    report(S, `${scheme}: в комнате окно с небом и тени в углах`, state.window && state.sky.includes("gradient") && state.shade >= 2, JSON.stringify({ ...state, sky: state.sky.slice(0, 40) }));

    // Предметы на полке: ассеты владельца, не поверх текста
    const shelf = await page.evaluate(() => {
      const chess = document.querySelector('[data-room-trophy="chess"] img');
      const ball = document.querySelector('[data-room-trophy="volleyball"] svg');
      const texts = [...document.querySelectorAll("[data-room-shelf-trophies] p")].map((p) => p.getBoundingClientRect());
      const hits = [];
      for (const el of document.querySelectorAll("[data-room-trophy]")) {
        const r = el.getBoundingClientRect();
        for (const t of texts) {
          const w = Math.min(r.right, t.right) - Math.max(r.left, t.left);
          const h = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top);
          if (w > 2 && h > 2) hits.push(el.dataset.roomTrophy);
        }
      }
      return {
        chess: Boolean(chess && chess.naturalWidth > 0 && decodeURIComponent(chess.currentSrc || chess.src).includes("/scene/king")),
        ball: Boolean(ball && ball.getBoundingClientRect().width > 8),
        hits,
      };
    });
    report(S, `${scheme}: на полке трофеев стоят фигура и мяч — ассет владельца и мяч кодом`, shelf.chess && shelf.ball, JSON.stringify(shelf));
    report(S, `${scheme}: предметы на полке не заходят на подписи`, shelf.hits.length === 0, shelf.hits.join(", "));
    await page.screenshot({ path: `${OUT}/b4-room-${scheme}-1440.png` });
    report(S, `${scheme}: комната без ошибок в консоли`, page.errors.length === 0, page.errors.slice(0, 2).join(" | "));
    await page.close();
  }
  report(S, "небо в окне меняется вместе с темой", skies.light && skies.dark && skies.light !== skies.dark);

  const tablet = await openRoom({ viewport: { width: 1024, height: 768 } });
  await tablet.screenshot({ path: `${OUT}/b4-room-light-1024.png` });
  await tablet.close();

  // --- Узкий экран и reduced-motion — плоская панель, без окна ---------------------
  for (const [label, options] of [
    ["390px", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
    ["reduced-motion", { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }],
  ]) {
    const page = await openRoom(options);
    const flat = await page.evaluate(() => ({
      flat: Boolean(document.querySelector("[data-room] .room-flat")),
      window: Boolean(document.querySelector("[data-room] [data-room-window]")),
    }));
    report(S, `${label}: комната — плоская панель, окна и перспективы нет`, flat.flat && !flat.window, JSON.stringify(flat));
    await page.close();
  }

  // --- Интерьер картинкой: dev-превью с фикстурой ------------------------------------
  const devSrc = readFileSync("src/app/dev/room/page.tsx", "utf8");
  report(S, "dev-превью комнаты в проде отдаёт 404", /NODE_ENV === "production"\) notFound\(\)/.test(devSrc));
  const art = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  art.on("pageerror", (e) => errors.push(String(e)));
  await art.goto(`${BASE}/dev/room?art=1`, { waitUntil: "networkidle" });
  await art.waitForTimeout(1200);
  const layout = await art.evaluate(() => {
    const stage = document.querySelector("[data-room-art]");
    const box = stage?.getBoundingClientRect();
    if (!box) return null;
    const slots = [...stage.querySelectorAll("[data-room-slot]")].map((el) => ({
      name: el.dataset.roomSlot,
      r: el.getBoundingClientRect(),
    }));
    const inside = slots.every(
      ({ r }) => r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1,
    );
    let overlap = 0;
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const a = slots[i].r;
        const b = slots[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 0 && h > 0) overlap += 1;
      }
    }
    const img = stage.querySelector("img");
    return {
      width: Math.round(box.width),
      ratio: +(box.width / box.height).toFixed(2),
      natural: img ? +(img.naturalWidth / img.naturalHeight).toFixed(2) : 0,
      slots: slots.map((s) => s.name),
      inside,
      overlap,
      inViewport: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
    };
  });
  report(
    S,
    "интерьер картинкой: фон — арт в своих пропорциях, в кадре целиком",
    Boolean(layout) && Math.abs(layout.ratio - layout.natural) < 0.03 && layout.inViewport,
    JSON.stringify(layout),
  );
  report(
    S,
    "интерьер картинкой: слоты стоят на своих точках внутри арта и не налезают друг на друга",
    Boolean(layout) && layout.slots.length > 0 && layout.inside && layout.overlap === 0,
    JSON.stringify(layout),
  );
  report(S, "интерьер картинкой: без ошибок", errors.length === 0, errors.slice(0, 2).join(" | "));
  await art.screenshot({ path: `${OUT}/b4-room-art-fixture.png` });
  await art.close();
}
