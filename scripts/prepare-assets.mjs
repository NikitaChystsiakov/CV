#!/usr/bin/env node
/**
 * Подготовка ассетов владельца к сцене.
 *
 *   assets-src/     — исходники как их отдал генератор, руками не трогаем.
 *                     Они лежат вне public: иначе семнадцать мегабайт исходников
 *                     уезжали бы в раздачу вместе с сайтом
 *   public/scene/   — то, что реально грузит сайт
 *
 * Что делает подготовка:
 *   1. Возвращает прозрачность там, где генератор залил фон (chessboard, fence).
 *   2. Вырезает однотонный фон-хромакей (персонаж и жители приходят на
 *      пурпурном #FF00FF: зелёный съел бы бирюзовый свитер и траву).
 *   3. Чистит кайму у ассетов, пришедших уже вырезанными (`defringe`): см.
 *      функцию `defringe` ниже.
 *   4. Для фоновых кварталов (`tones`) пишет ещё два варианта тона — теплее и
 *      холоднее: ряд из одного ассета не читается повтором, а CSS-фильтров на
 *      десятках картинок нет — они дорого растеризуются на каждом кадре.
 *   5. Обрезает по объекту и ужимает до рабочего размера в WebP: исходники
 *      весят по полтора мегабайта, в сцене столько не нужно.
 *
 * Подложку под объектом — кусок газона или грунта — НЕ трогает. Это решение
 * владельца: он генерирует её намеренно, чтобы объект стоял на земле, а не
 * висел в воздухе. Попытка срезать её автоматически была и отменена.
 *
 *   node scripts/prepare-assets.mjs            все ассеты
 *   node scripts/prepare-assets.mjs bench      только один
 */

import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import sharp from "sharp";

const SRC = "assets-src";
const OUT = "public/scene";
const MANIFEST = "src/lib/scene-manifest.json";

/**
 * Что готовим. `width` — ширина в готовом файле; берётся вдвое больше той, с
 * какой ассет показывается на экране, чтобы хватило на ретину.
 */
const ASSETS = {
  // Дома маршрута
  skillsHouse: { width: 1040 },
  technologiesHouse: { width: 1040 },
  casesHouse: { width: 1040 },
  experienseHouse: { width: 1040 },
  AboutmeHouse: { width: 1040 },
  house: { width: 1040 },
  arch: { width: 1040 },
  end: { width: 1040 },

  // Окружение
  bench: { width: 420 },
  tree: { width: 360 },
  pine: { width: 360 },
  bush: { width: 300 },
  flashlight: { width: 300 },
  fence: { width: 420, background: "dark" },
  flowerbed: { width: 300 },
  workbench: { width: 420 },
  "volleyball-court": { width: 640 },

  // Фоновые кварталы: дом пришёл уже вырезанным, но с каймой и чуть
  // прозрачным телом. На экране он мельче домов маршрута (~280 базовых px)
  "bg-house-1": { width: 560, defringe: true, tones: true },

  // Шахматы. Стол пришёл с именем от генератора — переименовываем на выходе
  "b380fe00-9fd3-45ec-ad3c-7e447db627d1_b45ff9eb4bf5": { width: 640, as: "table" },
  chessboard: { width: 640, background: "dark" },
  king: { width: 150 },
  queen: { width: 150 },
  rook: { width: 150 },
  bishop: { width: 150 },
  knigt: { width: 150, as: "knight" },
  pawn: { width: 150 },

  // Интерьеры домов (блок 4): слот под арт владельца. Файла нет — строка
  // ждёт: конвейер берёт только то, что лежит в assets-src. Появится
  // `room-<id>.png` — комната дома перейдёт на картинку (src/lib/room-art.ts)
  "room-experience": { width: 2400 },
  "room-cases": { width: 2400 },
  "room-tech": { width: 2400 },
  "room-about": { width: 2400 },

  // Персонаж — не здесь: он приходит роликами, их режет `prepare-walk.mjs`
  // (`npm run walk`). Опорные картинки (character*.png) в сцену не идут
};

