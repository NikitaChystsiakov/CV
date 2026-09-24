import Image from "next/image";
import type { Ref } from "react";

import type { SceneAsset } from "@/lib/scene-assets";
import { townSize } from "@/lib/town";

/**
 * Дом можно открыть: подпись, куда вернуть фокус, и что делать по клику.
 * Приходит только тем домам, у которых есть комната (`roomFor` в `rooms.tsx`).
 */
export type HouseEntryTrigger = {
  /** id остановки — стабильный селектор для проверок */
  stopId: string;
  /** `aria-label` кнопки: видимого текста у дома нет */
  label: string;
  onEnter: () => void;
};

/**
 * Ассет городка на своём месте в сцене.
 *
 * Ширина берётся из карты городка: `display` — базовый размер, а на экране он
 * умножается на общий множитель `--town-unit` (globals.css). Один множитель на
 * дома, декор и дорогу — поэтому на ноутбуке уменьшается вся улица целиком, а
 * не дом отдельно от фонаря.
 *
 * Кодом здесь рисуется только тень: она обязана меняться вместе с темой, а
 * запечённая в картинку тень в тёмной теме читается как лужа. Сам объект —
 * файл владельца, отданный через `next/image`: он сам подберёт размер под
 * плотность экрана и не загрузится, пока остановка не подъехала к вьюпорту.
 *
 * С `entry` дом становится кнопкой: подпись в `aria-label`, курсор-рука и
 * свет из двери на наведении. Без `entry` он остаётся картинкой и ничего не
 * обещает — дом без комнаты не должен выглядеть кликабельным.
 */
export function SceneObject({
  asset,
  alt,
  priority = false,
  entry,
  entryRef,
}: {
  asset: SceneAsset;
  alt: string;
  priority?: boolean;
  entry?: HouseEntryTrigger;
  /** Куда вернуть фокус после закрытия комнаты. Отдельным параметром: ref в
      объекте компилятор React считает обращением к ref во время рендера */
  entryRef?: Ref<HTMLButtonElement>;
}) {
  const box = { width: townSize(asset.display), maxWidth: "100%" } as const;

  const art = (
    <>
      {/* Тень на земле: мягкость даёт радиальный градиент, а не фильтр blur —
          фильтр на каждом доме заметно дороже при скролле */}
      <div
        aria-hidden
        className="absolute inset-x-[8%] bottom-[1%] -z-10 h-[12%]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 45%, transparent), transparent)",
        }}
      />

      <Image
        src={asset.src}
        alt={alt}
        width={asset.width}
        height={asset.height}
        priority={priority}
        sizes={`(max-width: 768px) 80vw, ${asset.display}px`}
        className="scene-art h-auto w-full select-none"
      />
    </>
  );

  if (!entry) {
    return (
      <div data-scene-object className="relative mx-auto" style={box}>
        {art}
      </div>
    );
  }

  return (
    <button
      ref={entryRef}
      type="button"
      data-scene-object
      data-room-trigger={entry.stopId}
      aria-label={entry.label}
      onClick={entry.onEnter}
      className="group relative mx-auto block cursor-pointer rounded-2xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
      style={box}
    >
      {art}
      <HouseEntryGlow />
    </button>
  );
}

/**
 * Что дом отвечает на наведение и на фокус.
 *
 * Ни рамки, ни подписи: дом — не карточка, а силуэт, и прямоугольник вокруг
 * него читался бы как чужая графика поверх ассета владельца. Вместо этого у
 * основания зажигается свет — будто открыли дверь, — и силуэт чуть отделяется
 * от улицы ореолом. Обе подсветки меняют только `opacity`.
 */
export function HouseEntryGlow() {
  return (
    <>
      <span
        aria-hidden
        // Ореол — строго в границах дома: отрицательный отступ выводил его за
        // край колонки, и на 768/1024 документ получал горизонтальную прокрутку
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-accent) 20%, transparent), transparent)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[16%] bottom-0 h-[24%] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-accent) 60%, transparent), transparent)",
        }}
      />
    </>
  );
}
