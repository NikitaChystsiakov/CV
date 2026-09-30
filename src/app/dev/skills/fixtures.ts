/**
 * ФИКСТУРА — НЕ НАСТОЯЩИЙ СТЕК. Только для dev-превью `/dev/skills`, которое
 * в проде отдаёт 404. Названия — заведомо служебные («Tech A»), чтобы их
 * нельзя было принять за факт о владельце.
 */

import type { Skill } from "@/lib/profile";

export const FIXTURE_STACK: Skill[] = [
  { name: "Tech A", level: "daily", note: { ru: "Фикстура: пояснение в одну фразу", en: "Fixture: a one-line note" } },
  { name: "Tech B", level: "daily" },
  { name: "Tech C", level: "confident" },
  { name: "Tech D", level: "confident", note: { ru: "Фикстура: ещё одно пояснение", en: "Fixture: another note" } },
  { name: "Tech E", level: "familiar" },
];
