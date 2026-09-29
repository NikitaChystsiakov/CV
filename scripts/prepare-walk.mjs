#!/usr/bin/env node
/**
 * Ролики ходьбы → полосы кадров (спрайты) для персонажа.
 *
 *   assets-src/videos/walks-*.mp4  → public/scene/walk-*.webp
 *   + размеры и число кадров в src/lib/walk-manifest.json
 *
 * Видео на сайте не играет: персонаж идёт синхронно со скроллом, и кадр
 * выбирается по пройденному пути, а не по времени. Поэтому ролик режется на
 * кадры одного полного шага (две ноги) и склеивается в горизонтальную полосу.
 *
 * Роликов четыре: лицом к зрителю (вниз), три четверти вправо-вниз, спиной
 * (вверх) и спиной три четверти вправо-вверх. Влево обе диагонали зеркалит код.
 *
 * Что делает:
 *   1. ffmpeg раскладывает ролик на кадры (нужен `ffmpeg` в PATH).
 *   2. Ищет пару кадров, где поза повторяется, — это период шага. Смотрит
 *      только середину ролика: первые кадры — разгон из стойки, последние —
 *      остановка, цикл из них шёл бы с подпрыгиванием.
 *   3. Вырезает пурпурный фон хромакеем с обратным смешиванием краёв, тем же,
 *      что у остальных ассетов (`prepare-assets.mjs`).
 *   4. Выбирает стойку: кадр цикла, где ступни ближе всего друг к другу. Кадр 0
 *      ролика для этого не годится: у спинных роликов он уже в шаге.
 *   5. Обрезает все кадры позы одним общим прямоугольником — иначе персонаж
 *      прыгал бы по полосе — и ужимает. Масштаб у каждого ролика свой: рост
 *      стойки приводится к одному `STAND_HEIGHT`, потому что ролики сняты
 *      с разного расстояния, а на экране поза не должна скакать по размеру,
 *      когда код переключает прямую на диагональ или лицо на спину.
 *   6. Последним кадром кладёт стойку: персонаж, остановившись, замирает не в
 *      середине шага. В манифест пишет точку ног стойки в кадре — по ней код
 *      ставит на дорогу любую позу, и на стыке поз ноги остаются на месте.
 *
 *   node scripts/prepare-walk.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

const SRC = "assets-src/videos";
const OUT = "public/scene";
const MANIFEST = "src/lib/walk-manifest.json";

/** Что готовим: ролик → имя полосы. */
const WALKS = {
  down: "walks-down.mp4",
  diag: "walks-diag.mp4",
  up: "walks-up.mp4",
  updiag: "walks-up-diag.mp4",
};

/** Рост стоящего персонажа в готовой полосе, px. Экран показывает его в ~120 базовых px, с запасом на ретину. */
const STAND_HEIGHT = 240;

/**
 * Ступни — светлые кеды (белый верх и серая подошва: у поднятой ноги видна
 * именно подошва). По ним ищется стойка и точка ног: светлое серое в нижней части
 * фигуры (выше — только манжеты рубашки, их отсекает `FEET_BAND`).
 */
const FEET_BAND = 0.3;
const SHOE_MIN = 120;
const SHOE_WHITE = 205;
const SHOE_SPREAD = 14;
/** Штраф за видимую подошву в долях роста фигуры: разведённые ступни и нога в воздухе весят сопоставимо. */
const SOLE_PENALTY = 0.4;

/** Прозрачное поле по бокам каждого кадра, px: на дробном масштабе экрана соседний кадр иначе задевает край. */
const GUTTER = 4;

/** Ключ хромакея — как у остальных ассетов. */
const KEY = [255, 0, 255];
const KEY_SOLID = 200;
const KEY_EDGE = 40;

/** Период шага ищется в этих пределах, кадров: 0,7–2,7 секунды при 24 к/с. */
const PERIOD_MIN = 16;
const PERIOD_MAX = 64;
/** Столько кадров с начала и с конца ролика не смотрим. */
const MARGIN = 8;
/** Размер кадров при поиске цикла: точности хватает, работает быстро. */
const PROBE = 192;

