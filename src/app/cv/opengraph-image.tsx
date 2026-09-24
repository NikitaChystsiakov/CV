/**
 * Карточка ссылки на /cv — та же картинка городка, что у главной.
 *
 * Своя файловая конвенция нужна потому, что страница задаёт свой `openGraph`
 * (заголовок «резюме»), а метаданные сегментов сливаются неглубоко: объект
 * страницы затирает картинку корня целиком. Картинку не копируем — сегмент
 * отдаёт ту же функцию и те же размеры и подпись.
 */
import OgImage, { alt as ogAlt, contentType as ogType, size as ogSize } from "../opengraph-image";

export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogType;

export default OgImage;
