/**
 * Блок 2 «Город, а не выставка предметов» (29.09.2026).
 *
 * Претензия владельца — «между домами пусто, улица читается как каталог».
 * Проверяем то, что на скриншоте легко пропустить: пустые экраны на
 * какой-то одной ширине, фоновый дом, вылезший поверх дома маршрута, задник
 * крупнее главных домов, заголовок, утонувший в декоре.
 */

export const stage = "Б2";
const S = stage;

/** Ширины, на которых рисуется городок (от 768), и два «низких» ноутбука. */
const VIEWS = [
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1280, 800],
  [1440, 900],
  [1728, 1117],
];

/** Минимум объектов городка в кадре на любом участке маршрута. */
const MIN_OBJECTS = 6;

export async function run({ browser, openPage, report, OUT }) {
  for (const [width, height] of VIEWS) {
    const view = await openPage(browser, { viewport: { width, height } });

    // --- Плотность: едем по маршруту по полэкрана ------------------------------
    const route = await view.evaluate(() => {
      const r = document.getElementById("route").getBoundingClientRect();
      return { top: r.top + scrollY, bottom: r.bottom + scrollY };
    });
    const counts = [];
    for (let y = route.top; y + height <= route.bottom; y += height / 2) {
      await view.evaluate((to) => window.scrollTo(0, to), Math.round(y));
      await view.waitForTimeout(120);
      counts.push(
        await view.evaluate(() => {
          const vw = innerWidth;
          const vh = innerHeight;
          const seen = [
            ...document.querySelectorAll("[data-scenery], [data-scene-object], [data-backdrop], [data-landmark]"),
          ].filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return false;
            const w = Math.min(r.right, vw) - Math.max(r.left, 0);
            const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
            // Считаем объект, если в кадре хотя бы треть его площади
            return w > 0 && h > 0 && (w * h) / (r.width * r.height) > 0.33;
          });
          return seen.length;
        }),
      );
    }
    report(
      S,
      `${width}×${height}: нет пустых экранов — в любом кадре маршрута ≥ ${MIN_OBJECTS} объектов городка`,
      counts.length > 0 && Math.min(...counts) >= MIN_OBJECTS,
      `минимум ${Math.min(...counts)}, по кадрам: ${counts.join(" ")}`,
    );

    // --- Задник: за домами маршрута и мельче их --------------------------------
    const backdrop = await view.evaluate(async () => {
      // Слой городка не принимает указатель; для elementsFromPoint включаем
      // его на время замера, иначе картинок в списке не будет
      const style = document.createElement("style");
      style.textContent = "[data-backdrop] img, [data-scene-object] img { pointer-events: auto !important; }";
      document.head.append(style);
      const total = document.documentElement.scrollHeight;
      let covered = 0;
      let wrong = 0;
      let checked = 0;
      let maxShare = 0;
      let maxOpacity = 0;
      for (let y = 0; y < total; y += innerHeight * 0.8) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const houses = [...document.querySelectorAll("[data-scene-object] img")]
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 1 && r.bottom > 0 && r.top < innerHeight);
        const backs = [...document.querySelectorAll("[data-backdrop] img")]
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 1 && r.bottom > 0 && r.top < innerHeight);
        for (const b of backs) {
          // Итоговая прозрачность — произведение по предкам: она может стоять
          // и на самом доме, и на слое задника
          let effective = 1;
          for (let node = b.el; node && node !== document.body; node = node.parentElement) {
            effective *= parseFloat(getComputedStyle(node).opacity);
          }
          maxOpacity = Math.max(maxOpacity, +effective.toFixed(3));
          for (const h of houses) {
            maxShare = Math.max(maxShare, b.r.width / h.r.width);
            const left = Math.max(b.r.left, h.r.left, 0);
            const right = Math.min(b.r.right, h.r.right, innerWidth);
            const top = Math.max(b.r.top, h.r.top, 0);
            const bottom = Math.min(b.r.bottom, h.r.bottom, innerHeight);
            if (right - left < 6 || bottom - top < 6) continue;
            covered += 1;
            // Точка внутри пересечения: какой из двух объектов нарисован выше
            const stack = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2);
            const hi = stack.indexOf(h.el);
            const bi = stack.indexOf(b.el);
            if (hi === -1 || bi === -1) continue;
            checked += 1;
            if (bi < hi) wrong += 1;
          }
        }
      }
      style.remove();
      return { covered, checked, wrong, maxShare, maxOpacity };
    });
    report(
      S,
      `${width}px: фоновые дома нарисованы под домами маршрута`,
      backdrop.wrong === 0,
      `пересечений ${backdrop.covered}, проверено ${backdrop.checked}, поверх дома — ${backdrop.wrong}`,
    );
    report(
      S,
      `${width}px: фоновый дом мельче дома маршрута и бледнее`,
      backdrop.maxShare > 0 && backdrop.maxShare <= 0.65 && backdrop.maxOpacity <= 0.6,
      `ширина до ${Math.round(backdrop.maxShare * 100)}% дома, прозрачность до ${backdrop.maxOpacity}`,
    );

    // --- Заголовки остановок не тонут в городке ---------------------------------
    const text = await view.evaluate(async () => {
      const bad = [];
      let scrim = 0;
      for (const stop of document.querySelectorAll("[data-stop]")) {
        const heading = stop.querySelector("h1, h2");
        if (!heading) continue;
        heading.scrollIntoView({ block: "center" });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const copy = heading.closest(".stop-copy");
        if (copy && getComputedStyle(copy, "::before").backgroundImage.includes("gradient")) scrim += 1;
        const h = heading.getBoundingClientRect();
        const area = h.width * h.height;
        for (const img of document.querySelectorAll("[data-scenery] img, [data-scene-object] img, [data-backdrop] img")) {
          const r = img.getBoundingClientRect();
          const w = Math.min(r.right, h.right) - Math.max(r.left, h.left);
          const hh = Math.min(r.bottom, h.bottom) - Math.max(r.top, h.top);
          if (w > 0 && hh > 0 && (w * hh) / area > 0.35) bad.push(`${stop.dataset.stop}: ${Math.round(((w * hh) / area) * 100)}%`);
        }
      }
      return { bad, scrim, stops: document.querySelectorAll("[data-stop]").length };
    });
    report(
      S,
      `${width}px: под каждым заголовком — подложка цвета фона, картинки городка не закрывают его больше чем на треть`,
      text.bad.length === 0 && text.scrim === text.stops,
      text.bad.length ? text.bad.slice(0, 4).join("; ") : `подложек ${text.scrim} из ${text.stops}`,
    );

    report(S, `${width}px: без ошибок в консоли`, view.errors.length === 0, view.errors.slice(0, 2).join(" | "));
    await view.close();
  }

  // --- Волейбольная площадка у дороги (от 1280) ---------------------------------
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.locator('[data-landmark="volleyball"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const court = await page.evaluate(() => {
    const holder = document.querySelector('[data-landmark="volleyball"]');
    if (!holder) return null;
    const img = [...holder.querySelectorAll("img")].find((el) =>
      decodeURIComponent(el.currentSrc || el.src).includes("volleyball-court"),
    );
    const r = img?.getBoundingClientRect();
    if (!r) return { present: true, art: false };
    const hits = [];
    for (const el of document.querySelectorAll("[data-scenery] img, [data-backdrop] img, [data-scene-object] img")) {
      const q = el.getBoundingClientRect();
      const w = Math.min(q.right, r.right) - Math.max(q.left, r.left);
      const h = Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top);
      if (w <= 0 || h <= 0) continue;
      const share = (w * h) / Math.min(q.width * q.height, r.width * r.height);
      if (share > 0.12) hits.push(`${decodeURIComponent(el.currentSrc || el.src).match(/scene\/([\w.-]+)/)?.[1]} ${Math.round(share * 100)}%`);
    }
    const house = [...document.querySelectorAll("[data-scene-object] img")].map((el) => el.getBoundingClientRect().width).filter(Boolean);
    return { present: true, art: true, width: r.width, house: Math.max(...house), hits, ball: Boolean(holder.querySelector('[fill="var(--color-ball)"]')) };
  });
  report(S, "волейбольная площадка стоит на маршруте — корт из ассета, мяч поверх", Boolean(court?.art && court.ball), JSON.stringify(court));
  report(
    S,
    "вокруг площадки зона отчуждения: декор и задник на корт не заходят",
    Boolean(court) && court.hits?.length === 0,
    court?.hits?.join("; ") || "",
  );
  report(
    S,
    "корт — деталь у дороги, а не здание: уже дома маршрута",
    Boolean(court?.width) && court.width < court.house * 0.8,
    court ? `${Math.round(court.width)} против ${Math.round(court.house)}px` : "",
  );
  await page.screenshot({ path: `${OUT}/b2-volleyball-1440.png` });
  await page.close();

  // --- Скриншоты для глаз: шесть ширин, обе темы, два места маршрута -------------
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
      const max = await view.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      for (const share of [0.38, 0.72]) {
        await view.evaluate((y) => window.scrollTo(0, y), Math.round(max * share));
        await view.mouse.wheel(0, 1);
        await view.waitForTimeout(1200);
        await view.screenshot({ path: `${OUT}/b2-${scheme}-${width}x${height}-${Math.round(share * 100)}.png` });
      }
      await view.close();
    }
  }
}
