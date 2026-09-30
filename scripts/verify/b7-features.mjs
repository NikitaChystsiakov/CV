/**
 * Блок 7 «Интересные фичи» (30.09.2026): ссылка на остановку и панель
 * находок в верхней панели.
 */

export const stage = "Б7";
const S = stage;

export async function run({ browser, report, BASE, OUT, routeStopIds }) {
  const ids = routeStopIds();
  const target = ids[Math.min(3, ids.length - 1)];

  const open = async (url, options = {}, init) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...options });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.errors = errors;
    if (init) await page.addInitScript(init);
    await page.goto(url, { waitUntil: "networkidle" });
    return page;
  };

  // --- Ссылка на остановку: приезд и адрес, который идёт за маршрутом -------------
  for (const [label, options] of [
    ["1440", {}],
    ["reduced-motion", { reducedMotion: "reduce" }],
    ["390", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ]) {
    const page = await open(`${BASE}/#${target}`, options);
    await page.waitForTimeout(2200);
    const where = await page.evaluate((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      const mid = (r.top + r.bottom) / 2;
      return { mid: Math.round(mid), vh: innerHeight };
    }, target);
    report(
      S,
      `${label}: по ссылке /#${target} остановка приезжает в середину экрана`,
      Math.abs(where.mid - where.vh / 2) < where.vh * 0.12,
      JSON.stringify(where),
    );
    report(S, `${label}: приезд без ошибок`, page.errors.length === 0, page.errors.slice(0, 2).join(" | "));
    await page.close();
  }

  const walk = await open(BASE);
  await walk.waitForTimeout(600);
  const next = ids[2];
  await walk.evaluate((id) => document.getElementById(id).scrollIntoView({ block: "center" }), next);
  await walk.mouse.wheel(0, 1);
  await walk.waitForTimeout(1500);
  const hash = await walk.evaluate(() => location.hash);
  report(S, "адрес идёт за маршрутом: хэш — текущая остановка", hash === `#${next}`, `хэш ${hash || "пусто"}, ждали #${next}`);
  const history = await walk.evaluate(() => history.length);
  report(S, "прогулка не засоряет историю браузера", history <= 2, `записей в истории: ${history}`);
  await walk.close();

  // --- Панель находок ------------------------------------------------------------
  const page = await open(BASE);
  await page.waitForTimeout(600);
  const trigger = page.locator("[data-achievements-trigger]");
  report(S, "в верхней панели есть счётчик находок", (await trigger.count()) === 1 && (await trigger.isVisible()));
  const before = await page.locator("[data-achievements-count]").textContent();
  await trigger.click();
  await page.waitForTimeout(300);
  const panel = await page.evaluate(() => ({
    items: document.querySelectorAll("[data-achievements-panel] [data-achievement]").length,
    expanded: document.querySelector("[data-achievements-trigger]").getAttribute("aria-expanded"),
  }));
  report(S, "панель находок открывается и перечисляет пять групп", panel.items === 5 && panel.expanded === "true", JSON.stringify(panel));
  await page.screenshot({ path: `${OUT}/b7-achievements-light.png` });

  // Открытие где угодно на странице сразу отражается в счётчике
  await page.evaluate(async () => {
    const mod = sessionStorage.getItem("cv-unlocked");
    sessionStorage.setItem("cv-unlocked", JSON.stringify([...(mod ? JSON.parse(mod) : []), "volleyball:three-in-a-row"]));
    window.dispatchEvent(new Event("cv-unlocked"));
  });
  await page.waitForTimeout(200);
  const after = await page.locator("[data-achievements-count]").textContent();
  const doneVolley = await page.locator('[data-achievement="volleyball"][data-done]').count();
  report(S, "счётчик реагирует на открытие без перезагрузки", before !== after && doneVolley === 1, `${before} → ${after}`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const closed = await page.evaluate(() => ({
    panel: Boolean(document.querySelector("[data-achievements-panel]")),
    focus: document.activeElement?.hasAttribute("data-achievements-trigger"),
  }));
  report(S, "Escape закрывает панель и возвращает фокус на счётчик", !closed.panel && closed.focus, JSON.stringify(closed));
  await page.close();

  // Английская версия — без кириллицы и длинных тире
  const en = await open(BASE, {}, () => sessionStorage.setItem("cv-lang", "en"));
  await en.waitForTimeout(600);
  await en.locator("[data-achievements-trigger]").click();
  await en.waitForTimeout(300);
  const enText = await en.locator("[data-achievements-panel]").textContent();
  report(S, "панель находок на английском — без кириллицы и тире", !/[а-яё]/i.test(enText) && !enText.includes("—"), enText.slice(0, 80));
  await en.close();

  const dark = await open(BASE, { colorScheme: "dark" });
  await dark.waitForTimeout(600);
  await dark.locator("[data-achievements-trigger]").click();
  await dark.waitForTimeout(300);
  await dark.screenshot({ path: `${OUT}/b7-achievements-dark.png` });
  await dark.close();

  const narrow = await open(BASE, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  report(S, "390px: верхняя панель без счётчика и без горизонтальной прокрутки", overflow <= 1, `перебор ${overflow}px`);
  await narrow.close();
}
