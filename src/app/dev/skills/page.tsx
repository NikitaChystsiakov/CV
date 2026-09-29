import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DevPreview } from "../dev-preview";

/**
 * Dev-превью галереи дома навыков со стеком-фикстурой. На маршруте блок
 * стека появится, только когда владелец заполнит `profile.stack`; здесь его
 * вёрстку видно уже сейчас. В проде страницы нет (`notFound()`).
 */
export const metadata: Metadata = {
  title: "dev: skills",
  robots: { index: false, follow: false },
};

export default function DevSkillsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevPreview kind="skills" />;
}
