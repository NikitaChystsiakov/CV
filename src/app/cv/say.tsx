"use client";

import Image from "next/image";

import { dashes, type Localized } from "@/lib/i18n";
import { useLang } from "@/lib/use-lang";

/**
 * Клиентские листья страницы `/cv`: строка и картинка на языке посетителя.
 *
 * Язык живёт в `sessionStorage` (`use-lang.ts`), серверу он неизвестен. Поэтому
 * вся страница — серверный компонент, а переключаемым остаётся только сам
 * текст: сервер отдаёт пару `{ ru, en }` пропсом, лист выбирает строку. На
 * сервере и при гидратации это русский (серверный снапшот `useLang`), сразу
 * после — сохранённый язык, без расхождения разметки.
 *
 * Обёртки нет — лист отдаёт голый текст, чтобы вёрстка строк оставалась в
 * серверной разметке и не плодила лишних `<span>`.
 */
export function Say({ text }: { text: Localized }) {
  const { lang } = useLang();
  return <>{dashes(text[lang], lang)}</>;
}

/**
 * Скриншот кейса с подписью на языке посетителя: `alt` — атрибут, и `Say` его
 * не достаёт. Картинка одна на кейс — через оптимизатор, как дома.
 */
export function Shot({
  src,
  width,
  height,
  alt,
  className,
}: {
  src: string;
  width: number;
  height: number;
  alt: Localized;
  className?: string;
}) {
  const { lang } = useLang();
  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt={dashes(alt[lang], lang)}
      sizes="(min-width: 768px) 40rem, 100vw"
      className={className}
    />
  );
}
