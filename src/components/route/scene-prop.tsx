import Image from "next/image";

import { PROP_ASSETS, type PropName } from "@/lib/scene-assets";
import { townSize } from "@/lib/town";

/**
 * Объект окружения из ассета владельца: дерево, фонарь, лавочка.
 *
 * Ширина — базовая из `scene-assets.ts`, умноженная на глубинный коэффициент
 * карты и на общий множитель городка `--town-unit`. Отдельных чисел под
 * маленькие экраны нет: улица уменьшается вся сразу.
 *
 * Семь файлов на семьдесят объектов. Чтобы браузер и правда декодировал каждый
 * один раз, картинки идут мимо оптимизатора (`unoptimized`): он строит srcset
 * под каждый `sizes`, и один и тот же фонарь в семи масштабах превращался в
 * семь разных URL — каждый со своей загрузкой и декодированием прямо во время
 * скролла. Файлы в `public/scene` уже ужаты конвейером до нужного размера, так
 * что оптимизатору здесь делать нечего. Тень — кодом, как у домов.
 */
export function SceneProp({ name, scale = 1 }: { name: PropName; scale?: number }) {
  const asset = PROP_ASSETS[name];

  return (
    <div className="relative" style={{ width: townSize(asset.display * scale) }}>
      <div
        aria-hidden
        className="absolute inset-x-[10%] bottom-0 -z-10 h-[14%]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 40%, transparent), transparent)",
        }}
      />
      <Image
        src={asset.src}
        alt=""
        width={asset.width}
        height={asset.height}
        unoptimized
        className="scene-art h-auto w-full select-none"
      />
    </div>
  );
}
