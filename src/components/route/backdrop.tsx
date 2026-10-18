import Image from "next/image";

import { BACKDROP_ART, backdropNodes, type BackdropNode } from "@/lib/backdrop";
import manifest from "@/lib/scene-manifest.json";
import { townSize } from "@/lib/town";

/**
 * Фоновые кварталы — ряды домов и деревьев по краям улицы (`src/lib/backdrop.ts`).
 *
 * Слой общий на весь маршрут и стоит в разметке раньше остановок, поэтому
 * рисуется под ними: фоновый дом не может оказаться поверх дома маршрута.
 *
 * Задник обязан уступать: мельче (меньше половины дома маршрута) и бледнее —
 * прозрачность на весь слой (`--backdrop-opacity`), а не на каждый дом:
 * соседние дома, заходящие друг на друга, не просвечивают один сквозь другой,
 * и браузеру это одна группа прозрачности вместо десятков.
 *
 * Слой вчетверо шире маршрута: на первом экране городок уменьшен наездом
 * камеры (`.town-zoom`), и обрезка по ширине маршрута срезала бы кварталы ещё
 * до масштабирования. Лишнее по краям срезает сам маршрут (`#route`).
 *
 * Файлы одни и те же на десятки копий, поэтому мимо оптимизатора
 * (`unoptimized`, как у декора). Слой включается с 768px, как и весь
 * городок. Серверный компонент: состояния нет, раскладка детерминирована.
 */

const HOUSE_ART = [manifest["bg-house-1"], manifest["bg-house-1-warm"], manifest["bg-house-1-cool"]];
const NODES = backdropNodes();

function artOf(node: BackdropNode) {
  if (node.kind === "house") return HOUSE_ART[node.tone];
  return manifest[node.kind];
}

export function TownBackdrop() {
  return (
    <div
      aria-hidden
      className="backdrop-layer town-zoom pointer-events-none absolute inset-y-0 left-[-150%] right-[-150%] hidden md:block"
    >
      {NODES.map((node) => {
        const art = artOf(node);
        return (
          <div
            key={node.key}
            data-backdrop={node.kind}
            className="backdrop-house absolute"
            style={{
              left: `calc(50% + ${townSize(node.left)})`,
              top: `${node.top}%`,
              width: townSize(BACKDROP_ART[node.kind].width * node.scale),
              transform: `translate(-50%, -100%)${node.flip ? " scaleX(-1)" : ""}`,
            }}
          >
            <Image
              src={art.src}
              alt=""
              width={art.width}
              height={art.height}
              unoptimized
              loading="lazy"
              className="scene-art h-auto w-full select-none"
            />
          </div>
        );
      })}
    </div>
  );
}