/**
 * Два допуска вместо одного: от цвета старта заливке разрешено уйти далеко
 * (на подложке лежит тень, и она темнее травы), но между соседними пикселями
 * шаг должен быть маленьким. Иначе заливка перепрыгивает с газона на объект.
 */
const TOLERANCE_ORIGIN = 78;
const TOLERANCE_STEP = 24;

function close(data, offsetA, offsetB, tolerance) {
  return (
    Math.abs(data[offsetA] - data[offsetB]) <= tolerance &&
    Math.abs(data[offsetA + 1] - data[offsetB + 1]) <= tolerance &&
    Math.abs(data[offsetA + 2] - data[offsetB + 2]) <= tolerance
  );
}

/** Заливка от списка стартовых точек: гасит альфу у всего, что похоже по цвету. */
function flood(data, width, height, seeds) {
  const stack = [];
  const seen = new Uint8Array(width * height);

  for (const [sx, sy] of seeds) {
    const index = sy * width + sx;
    if (data[index * 4 + 3] === 0 || seen[index]) continue;
    seen[index] = 1;
    stack.push([index, index]);
  }

  let cleared = 0;
  const drop = [];
  while (stack.length) {
    const [index, origin] = stack.pop();
    drop.push(index);
    cleared += 1;

    const x = index % width;
    const y = (index - x) / width;
    const neighbours = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];

    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (seen[next] || data[next * 4 + 3] === 0) continue;
      if (!close(data, next * 4, origin * 4, TOLERANCE_ORIGIN)) continue;
      if (!close(data, next * 4, index * 4, TOLERANCE_STEP)) continue;
      seen[next] = 1;
      stack.push([next, origin]);
    }
  }

  // Гасим в конце: пока идёт обход, цвета нужны для сравнения
  for (const index of drop) data[index * 4 + 3] = 0;

  return cleared;
}

/**
 * Хромакей по цвету ключа. Заливка от углов тут не годится: фон проглядывает
 * и между рукой и корпусом, куда заливка не доходит.
 *
 * Прозрачность — по тому, насколько пиксель «ключевой»: для пурпура это
 * min(r, b) − g, у фона около 245, у кожи, свитера и белых кед — около нуля и
 * ниже. Между порогами — край, сглаженный генератором: там пиксель — смесь
 * фигуры с фоном, и цвет фигуры восстанавливается обратным смешиванием
 * C = (P − (1 − a)·K) / a. Иначе по контуру осталась бы розовая кайма.
 */
const KEY_SOLID = 200; // выше — чистый фон
const KEY_EDGE = 40; // ниже — чистая фигура

function chromaKey(data, key) {
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const keyness = Math.min(r, b) - g;
    if (keyness <= KEY_EDGE) continue;
    const alpha = keyness >= KEY_SOLID ? 0 : 1 - (keyness - KEY_EDGE) / (KEY_SOLID - KEY_EDGE);
    data[i + 3] = Math.round(alpha * 255);
    if (alpha === 0) continue;
    for (let c = 0; c < 3; c += 1) {
      const restored = (data[i + c] - (1 - alpha) * key[c]) / alpha;
      data[i + c] = Math.max(0, Math.min(255, Math.round(restored)));
    }
  }
}

/**
 * Кайма у ассета, вырезанного до нас. У фонового дома по контуру тянется
 * ореол почти прозрачных пикселей случайного цвета (чистый красный, синий —
 * остатки вырезания), а тело непрозрачно не до конца (альфа 250–254) — на
 * сцене дом слегка просвечивает. Лечим тремя шагами:
 *   1. ореол слабее `FRINGE_LOW` убираем совсем;
 *   2. тело плотнее `FRINGE_HIGH` делаем непрозрачным;
 *   3. у оставшегося полупрозрачного края цвет берём у соседних непрозрачных
 *      пикселей (радиус 2): край остаётся мягким, но без чужого цвета.
 */
