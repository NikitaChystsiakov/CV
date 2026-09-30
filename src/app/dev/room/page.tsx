import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RoomPreview } from "./room-preview";

/**
 * Dev-превью комнаты дома (блок 4): CSS-комната и режим «интерьер картинкой».
 *
 * Файлов интерьеров у владельца пока нет, поэтому на маршруте комнаты
 * собраны на CSS 3D. Чтобы режим картинки можно было увидеть и проверить в
 * `verify`, здесь он включается параметром `?art=1` с фикстурой. В проде
 * страницы нет: `notFound()` до всякого рендера.
 */
export const metadata: Metadata = {
  title: "dev: room",
  robots: { index: false, follow: false },
};

export default function DevRoomPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RoomPreview />;
}
