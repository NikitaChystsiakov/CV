import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VolleyballLandmark } from "@/components/volleyball";

/**
 * Превью волейбольной площадки для разработки и для `verify` (секция Б6).
 *
 * В продакшне страницы нет: `notFound()` до любого рендера. Над площадкой —
 * пустые два с половиной экрана: так проверяется, что код игры не грузится,
 * пока площадка не подъехала, а под ней — экран, чтобы было куда прокрутить
 * колесом над кортом.
 *
 * `?assist=1` включает упрощённого соперника: любой удар по летящему к нам
 * мячу — очко. Только здесь: на маршруте площадка стоит без параметров.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function VolleyballPreview({ searchParams }: PageProps<"/dev/volleyball">) {
  if (process.env.NODE_ENV === "production") notFound();

  const { assist } = await searchParams;

  return (
    <main className="min-h-svh bg-bg">
      <div data-volley-spacer style={{ height: "250svh" }} />
      <div className="flex justify-center">
        <VolleyballLandmark assist={assist === "1"} />
      </div>
      <div style={{ height: "120svh" }} />
    </main>
  );
}
