import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DevPreview } from "../dev-preview";

/**
 * Dev-превью экспозиции дома кейсов на фикстурах (`fixtures.ts`).
 *
 * Кейсов у владельца пока нет, дом кейсов на маршруте не открывается — а
 * вёрстку надо видеть глазами и гонять в `verify`. В проде страницы нет:
 * `notFound()` до всякого рендера, фикстуры в прод не уезжают.
 */
export const metadata: Metadata = {
  title: "dev: cases",
  robots: { index: false, follow: false },
};

export default function DevCasesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevPreview kind="cases" />;
}