function chromaKey(data) {
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const keyness = Math.min(r, b) - g;
    if (keyness <= KEY_EDGE) continue;
    const alpha = keyness >= KEY_SOLID ? 0 : 1 - (keyness - KEY_EDGE) / (KEY_SOLID - KEY_EDGE);
    data[i + 3] = Math.round(alpha * 255);
    if (alpha === 0) continue;
    for (let c = 0; c < 3; c += 1) {
      const restored = (data[i + c] - (1 - alpha) * KEY[c]) / alpha;
      data[i + c] = Math.max(0, Math.min(255, Math.round(restored)));
    }
  }
}

function extractFrames(video, dir) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-an", join(dir, "%04d.png")]);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => join(dir, f));
}

/** Пара кадров (i, j), где поза совпадает лучше всего: j − i — период шага. */
async function findLoop(files) {
  const frames = [];
  for (const file of files) {
    frames.push(await sharp(file).resize(PROBE, PROBE).removeAlpha().raw().toBuffer());
  }
  const diff = (a, b) => {
    let sum = 0;
    for (let k = 0; k < frames[a].length; k += 1) sum += Math.abs(frames[a][k] - frames[b][k]);
    return sum / frames[a].length;
  };

  let best = null;
  for (let i = MARGIN; i < frames.length - MARGIN - PERIOD_MIN; i += 1) {
    const last = Math.min(frames.length - MARGIN, i + PERIOD_MAX);
    for (let j = i + PERIOD_MIN; j < last; j += 1) {
      const d = diff(i, j);
      if (!best || d < best.d) best = { i, j, d };
    }
  }
  if (!best) throw new Error("не нашёл цикл шага: ролик слишком короткий");
  return best;
}

/** Кадр без фона, в сыром RGBA. */
async function keyed(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  chromaKey(data);
  return { data, width: info.width, height: info.height };
}

function contentBox(frame, box) {
  const { data, width, height } = frame;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;
      if (x < box.left) box.left = x;
      if (x > box.right) box.right = x;
      if (y < box.top) box.top = y;
      if (y > box.bottom) box.bottom = y;
    }
  }
}

/**
 * Кеды в кадре: светлые серые пиксели в нижней полосе фигуры. Белый верх и
 * серая подошва считаются отдельно — видна подошва, значит, нога оторвана.
 */
function shoes(frame) {
  const { data, width, height } = frame;
  const body = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
  contentBox(frame, body);
  const from = Math.round(body.bottom - (body.bottom - body.top) * FEET_BAND);
  const pixels = [];
  let white = 0;
  for (let y = Math.max(0, from); y <= body.bottom && y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 200) continue;
      const lo = Math.min(data[i], data[i + 1], data[i + 2]);
      const hi = Math.max(data[i], data[i + 1], data[i + 2]);
      if (lo < SHOE_MIN || hi - lo > SHOE_SPREAD) continue;
      if (lo >= SHOE_WHITE) white += 1;
      pixels.push([x, y]);
    }
  }
  return { body, pixels, sole: pixels.length ? 1 - white / pixels.length : 1 };
}

/**
 * Насколько ступни разведены: общий прямоугольник пары кед. Поперёк экрана шаг
 * виден его шириной, а в глубину (прямо к зрителю или от него) — высотой: одна
 * ступня стоит выше другой. Всё в долях роста, ролики сняты с разного
 * расстояния.
 */
function feetBox({ body, pixels, sole }) {
  if (pixels.length === 0) return null;
  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  const height = body.bottom - body.top + 1;
  return {
    width: (Math.max(...xs) - Math.min(...xs)) / height,
    depth: (Math.max(...ys) - Math.min(...ys)) / height,
    sole,
  };
}

/**
 * Стойка — кадр цикла, где ступни ближе всего друг к другу и обе на земле.
 * Размеры считаются от самых малых за цикл: пара кед у фронтальной позы
 * всегда шириной в бёдра, и без этого разница в глубину тонула бы в ширине.
 * Видимая подошва штрафуется: нога в воздухе — не стойка.
 */
