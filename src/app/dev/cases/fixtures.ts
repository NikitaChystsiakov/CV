/**
 * ФИКСТУРЫ — НЕ НАСТОЯЩИЕ ДАННЫЕ. Живут только здесь, для dev-превью
 * `/dev/cases`, которое в проде отдаёт 404 (`notFound()` в `page.tsx`).
 *
 * Кейсов у владельца пока нет (`profile.cases` пуст), а вёрстку экспозиции
 * надо видеть и проверять (`scripts/verify/b3-houses.mjs`). Поэтому:
 *   - тексты нарочно служебные — по ним видно, что это макет, а не факт;
 *   - «скриншоты» — ассеты городка из `public/scene`, а не нарисованные
 *     превью: кейсы показываются только реальными картинками, и выдумывать
 *     «интерфейс продукта» из div-ов правило проекта запрещает. Размеры —
 *     из манифеста конвейера, не руками.
 */

import manifest from "@/lib/scene-manifest.json";
import type { CaseStudy, Shot } from "@/lib/profile";

const FILES: Record<string, { src: string; width: number; height: number }> = manifest;

/** Ассет городка в роли скриншота — фикстура, подписана как фикстура */
function fixtureShot(name: string, n: number): Shot {
  return {
    ...FILES[name],
    alt: {
      ru: `Фикстура: картинка ${name} вместо скриншота ${n}`,
      en: `Fixture: the ${name} image standing in for screenshot ${n}`,
    },
  };
}

export const FIXTURE_CASES: CaseStudy[] = [
  {
    id: "fixture-a",
    title: { ru: "Фикстура А: длинное название кейса в две строки", en: "Fixture A: a long case title that wraps to two lines" },
    task: {
      ru: "Здесь задача клиента: что у него болело. Две-три строки, как у настоящего кейса, чтобы проверить перенос и ритм таблички.",
      en: "The client's task goes here: what hurt. Two or three lines, like a real case, to check wrapping and the plaque rhythm.",
    },
    solution: {
      ru: "Здесь решение: что сделано и почему именно так. Текст длиннее задачи — так обычно и бывает, и вёрстка должна это выдержать.",
      en: "The solution goes here: what was built and why this way. It is longer than the task, as usual, and the layout has to hold it.",
    },
    result: {
      ru: "Здесь результат, желательно в цифрах: было — стало.",
      en: "The result goes here, ideally in numbers: before - after.",
    },
    stack: ["Next.js", "TypeScript", "Tailwind"],
    shots: [fixtureShot("casesHouse", 1), fixtureShot("skillsHouse", 2), fixtureShot("technologiesHouse", 3)],
    url: "https://example.com",
  },
  {
    id: "fixture-b",
    title: { ru: "Фикстура Б", en: "Fixture B" },
    task: { ru: "Короткая задача.", en: "A short task." },
    solution: { ru: "Короткое решение.", en: "A short solution." },
    result: { ru: "Короткий результат.", en: "A short result." },
    stack: ["React"],
    shots: [fixtureShot("experienseHouse", 1)],
  },
  {
    id: "fixture-c",
    title: { ru: "Фикстура В: кейс без скриншота", en: "Fixture C: a case without a screenshot" },
    task: { ru: "Кейс, у которого нет картинки: табличка встаёт на всю ширину.", en: "A case with no image: the plaque takes the full width." },
    solution: { ru: "Проверка крайнего случая.", en: "An edge-case check." },
    result: { ru: "Рама в ряду кейсов показывает название.", en: "Its frame in the case row shows the title." },
    stack: [],
    shots: [],
  },
];
