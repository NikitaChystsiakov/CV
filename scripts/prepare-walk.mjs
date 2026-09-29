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
 * Роликов четыре: вниз лицом к зрителю, по диагонали вправо-вниз, вверх спиной
 * и по диагонали вправо-вверх спиной. Влево обе диагонали зеркалит код.
 *
 * Что делает:
 *   1. ffmpeg раскладывает ролик на кадры (нужен `ffmpeg` в PATH).
 *   2. Ищет пару кадров, где поза повторяется, — это период шага. Смотрит
 *      только середину ролика: первые кадры — разгон из стойки, последние —
 *      остановка, цикл из них шёл бы с подпрыгиванием.
 *   3. Вырезает пурпурный фон хромакеем с обратным смешиванием краёв, тем же,
 *      что у остальных ассетов (`prepare-assets.mjs`).
 *   4. Выбирает стойку: кадр цикла, где ступни ближе всего друг к другу.
 *      Кадр 0 не годится — у спинных роликов он уже в шаге. Ступни находятся
 *      по белым кедам: они единственное почти бесцветное светлое пятно внизу
 *      фигуры (брюки бежевые, у них синий канал заметно ниже).
 *   5. Масштаб у каждого ролика свой — такой, чтобы стойка вышла ровно
 *      STAND_HEIGHT. Ролики сняты с разной дистанции, и общий масштаб делал
 *      персонажа на диагонали выше, чем на прямой.
 *   6. Обрезает все кадры ролика одним общим прямоугольником — иначе персонаж
 *      прыгал бы по полосе — и ужимает. Последним кадром кладёт стойку.
 *   7. Пишет в манифест точку ног стойки (доли кадра) — код ставит её на
 *      дорогу, поэтому на стыке прямой и диагонали ноги не прыгают, — и длину
 *      шага: скорость, с которой опорная стопа едет по «беговой дорожке»,
 *      умноженную на длину цикла.
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
  upDiag: "walks-up-diag.mp4",
};

/** Имя готовой полосы: ключ манифеста в camelCase, файл — через дефис. */
const fileOf = (name) => `walk-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}.webp`;

/** Рост стоящего персонажа в готовой полосе, px. Экран показывает его в 120 базовых px, с запасом на ретину. */
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

const round3 = (value) => Math.round(value * 1000) / 1000;

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
 * Кеды: светлый почти бесцветный пиксель фигуры. Брюки бежевые (синий канал
 * около 195), рубашка и манжеты тоже белые, но они выше — ищем только в
 * нижней пятой части фигуры.
 */
const SNEAKER_MIN = 210;
const SNEAKER_SPREAD = 22;
const FEET_ZONE = 0.2;

/**
 * Ступни кадра: до двух самых крупных пятен кед в нижней части фигуры.
 * У каждого — центр и нижняя точка. Пятно одно, если ступни слились
 * (стоят вместе или одна заслоняет другую).
 */
function feetOf(frame) {
  const { data, width, height } = frame;
  const box = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
  contentBox(frame, box);
  const y0 = box.bottom - Math.round((box.bottom - box.top + 1) * FEET_ZONE);

  const mask = new Uint8Array(width * height);
  for (let y = y0; y <= box.bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const lo = Math.min(data[i], data[i + 1], data[i + 2]);
      const hi = Math.max(data[i], data[i + 1], data[i + 2]);
      if (lo > SNEAKER_MIN && hi - lo < SNEAKER_SPREAD) mask[y * width + x] = 1;
    }
  }

  const seen = new Uint8Array(width * height);
  const blobs = [];
  for (let y = y0; y <= box.bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      seen[start] = 1;
      const stack = [start];
      const blob = { n: 0, sx: 0, sy: 0, left: x, right: x, bottom: y };
      while (stack.length) {
        const p = stack.pop();
        const px = p % width;
        const py = (p - px) / width;
        blob.n += 1;
        blob.sx += px;
        blob.sy += py;
        blob.left = Math.min(blob.left, px);
        blob.right = Math.max(blob.right, px);
        blob.bottom = Math.max(blob.bottom, py);
        for (const [nx, ny] of [
          [px + 1, py],
          [px - 1, py],
          [px, py + 1],
          [px, py - 1],
        ]) {
          if (nx < 0 || nx >= width || ny < y0 || ny > box.bottom) continue;
          const q = ny * width + nx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
      blobs.push(blob);
    }
  }

  const feet = blobs
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .filter((b) => b.n > 40)
    .map((b) => ({ x: b.sx / b.n, y: b.sy / b.n, bottom: b.bottom, width: b.right - b.left + 1, n: b.n }));
  return { feet, box };
}