const FRINGE_LOW = 40;
const FRINGE_HIGH = 230;

function defringe(data, width, height) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < FRINGE_LOW) data[i] = 0;
    else if (data[i] > FRINGE_HIGH) data[i] = 255;
  }
  const source = Uint8ClampedArray.from(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const alpha = source[i + 3];
      if (alpha === 0 || alpha === 255) continue;
      const sum = [0, 0, 0];
      let count = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = (ny * width + nx) * 4;
          if (source[j + 3] !== 255) continue;
          sum[0] += source[j];
          sum[1] += source[j + 1];
          sum[2] += source[j + 2];
          count += 1;
        }
      }
      if (count === 0) continue;
      for (let c = 0; c < 3; c += 1) data[i + c] = Math.round(sum[c] / count);
    }
  }
}

/** Тона фоновых кварталов: `warm` — теплее, `cool` — холоднее и светлее. */
const TONES = {
  warm: { hue: -8, saturation: 0.86, brightness: 1 },
  cool: { hue: 12, saturation: 0.66, brightness: 1.05 },
};

/** Границы непрозрачного содержимого. */
function contentBox(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxX < 0 ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function prepare(name, options) {
  const file = join(SRC, `${name}.png`);
  const image = sharp(file).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // Залитый фон: заливка от четырёх углов
  if (options.background) {
    flood(data, width, height, [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ]);
  }

  if (options.key) chromaKey(data, options.key);
  if (options.defringe) defringe(data, width, height);

  const box = contentBox(data, width, height);
  if (!box) throw new Error(`${name}: после подготовки не осталось содержимого`);

  const out = join(OUT, `${options.as ?? name}.webp`);
  const base = () =>
    sharp(data, { raw: { width, height, channels: 4 } })
      .extract(box)
      .resize({ width: options.width, withoutEnlargement: true });
  const result = await base().webp({ quality: 92, alphaQuality: 100 }).toFile(out);

  // Варианты тона: сдвиг оттенка и насыщенности, яркость почти та же —
  // задник остаётся одним кварталом, но соседние дома не близнецы
  if (options.tones) {
    for (const [suffix, tone] of Object.entries(TONES)) {
      await base()
        .modulate(tone)
        .webp({ quality: 92, alphaQuality: 100 })
        .toFile(join(OUT, `${options.as ?? name}-${suffix}.webp`));
    }
  }

  const before = statSync(file).size / 1024;
  const after = result.size / 1024;
  console.log(
    `${(options.as ?? name).padEnd(20)} ${String(result.width).padStart(4)}x${String(result.height).padStart(4)}` +
      `  ${before.toFixed(0).padStart(5)} KB → ${after.toFixed(0).padStart(4)} KB`,
  );

  return { width: result.width, height: result.height };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const only = process.argv[2];
  const names = readdirSync(SRC)
    .filter((f) => f.endsWith(".png"))
    .map((f) => basename(f, ".png"))
    .filter((n) => ASSETS[n])
    .filter((n) => !only || n === only);

  // Размеры готовых файлов пишем манифестом: next/image требует их заранее, а
  // держать те же числа руками в двух местах — верный способ разойтись
  const manifest = {};
  for (const name of names) {
    const key = ASSETS[name].as ?? name;
    const size = await prepare(name, ASSETS[name]);
    manifest[key] = { src: `/scene/${key}.webp`, ...size };
    if (ASSETS[name].tones) {
      for (const suffix of Object.keys(TONES)) {
        manifest[`${key}-${suffix}`] = { src: `/scene/${key}-${suffix}.webp`, ...size };
      }
    }
  }

  if (!only) {
    writeFileSync(
      MANIFEST,
      `${JSON.stringify(Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]])), null, 2)}\n`,
    );
    console.log(`\nМанифест: ${MANIFEST}`);
  }
}

await main();
