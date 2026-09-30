"use client";

import { UI } from "@/lib/content";
import type { Localized } from "@/lib/i18n";
import { cellLeft, depthTop, STOP_DEPTH, TOWN_HALF_WIDTH } from "@/lib/town";

/**
 * Снимок экрана по слоям для «Разбора сайта».
 *
 * Разбор строится не на живой странице, а на копиях. На живом DOM 3D не
 * получится: `preserve-3d` сплющивается от `opacity < 1`, `overflow: hidden`
 * и фильтров у любого предка, а панель и карта вообще `fixed`. Поэтому в
 * момент открытия каждый видимый элемент слоя клонируется в свою «пластину» и
 * ставится ровно туда, где он был на экране (`getBoundingClientRect`). Пока
 * пластины лежат на нуле по Z, оверлей совпадает с экраном пиксель в пиксель,
 * и раскрытие начинается без скачка.
 *
 * Копии — застывший кадр: CSS-анимации (дрейф облаков, партия на доске)
 * останавливаются на текущем значении, иначе новый элемент начал бы анимацию
 * с нуля, и облако прыгнуло бы в момент открытия.
 */

export type XrayLayerId =
  | "ground"
  | "road"
  | "town"
  | "walker"
  | "sky"
  | "text"
  | "landmarks"
  | "map"
  | "hud";

export type XrayLayer = {
  id: XrayLayerId;
  name: Localized;
  /** Одна строка о приёме — видна в списке всегда */
  note: Localized;
  /** «Подробнее»: как сделано и почему — под кликом */
  more: Localized;
  /** Где это в коде. Имена файлов не переводятся */
  files: string;
};

/**
 * Слои снизу вверх — в том же порядке, что и на сайте (порядок слоёв в
 * CLAUDE.md): персонаж идёт по дороге поверх городка (z-10 маршрута), небо со
 * светилом выше, текст остановок — z-20.
 */
export const XRAY_LAYERS: XrayLayer[] = [
  { id: "ground", name: UI.xrayGround, note: UI.xrayGroundNote, more: UI.xrayGroundMore, files: "globals.css · page.tsx" },
  { id: "road", name: UI.xrayRoad, note: UI.xrayRoadNote, more: UI.xrayRoadMore, files: "route-track.tsx · town.ts" },
  { id: "town", name: UI.xrayTown, note: UI.xrayTownNote, more: UI.xrayTownMore, files: "town.ts · scenery.tsx · house-room.tsx" },
  { id: "walker", name: UI.xrayWalker, note: UI.xrayWalkerNote, more: UI.xrayWalkerMore, files: "walker.tsx · prepare-walk.mjs" },
  { id: "sky", name: UI.xraySky, note: UI.xraySkyNote, more: UI.xraySkyMore, files: "clouds.tsx · constellations.tsx · sky.ts" },
  { id: "text", name: UI.xrayText, note: UI.xrayTextNote, more: UI.xrayTextMore, files: "route.ts · content.ts · minigame.tsx" },
  { id: "landmarks", name: UI.xrayLandmarks, note: UI.xrayLandmarksNote, more: UI.xrayLandmarksMore, files: "chess-scene.tsx · trophies.ts" },
  { id: "map", name: UI.xrayMap, note: UI.xrayMapNote, more: UI.xrayMapMore, files: "route-map.tsx · constellations.ts" },
  { id: "hud", name: UI.xrayHud, note: UI.xrayHudNote, more: UI.xrayHudMore, files: "hud.tsx · command-palette.tsx" },
];

type Hosts = Record<XrayLayerId, HTMLElement>;

/** Свойства, которыми копия прибивается к прямоугольнику оригинала. */
const PIN =
  ";position:absolute;inset:0;width:100%;height:100%;margin:0;transform:none;translate:none;rotate:none;scale:none;";

function inViewport(rect: DOMRect) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

/** Элементы страницы, но не копии из прошлого разбора. */
function pageAll(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.closest("[data-xray]"),
  );
}

/**
 * Классы с брейкпоинтом (`hidden md:block`, `md:grid-cols-2`) у копии живые:
 * повернули планшет или сузили окно — и копия перестраивается под новую
 * ширину, хотя снята со старой. Городок уже 768 прячется целиком, и в списке
 * слоёв на телефоне превью было бы пустым. Поэтому у таких узлов раскладка
 * вписывается инлайн — ровно такой, какой была в момент снимка.
 */