function pickStand(frames) {
  const boxes = frames.map((frame) => feetBox(shoes(frame)));
  const found = boxes.filter(Boolean);
  if (found.length === 0) throw new Error("не нашёл кеды ни в одном кадре цикла");
  const narrowest = Math.min(...found.map((box) => box.width));
  const flattest = Math.min(...found.map((box) => box.depth));
  let best = null;
  boxes.forEach((box, index) => {
    if (!box) return;
    const spread = box.width - narrowest + box.depth - flattest + SOLE_PENALTY * box.sole;
    if (!best || spread < best.spread) best = { index, spread };
  });
  return best.index;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "walk-"));

  try {
    const prepared = {};
    for (const [name, file] of Object.entries(WALKS)) {
      const dir = join(work, name);
      mkdirSync(dir);
      const files = extractFrames(join(SRC, file), dir);
      const loop = await findLoop(files);
      const cycleFiles = files.slice(loop.i, loop.j);

      const frames = [];
      for (const path of cycleFiles) frames.push(await keyed(path));
      // Кандидаты в стойку — кадры цикла и кадр 0 ролика: у фронтального ролика
      // он и есть стойка, у спинных — уже шаг, и метрика его отбросит сама
      const candidates = [...frames, await keyed(files[0])];
      const standIndex = pickStand(candidates);
      // Стойка кладётся копией в конец полосы: код показывает её по индексу N
      frames.push(candidates[standIndex]);
      const standName = standIndex === frames.length - 1 ? "кадр 0 ролика" : `кадр ${standIndex} цикла`;
      console.log(
        `${name.padEnd(6)} цикл: кадры ${loop.i}–${loop.j - 1} (${cycleFiles.length}), расхождение ${loop.d.toFixed(2)}, стойка — ${standName}`,
      );

      const box = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
      for (const frame of frames) contentBox(frame, box);

      // Рост стойки и точка её ног в исходнике: от них масштаб и посадка позы
      const stand = shoes(frames[frames.length - 1]);
      prepared[name] = {
        frames,
        box,
        standHeight: stand.body.bottom - stand.body.top + 1,
        foot: {
          x: (Math.min(...stand.pixels.map(([x]) => x)) + Math.max(...stand.pixels.map(([x]) => x))) / 2,
          y: stand.body.bottom,
        },
      };
    }

    const manifest = {};

    for (const [name, { frames, box, standHeight, foot }] of Object.entries(prepared)) {
      // Свой масштаб у каждого ролика: рост стойки у всех поз один
      const scale = STAND_HEIGHT / standHeight;
      console.log(`${name.padEnd(6)} масштаб ${scale.toFixed(4)} (рост стойки в исходнике ${standHeight}px)`);
      const cropWidth = box.right - box.left + 1;
      const cropHeight = box.bottom - box.top + 1;
      const bodyWidth = Math.round(cropWidth * scale);
      const frameWidth = bodyWidth + GUTTER * 2;
      const frameHeight = Math.round(cropHeight * scale);

      const tiles = [];
      for (const [index, frame] of frames.entries()) {
        const tile = await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } })
          .extract({ left: box.left, top: box.top, width: cropWidth, height: cropHeight })
          .resize({ width: bodyWidth, height: frameHeight })
          .extend({ left: GUTTER, right: GUTTER, background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        tiles.push({ input: tile, left: index * frameWidth, top: 0 });
      }

      const out = join(OUT, `walk-${name}.webp`);
      const result = await sharp({
        create: {
          width: frameWidth * frames.length,
          height: frameHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(tiles)
        .webp({ quality: 90, alphaQuality: 100 })
        .toFile(out);

      manifest[name] = {
        src: `/scene/walk-${name}.webp`,
        frames: frames.length - 1,
        frameWidth,
        frameHeight,
        // Рост стоящего персонажа в кадре полосы: от него код считает размер на экране
        standHeight: STAND_HEIGHT,
        // Точка ног стойки в кадре полосы, px: её код ставит на дорогу
        footX: Math.round((foot.x - box.left) * scale + GUTTER),
        footY: Math.round((foot.y - box.top) * scale),
        // Масштаб ролика к полосе: шаг в пикселях исходника переводится им
        scale: Math.round(scale * 10000) / 10000,
      };
      console.log(
        `walk-${name}.webp`.padEnd(16) +
          `${result.width}x${result.height}  ${frames.length} кадров ${frameWidth}x${frameHeight}  ${(statSync(out).size / 1024).toFixed(0)} KB`,
      );
    }

    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`\nМанифест: ${MANIFEST}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
