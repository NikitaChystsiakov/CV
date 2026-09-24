import type { Lang } from "@/lib/i18n";
import { UI } from "@/lib/content";

import { mg, type PieceId } from "./pieces";

/**
 * Лицо блока: сам элемент интерфейса — навбар, карточка, поле, кнопка.
 *
 * Это не иллюстрация, а интерфейс, и нарисован он как интерфейс: поверхности,
 * рамки и текст из токенов палитры, тот же набор, что у панели сайта. Тема
 * меняется вместе со страницей. Лицо декоративное (`aria-hidden`): имя блока
 * скринридер получает от кнопки-обёртки.
 *
 * Текст внутри в единицах `--mg-u`, как и размеры: блок масштабируется целиком.
 *
 * `compact` — тот же блок в макете телефона (второй раунд): меньше кегль,
 * ссылки навбара сворачиваются в «бургер», у карточки короче картинка. Это и
 * есть адаптив, который собирает игрок.
 *
 * `radius` заменяет скругление лица: в третьем раунде поле свёрстано с
 * пилюлей вместо угла, и видно это должно быть на самом лице, у которого своя
 * рамка, а не на невидимой обёртке.
 */
export function PieceFace({
  id,
  lang,
  compact = false,
  radius,
}: {
  id: PieceId;
  lang: Lang;
  compact?: boolean;
  radius?: string;
}) {
  const text = (size: number) => ({ fontSize: mg(size), lineHeight: 1.2 });

  if (id === "button") {
    return (
      <span
        aria-hidden
        // nowrap: в третьем раунде кнопка свёрстана уже подписи, и текст обязан
        // вылезти, а не перенестись — это и есть баг, который ищет игрок
        className={`flex size-full items-center justify-center whitespace-nowrap bg-ink font-semibold text-bg ${radius ?? "rounded-full"}`}
        style={text(compact ? 9 : 11)}
      >
        {UI.mgFaceButton[lang]}
      </span>
    );
  }

  if (id === "input") {
    return (
      <span
        aria-hidden
        className={`flex size-full items-center border border-muted/50 bg-surface ${radius ?? "rounded-md"}`}
        style={{ paddingInline: mg(compact ? 6 : 8), gap: mg(3), ...text(compact ? 9 : 11) }}
      >
        {/* Курсор ввода — акцентом, как caret-color у настоящих полей сайта */}
        <span className="shrink-0 bg-accent" style={{ width: mg(1.5), height: mg(compact ? 10 : 14) }} />
        <span className="truncate text-muted">{UI.mgFaceInput[lang]}</span>
      </span>
    );
  }

  if (id === "nav") {
    return (
      <span
        aria-hidden
        className={`flex size-full items-center justify-between border border-line bg-surface ${radius ?? "rounded-lg"}`}
        style={{ paddingInline: mg(compact ? 6 : 9) }}
      >
        <span className="flex items-center" style={{ gap: mg(compact ? 3 : 5) }}>
          <span className="rounded-full bg-accent" style={{ width: mg(compact ? 7 : 9), height: mg(compact ? 7 : 9) }} />
          <span className="font-display font-bold" style={text(compact ? 8 : 10)}>
            {UI.mgFaceNavBrand[lang]}
          </span>
        </span>
        {compact ? (
          // На телефоне ссылки уходят в меню: три полоски вместо двух слов
          <span className="flex flex-col" style={{ gap: mg(1.5) }}>
            {[0, 1, 2].map((line) => (
              <span key={line} className="block rounded-full bg-muted" style={{ width: mg(9), height: mg(1.5) }} />
            ))}
          </span>
        ) : (
          <span className="flex font-mono uppercase text-muted" style={{ gap: mg(8), ...text(8.5) }}>
            <span>{UI.mgFaceNavLink1[lang]}</span>
            <span>{UI.mgFaceNavLink2[lang]}</span>
          </span>
        )}
      </span>
    );
  }

  // Карточка: место под картинку, заголовок, строка текста
  return (
    <span
      aria-hidden
      className={`flex size-full flex-col border border-line bg-surface ${radius ?? "rounded-lg"}`}
      style={{ padding: mg(compact ? 5 : 7) }}
    >
      <span className="block shrink-0 rounded-md bg-bg-2" style={{ height: mg(compact ? 26 : 44) }} />
      <span className="font-display font-bold" style={{ marginTop: mg(compact ? 4 : 7), ...text(compact ? 9 : 11) }}>
        {UI.mgFaceCardTitle[lang]}
      </span>
      {compact ? null : (
        <span className="text-muted" style={{ marginTop: mg(3), ...text(10) }}>
          {UI.mgFaceCardText[lang]}
        </span>
      )}
    </span>
  );
}