const RESPONSIVE = /(?:^|\s)(?:sm|md|lg|xl|2xl|max-[a-z0-9]+|min-\[[^\]]+\]|max-\[[^\]]+\]|dark:[a-z0-9]+):|(?:^|\s)hidden(?:\s|$)/;
const PINNED = [
  "display",
  "gridTemplateColumns",
  "flexDirection",
  "alignItems",
  "justifyContent",
  "order",
  "width",
  "maxWidth",
  "left",
  "right",
  "top",
  "bottom",
  "marginLeft",
  "marginRight",
  "marginTop",
  "marginBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingBottom",
  "columnGap",
  "rowGap",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "textAlign",
] as const;

function pinResponsive(node: Element, twin: HTMLElement | SVGElement) {
  const classes = node.getAttribute("class");
  if (!classes || !RESPONSIVE.test(classes)) return;
  const style = getComputedStyle(node);
  for (const prop of PINNED) twin.style[prop] = style[prop];
}

/**
 * Застывший кадр: у каждой копии элемента с живой анимацией снимаем
 * анимацию и вписываем текущее значение transform и opacity.
 */
function freeze(original: Element, copy: Element, animated: Set<Element>) {
  const originals = [original, ...original.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  originals.forEach((node, index) => {
    const twin = copies[index] as HTMLElement | SVGElement | undefined;
    if (!twin) return;
    // id у HTML-копий снимаем: дубли ломали бы переходы по якорям. У SVG
    // оставляем — на них ссылаются градиенты и маски через url(#id), а дубль
    // разрешается в оригинал, который остаётся в документе
    if (twin instanceof HTMLElement) twin.removeAttribute("id");
    pinResponsive(node, twin);
    if (!animated.has(node)) return;
    const style = getComputedStyle(node);
    twin.style.animation = "none";
    twin.style.transition = "none";
    twin.style.transform = style.transform;
    twin.style.opacity = style.opacity;
  });
}

/**
 * Копия — застывшая картинка внутри одной пластины, и всё, что просит у
 * браузера отдельный слой композиции, ей только вредит:
 *
 * - `backdrop-filter` (стеклянные кнопки панели, подписи карты) размывает
 *   подложку заново на каждом кадре, а под наклонённой пластиной — ещё и
 *   через отдельную поверхность. Одна копия панели роняла вращение до 33
 *   кадров в секунду; размывать под копией всё равно нечего;
 * - `will-change` (облака, полоса кадров персонажа) выносит элемент в свой
 *   слой внутри пластины, а копия не двигается.
 *
 * Снимается инлайн-стилем: он перебивает классы.
 */
function flatten(host: HTMLElement) {
  for (const el of host.querySelectorAll<HTMLElement | SVGElement>("*")) {
    const style = getComputedStyle(el);
    if (style.backdropFilter !== "none") el.style.backdropFilter = "none";
    if (style.willChange !== "auto") el.style.willChange = "auto";
  }
}

/** Скопировать элемент в пластину на его место на экране. */
function place(host: HTMLElement, el: HTMLElement, animated: Set<Element>, deep = true) {
  const rect = el.getBoundingClientRect();
  const frame = document.createElement("div");
  frame.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
  const copy = el.cloneNode(deep) as HTMLElement;
  if (deep) freeze(el, copy, animated);
  else copy.removeAttribute("id");
  copy.style.cssText += PIN;
  frame.append(copy);
  host.append(frame);
  return copy;
}

/**
 * Контейнер во всю длину маршрута (облака, созвездия) копируется пустым, а
 * внутрь кладутся только дети, попавшие в экран: остальные сорок облаков
 * пластине не нужны.
 */
function placeVisibleChildren(host: HTMLElement, container: HTMLElement, animated: Set<Element>) {
  const shell = place(host, container, animated, false);
  for (const child of Array.from(container.children) as HTMLElement[]) {
    if (!inViewport(child.getBoundingClientRect())) continue;
    const copy = child.cloneNode(true) as HTMLElement;
    freeze(child, copy, animated);
    shell.append(copy);
  }
}

/**
 * Изо-сетка клеток поверх городка — по карте `town.ts`, а не на глаз.
 *
 * Клетка (x, d) стоит там же, где её ставит городок: x — `cellLeft` базовых
 * пикселей от осевой, умноженных на `--town-unit`; d — `depthTop` процентов
 * высоты остановки. Линия «u = const» — это x + d = 2u, «v = const» —
 * d − x = 2v. Внутри остановки обе прямые, поэтому хватает концов отрезка;
 * на стыке остановок линии продолжаются, потому что глубина остановки чётная.
 * Зеркало левых остановок сетку не меняет: оно лишь меняет u и v местами.
 */
function buildGrid(host: HTMLElement) {
  const road = pageAll("[data-road]").find((el) => el.getBoundingClientRect().width > 0);
  if (!road) return;
  const roadRect = road.getBoundingClientRect();
  // Один базовый пиксель городка на экране — ширина дороги ровно 2 × TOWN_HALF_WIDTH базовых
  const unit = roadRect.width / (TOWN_HALF_WIDTH * 2);
  const axis = roadRect.width / 2;
  const halfCells = TOWN_HALF_WIDTH / cellLeft(1);
  const kFrom = Math.floor(-halfCells / 2) - 1;
  const kTo = Math.ceil((halfCells + STOP_DEPTH) / 2) + 1;

  const segments: string[] = [];
  for (const stop of pageAll("[data-stop]")) {
    const rect = stop.getBoundingClientRect();
    if (!inViewport(rect)) continue;
    const point = (x: number, d: number) => {
      const px = axis + cellLeft(x) * unit;
      const py = rect.top + (depthTop(d) / 100) * rect.height;
      return `${px.toFixed(1)} ${py.toFixed(1)}`;
    };
    for (let k = kFrom; k <= kTo; k += 1) {
      segments.push(`M${point(2 * k, 0)}L${point(2 * k - STOP_DEPTH, STOP_DEPTH)}`);
      segments.push(`M${point(-2 * k, 0)}L${point(STOP_DEPTH - 2 * k, STOP_DEPTH)}`);
    }
  }

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", String(roadRect.width));
  svg.setAttribute("height", String(window.innerHeight));
  svg.setAttribute("viewBox", `0 0 ${roadRect.width} ${window.innerHeight}`);
  svg.style.cssText = `position:absolute;top:0;left:${roadRect.left}px;overflow:hidden;`;
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", segments.join(""));
  // Цвет — токеном акцента: сетка перекрашивается вместе с темой
  path.style.cssText = "fill:none;stroke:var(--color-accent);stroke-opacity:0.5;stroke-width:1;";
  svg.append(path);
  host.append(svg);
}

/**
 * Разложить текущий экран по пластинам. Возвращает промис, который
 * разрешается, когда картинки копий декодированы (или через 180 мс —
 * дольше открытие не ждёт): иначе в первый кадр дом мигнул бы пустотой.
 */
export function captureLayers(hosts: Hosts, ground: HTMLElement, grid: HTMLElement) {
  // Кто сейчас анимируется: CSS-анимации, переходы и WAAPI Motion
  const animated = new Set<Element>();
  for (const animation of document.getAnimations()) {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    if (target) animated.add(target);
  }

  // Земля: фон страницы с изо-сеткой и свечением. Сетка `main` — градиент во
  // всю высоту страницы; чтобы узор лёг в фазу, пластина берёт тот же размер
  // фона и ту же позицию
  const main = pageAll("main.iso-grid")[0];
  if (main) {
    const rect = main.getBoundingClientRect();
    ground.style.backgroundSize = `${rect.width}px ${rect.height}px`;
    ground.style.backgroundPosition = `${rect.left}px ${rect.top}px`;
    const glow = main.querySelector<HTMLElement>(':scope > [class~="-z-10"]');
    if (glow) place(hosts.ground, glow, animated);
  }

  const visible = (selector: string) =>
    pageAll(selector).filter((el) => inViewport(el.getBoundingClientRect()));

  // Дорога и зарубки остановок на ней
  for (const el of visible("[data-road]")) place(hosts.road, el, animated);
  for (const el of visible("[data-stop] > .stop-mark")) place(hosts.road, el, animated);

  // Городок: дома и декор по остановкам
  for (const el of visible("[data-stop] > .town-layer")) place(hosts.town, el, animated);
  buildGrid(grid);

  // Персонаж: тень под ногами и та из четырёх поз, что сейчас видна. Сам
  // `[data-walker]` — точка нулевого размера, копировать нечего: кадр — это
  // окно `[data-walker-frame]`, а сдвиг полосы в нём — инлайн-стиль, он
  // клонируется вместе с элементом
  for (const el of visible("[data-walker] > :first-child, [data-walker-frame]")) {
    if (getComputedStyle(el).visibility === "visible") place(hosts.walker, el, animated);
  }

  // Небо: облака и их тени, светило, созвездия (последние — только ночью)
  const clouds = pageAll("[data-sky]")[0]?.parentElement;
  if (clouds) placeVisibleChildren(hosts.sky, clouds, animated);
  for (const el of visible("[data-sky-body]")) place(hosts.sky, el, animated);
  const stars = pageAll("[data-constellation]")[0]?.parentElement;
  if (stars && stars.getBoundingClientRect().width > 0) {
    placeVisibleChildren(hosts.sky, stars, animated);
  }

  // Текст остановок — колонка над городком (z-20)
  for (const el of visible("[data-stop] > .z-20")) place(hosts.text, el, animated);

  // Площадки между остановками, карта маршрута, верхняя панель
  for (const el of visible("[data-landmark]")) place(hosts.landmarks, el, animated);
  for (const el of visible("[data-route-map]")) place(hosts.map, el, animated);
  for (const el of visible("[data-hud]")) place(hosts.hud, el, animated);

  Object.values(hosts).forEach(flatten);

  // Масштаб городка — `--town-unit` из vw и vh: на другой ширине копии домов
  // выросли бы или сжались. Пластины получают его значение в пикселях на
  // момент снимка (и `--town-k` — то же число без единиц). Меряется тысяча
  // единиц: одна (0,84px) округлилась бы до шага раскладки в 1/64 пикселя, и
  // дом уехал бы на 10px
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;width:calc(var(--town-unit) * 1000);height:0";
  document.body.append(probe);
  const unit = probe.getBoundingClientRect().width / 1000;
  probe.remove();
  for (const host of [...Object.values(hosts), ground]) {
    host.style.setProperty("--town-unit", `${unit}px`);
    host.style.setProperty("--town-k", String(unit));
  }

  const images = Object.values(hosts).flatMap((host) => Array.from(host.querySelectorAll("img")));
  const decoded = Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  return Promise.race([decoded, new Promise((resolve) => setTimeout(resolve, 180))]).then(
    () => undefined,
  );
}

/** Убрать копии — при закрытии и при повторном прогоне эффекта в StrictMode. */
export function clearLayers(hosts: Hosts, grid: HTMLElement) {
  Object.values(hosts).forEach((host) => host.replaceChildren());
  grid.replaceChildren();
}

/**
 * Превью слоя для режима списка — копия уже разложенной пластины (земля,
 * копии, сетка) в уменьшенной карточке. Служебные data-атрибуты у копий
 * снимаются: на странице должна остаться одна пластина каждого слоя.
 */
export function fillThumb(thumb: HTMLElement, clip: HTMLElement) {
  const copies = Array.from(clip.children, (child) => {
    const copy = child.cloneNode(true) as HTMLElement;
    copy.removeAttribute("data-xray-host");
    copy.removeAttribute("data-xray-grid");
    return copy;
  });
  thumb.replaceChildren(...copies);
}

/**
 * Где на экране лежат копии слоя — чтобы превью показывало их крупно, а не
 * точкой в углу пустого экрана. Считается по рамкам копий (`place` ставит их
 * инлайн-стилями), обрезанным по экрану. Пустой слой — `null`.
 */
export function contentBox(host: HTMLElement, width: number, height: number) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const frame of Array.from(host.children) as HTMLElement[]) {
    const x = parseFloat(frame.style.left);
    const y = parseFloat(frame.style.top);
    const w = parseFloat(frame.style.width);
    const h = parseFloat(frame.style.height);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    left = Math.min(left, Math.max(0, x));
    top = Math.min(top, Math.max(0, y));
    right = Math.max(right, Math.min(width, x + w));
    bottom = Math.max(bottom, Math.min(height, y + h));
  }
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

/**
 * Страница под разбором, которую на время разбора прячем. Её не видно — разбор
 * закрывает экран непрозрачным фоном, — но облака, рой у курсора и партия на
 * доске анимируются, и каждый их кадр заставлял браузер заново собирать всю
 * стопку пластин: при открытом разборе на CPU×4 выходило 10 кадров в секунду.
 * `visibility`, а не `display`: раскладка страницы не меняется, и после
 * закрытия она на том же месте.
 */
const PAGE_LAYERS = "main, [data-hud], [data-route-map], [data-cursor-swarm]";

/** Спрятать страницу. Возвращает функцию, которая вернёт всё как было. */
export function hidePage() {
  const hidden = pageAll(PAGE_LAYERS);
  const before = hidden.map((el) => el.style.visibility);
  hidden.forEach((el) => {
    el.style.visibility = "hidden";
  });
  return () => {
    hidden.forEach((el, index) => {
      el.style.visibility = before[index];
    });
  };
}
