/**
 * Карточка ссылки для мессенджеров и соцсетей: 1200×630, генерируется Next.
 *
 * Файловая конвенция `app/opengraph-image.tsx` (Next 16): Next сам вешает
 * `og:image`, `og:image:width/height/type/alt` в `<head>`, а `twitter:image`
 * наследуется от openGraph, поэтому отдельный `twitter-image.tsx` не нужен
 * (`resolve-metadata.ts`: twitter.images берутся из openGraph, если не заданы).
 *
 * Внутри ImageResponse работает не браузер, а satori: только flexbox,
 * подмножество CSS, никаких CSS-переменных и никакого Tailwind. Поэтому цвета
 * здесь — литералы, а размеры считаются числами.
 */

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import { UI } from "@/lib/content";
import { pick } from "@/lib/i18n";
import manifest from "@/lib/scene-manifest.json";

// Метаданные картинки — Next читает эти экспорты и пишет их в мета-теги.
export const alt = pick(UI.ogAlt, "ru");
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * КОПИЯ ТОКЕНОВ ПАЛИТРЫ из `globals.css` (светлая тема).
 *
 * Осознанное исключение из правила «цвета только токенами», как в `icon.svg`:
 * satori не умеет CSS-переменные, картинка рисуется вне документа. **При смене
 * палитры в `globals.css` эти значения надо обновить руками.**
 */
const TOKENS = {
  bg: "#f4f1ea", // --bg
  ink: "#141820", // --ink
  muted: "#5d6875", // --muted
  accent: "#0f8f84", // --accent
  stone: "#d3cbba", // --stone
};

/**
 * Шрифты проекта в ttf, лежат рядом в `og-fonts/`. satori понимает только
 * ttf/otf/woff, а next/font кладёт в сборку woff2 — его файлы не подходят.
 *
 * Грабли: раньше ttf тянулись из Google Fonts `await`-ом на уровне модуля. Next
 * импортирует этот модуль не только ради картинки, но и чтобы прочитать `alt`
 * и `size` для метаданных СТРАНИЦЫ. Стоило запросу упасть (`fetch failed`), и
 * главная отдавалась без `<title>`, описания и всех og-тегов — любая сетевая
 * заминка оставляла сайт без заголовка, а сборка без интернета не проходила.
 * Поэтому файлы в репозитории, а читаются лениво, внутри `Image()`: импорт
 * модуля ради метаданных больше ничего не делает.
 */
function ogFont(file: string) {
  return readFile(join(process.cwd(), "src", "app", "og-fonts", file));
}

/**
 * Ассет городка из `public/scene`, встроенный в картинку данными.
 *
 * WebP satori не понимает: его разборщик картинок не отдаёт размеры и рендер
 * падает («u2 is not iterable»). Поэтому ассет здесь разжимается в PNG через
 * `sharp` — тот же пакет, которым работает конвейер `npm run assets`. Заодно
 * ужимаем до двойного экранного размера: в исходнике арка шириной 1020px, а в
 * карточке она 330px, и гонять полный файл в base64 незачем.
 *
 * Всё это происходит на сборке: карточка не зависит от запроса, Next
 * пререндерит её статически, и в рантайм отдаётся готовый PNG.
 */
async function sceneAsset(name: keyof typeof manifest, displayWidth: number) {
  const { src, width, height } = manifest[name];
  const png = await sharp(join(process.cwd(), "public", src))
    .resize({ width: displayWidth * 2 })
    .png()
    .toBuffer();

  return {
    src: `data:image/png;base64,${png.toString("base64")}`,
    width: displayWidth,
    // Высота — из пропорций манифеста, руками числа не пишем
    height: Math.round((displayWidth * height) / width),
  };
}

export default async function Image() {
  // Всё тяжёлое — здесь, а не на уровне модуля (см. комментарий к ogFont).
  // Картинка не зависит от запроса, Next пререндерит её на сборке один раз
  const [unbounded, onest, arch, pine, bench] = await Promise.all([
    ogFont("Unbounded-Bold.ttf"),
    ogFont("Onest-Regular.ttf"),
    sceneAsset("arch", 330),
    sceneAsset("pine", 132),
    sceneAsset("bench", 190),
  ]);

  const name = pick(UI.name, "ru");
  const role = pick(UI.role, "ru");
  const tagline = `${pick(UI.heroTitle, "ru")} ${pick(UI.heroAccent, "ru")}`;

  // Высота, на которой стоит городок: ассеты выравниваются по нижнему краю,
  // а под ними остаётся воздух — карточку смотрят размером с визитку.
  const ground = 96;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: TOKENS.bg,
          fontFamily: "Onest",
        }}
      >
        {/* Земли отдельным слоем здесь нет намеренно. Полоса во всю ширину
            проводила линию сквозь текст слева, а обрезанная плита читалась как
            случайное пятно; у самих ассетов подложка уже нарисована, и в
            карточке размером с визитку пустой фон работает на читаемость. */}

        {/* Правая половина: кусочек городка */}
        <div
          style={{
            position: "absolute",
            right: 74,
            bottom: ground,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <img src={pine.src} width={pine.width} height={pine.height} alt="" />
          <img
            src={arch.src}
            width={arch.width}
            height={arch.height}
            alt=""
            style={{ marginLeft: -22 }}
          />
          <img
            src={bench.src}
            width={bench.width}
            height={bench.height}
            alt=""
            style={{ marginLeft: -34, marginBottom: -10 }}
          />
        </div>

        {/* Левая половина: имя и роль */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 620,
            height: "100%",
            padding: "0 0 0 74px",
          }}
        >
          <div style={{ display: "flex", width: 64, height: 6, backgroundColor: TOKENS.accent }} />
          <div
            style={{
              display: "flex",
              fontFamily: "Unbounded",
              fontSize: 62,
              lineHeight: 1.12,
              letterSpacing: -1,
              color: TOKENS.ink,
              marginTop: 30,
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: TOKENS.muted,
              marginTop: 18,
            }}
          >
            {role}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: TOKENS.ink,
              marginTop: 54,
              paddingTop: 26,
              borderTop: `2px solid ${TOKENS.stone}`,
              width: 470,
            }}
          >
            {tagline}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Unbounded", data: unbounded, style: "normal", weight: 700 },
        { name: "Onest", data: onest, style: "normal", weight: 400 },
      ],
    },
  );
}
