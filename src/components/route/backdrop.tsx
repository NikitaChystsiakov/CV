import Image from "next/image";

import manifest from "@/lib/scene-manifest.json";
import { BACKDROP_WIDTH, backdropNodes, townSize } from "@/lib/town";

/**
 * Фоновые кварталы — ряды жилых домов по внешним краям улицы (блок «город, а не
 * выставка предметов»). Раскладка — в `src/lib/town.ts` (`BACKDROP`).
 *
 * Слой общий на весь маршрут и стоит в разметке раньше остановок, поэтому
 * рисуется под ними: фоновый дом не может оказаться поверх дома маршрута,
 * даже если его крыша заходит на соседнюю остановку. Внутри остановки такой
 * гарантии нет — более поздняя остановка рисуется поверх более ранней.
 *
 * Задник обязан уступать: мельче (≈ половина дома маршрута), бледнее
 * (прозрачность смешивает его с фоном страницы — это и есть дымка) и со
 * сдвигом тона, чтобы один ассет в ряду не читался повтором. Тон запечён
 * конвейером в три файла (`bg-house-1`, `-warm`, `-cool`): CSS-фильтр на
 * десятках картинок растеризовался бы заново на каждом тайле при скролле.
 *
 * Файлов три на все дома ряда, поэтому мимо оптимизатора (`unoptimized`,
 * как у декора): иначе каждый масштаб давал бы свой URL и своё
 * декодирование. `loading="lazy"` — браузер грузит их, когда ряд подъезжает.
 *
 * Слой включается с 768px, как и весь городок. Серверный компонент: состояния
 * нет, раскладка детерминирована.
 */

/** Файл по тону: 0 — как есть, 1 — теплее, 2 — холоднее. */
const ART = [manifest["bg-house-1"], manifest["bg-house-1-warm"], manifest["bg-house-1-cool"]];

/** На сколько базовых px центр крайнего дома держится внутри края окна. */
const EDGE_INSET = 96;

/**
 * Позиция дома в ряду: его клетка, но не дальше `EDGE_INSET` от края окна.
 * На 1280+ ряд стоит на своих клетках за домами маршрута, на 768–1024 окно
 * уже городка, и без прижима ряд целиком уезжал бы за край — улица на
 * планшете снова становилась бы пустым полем. `min()` в CSS, а не пересчёт в
 * JS: ширина окна меняется без единой строчки кода и без расхождения с
 * сервером.
 */
function edgeLeft(left: number) {
  const offset = `min(${townSize(Math.abs(left))}, 50% - ${townSize(EDGE_INSET)})`;
  return left >= 0 ? `calc(50% + ${offset})` : `calc(50% - ${offset})`;
}

export function TownBackdrop() {
  const nodes = backdropNodes();

  return (
    <div aria-hidden className="town-layer pointer-events-none absolute inset-0 hidden md:block">
      {nodes.map((node) => (
        <div
          key={node.key}
          data-backdrop
          className="backdrop-house absolute"
          style={{
            left: edgeLeft(node.left),
            top: `${node.top}%`,
            width: townSize(BACKDROP_WIDTH * node.scale),
            transform: `translate(-50%, -100%)${node.flip ? " scaleX(-1)" : ""}`,
          }}
        >
          <Image
            src={ART[node.tone].src}
            alt=""
            width={ART[node.tone].width}
            height={ART[node.tone].height}
            unoptimized
            loading="lazy"
            className="scene-art h-auto w-full select-none"
          />
        </div>
      ))}
    </div>
  );
}
