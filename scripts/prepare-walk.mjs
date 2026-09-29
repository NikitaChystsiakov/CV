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
 * Что делает:
 *   1. ffmpeg раскладывает ролик на кадры (нужен `ffmpeg` в PATH).
 *   2. Ищет пару кадров, где поза повторяется, — это период шага. Смотрит
 *      только середину ролика: первые кадры — разгон из стойки, последние —
 *      остановка, цикл из них шёл бы с подпрыгиванием.
 *   3. Вырезает пурпурный фон хромакеем с обратным смешиванием краёв, тем же,
 *      что у остальных ассетов (`prepare-assets.mjs`).
 *   4. Обрезает все кадры одним общим прямоугольником — иначе персонаж прыгал
 *      бы по полосе — и ужимает. Масштаб один на оба ролика: рост персонажа
 *      совпадает, когда код переключает ходьбу вниз на диагональную.
 *   5. Последним кадром кладёт стойку (кадр 0 ролика): персонаж, остановившись,
 *      замирает не в середине шага.
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
};

/** Рост стоящего персонажа в готовой полосе, px. Экран показывает его в 92 базовых px, с запасом на ретину. */
const STAND_HEIGHT = 240;

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
      const cycle = files.slice(loop.i, loop.j);
      const stand = files[0];
      console.log(`${name.padEnd(5)} цикл: кадры ${loop.i}–${loop.j - 1} (${cycle.length}), расхождение ${loop.d.toFixed(2)}`);

      const frames = [];
      for (const path of [...cycle, stand]) frames.push(await keyed(path));

      const box = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
      for (const frame of frames) contentBox(frame, box);

      // Рост стойки — для общего масштаба обоих роликов
      const standBox = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
      contentBox(frames[frames.length - 1], standBox);

      prepared[name] = { frames, box, standHeight: standBox.bottom - standBox.top + 1 };
    }

    // Один масштаб на оба ролика: берём рост стойки первого
    const scale = STAND_HEIGHT / prepared.down.standHeight;
    console.log(`масштаб ${scale.toFixed(4)} (рост стойки в исходнике ${prepared.down.standHeight}px)`);

    const manifest = {};

    for (const [name, { frames, box }] of Object.entries(prepared)) {
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

      // Ноги: где стойка стоит по вертикали относительно низа полосы, доля высоты
      manifest[name] = {
        src: `/scene/walk-${name}.webp`,
        frames: frames.length - 1,
        frameWidth,
        frameHeight,
        // Рост стоящего персонажа в кадре полосы: от него код считает размер на экране
        standHeight: STAND_HEIGHT,
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