/**
 * Насколько ступни врозь: расстояние между центрами плюс разница по высоте
 * подошв с двойным весом (одна в воздухе — это шаг, а не стойка). Слившиеся
 * ступни — одно пятно, его мерой служит ширина: так скрещённые на махе ноги
 * не выигрывают у настоящей стойки.
 */
function spread({ feet }) {
  if (feet.length === 0) return Infinity;
  if (feet.length === 1) return feet[0].width;
  const [a, b] = feet;
  return Math.hypot(a.x - b.x, a.y - b.y) + 2 * Math.abs(a.bottom - b.bottom);
}

/**
 * Скорость «беговой дорожки», px исходника за кадр. Ролик снят на месте:
 * опорная стопа (та, что ниже) едет по кадру назад со скоростью ходьбы.
 * Берём медиану сдвига опорной стопы между соседними кадрами, пока она та же.
 */
function treadmillSpeed(probes) {
  const samples = [];
  for (let k = 1; k < probes.length; k += 1) {
    const prev = probes[k - 1].feet;
    const next = probes[k].feet;
    if (prev.length < 2 || next.length < 2) continue;
    const planted = prev[0].bottom > prev[1].bottom ? prev[0] : prev[1];
    const match = next
      .map((foot) => ({ foot, d: Math.hypot(foot.x - planted.x, foot.y - planted.y) }))
      .sort((a, b) => a.d - b.d)[0];
    const other = next.find((foot) => foot !== match.foot);
    // Та же стопа и всё ещё опорная: иначе в выборку попал бы мах ноги
    if (match.d > 25 || match.foot.bottom < other.bottom) continue;
    samples.push(match.d);
  }
  if (samples.length < 4) throw new Error("не удалось измерить шаг: опорная стопа не найдена");
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
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

      const frames = [];
      for (const path of cycle) frames.push(await keyed(path));
      const probes = frames.map(feetOf);

      // Стойка — кадр цикла со ступнями ближе всего друг к другу
      let standIndex = 0;
      for (let k = 1; k < probes.length; k += 1) {
        if (spread(probes[k]) < spread(probes[standIndex])) standIndex = k;
      }
      const stand = frames[standIndex];
      frames.push(stand);
      const standProbe = probes[standIndex];
      const standHeight = standProbe.box.bottom - standProbe.box.top + 1;
      const speed = treadmillSpeed(probes);

      const box = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
      for (const frame of frames) contentBox(frame, box);

      // Точка ног стойки: середина кед по горизонтали, подошва по вертикали
      const feetX = standProbe.feet.reduce((sum, f) => sum + f.x * f.n, 0) /
        standProbe.feet.reduce((sum, f) => sum + f.n, 0);
      const feetY = standProbe.box.bottom;

      console.log(
        `${name.padEnd(6)} цикл: кадры ${loop.i}–${loop.j - 1} (${cycle.length}), расхождение ${loop.d.toFixed(2)}; ` +
          `стойка — кадр ${loop.i + standIndex}, рост ${standHeight}px; дорожка ${speed.toFixed(2)} px/кадр`,
      );
      prepared[name] = { frames, box, standHeight, speed, feetX, feetY };
    }

    const manifest = {};

    for (const [name, { frames, box, standHeight, speed, feetX, feetY }] of Object.entries(prepared)) {
      // Свой масштаб у каждого ролика: стойка всех поз одного роста
      const scale = STAND_HEIGHT / standHeight;
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

      const out = join(OUT, fileOf(name));
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
        src: `/scene/${fileOf(name)}`,
        frames: frames.length - 1,
        frameWidth,
        frameHeight,
        // Рост стоящего персонажа в кадре полосы: от него код считает размер на экране
        standHeight: STAND_HEIGHT,
        // Где у стойки ноги, доли кадра: эта точка стоит на дороге
        feetX: round3((GUTTER + (feetX - box.left) * (bodyWidth / cropWidth)) / frameWidth),
        feetY: round3(((feetY - box.top + 1) * (frameHeight / cropHeight)) / frameHeight),
        // Длина полного шага в пикселях полосы: столько проходит опорная стопа за цикл
        stride: Math.round(speed * (frames.length - 1) * scale),
      };
      console.log(
        fileOf(name).padEnd(22) +
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
