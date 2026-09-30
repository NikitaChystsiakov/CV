/**
 * Строки интерфейса — всё, что видно на экране и не является контентом
 * остановки (тот живёт в `route.ts`).
 *
 * В разметке строк быть не должно: иначе переключатель языка меняет часть
 * страницы, а часть оставляет по-русски. Проверка в `verify` ищет кириллицу
 * после переключения на английский.
 */

import type { Localized } from "@/lib/i18n";

export const UI = {
  name: { ru: "Никита Чистяков", en: "Nikita Chystsiakov" },
  role: { ru: "фронтенд-разработчик", en: "frontend developer" },

  heroTitle: { ru: "Резюме, по которому", en: "A resume you walk" },
  heroAccent: { ru: "идут пешком", en: "on foot" },

  placeholder: { ru: "плейсхолдер · итерация", en: "placeholder · iteration" },

  skipToRoute: { ru: "К маршруту", en: "Skip to route" },
  routeMap: { ru: "Карта маршрута", en: "Route map" },
  routeMenu: { ru: "Маршрут", en: "Route" },
  routeMenuOpen: { ru: "Открыть список остановок", en: "Open the list of stops" },
  routeMenuClose: { ru: "Закрыть список остановок", en: "Close the list of stops" },

  pdf: { ru: "PDF", en: "PDF" },
  pdfTitle: { ru: "Скачать резюме в PDF", en: "Download the resume as PDF" },

  langTitle: { ru: "Switch to English", en: "Переключить на русский" },
  themeTitle: { ru: "Сменить тему", en: "Switch theme" },

  outro: {
    ru: "конец маршрута · дальше живёт пасхалка",
    en: "end of the route · an easter egg lives further on",
  },

  roomClose: { ru: "Закрыть комнату", en: "Close the room" },

  // Подпись к карточке ссылки (og:image:alt) — её читают скринридеры там,
  // где картинка не загрузилась.
  ogAlt: {
    ru: "Никита Чистяков, фронтенд-разработчик — изометрический городок резюме",
    en: "Nikita Chystsiakov, frontend developer - the isometric resume town",
  },

  // Подпись кнопки-дома. Видимого текста у неё нет — дом и есть кнопка, —
  // поэтому строка уходит в `aria-label` вместе с названием остановки:
  // «Дом опыта: зайти внутрь». Дом без комнаты кнопкой не становится вовсе
  enterHouse: { ru: "зайти внутрь", en: "step inside" },

  constellationUnlocked: { ru: "созвездие открыто", en: "constellation unlocked" },
  constellationOf: { ru: "Созвездие", en: "Constellation" },
  more: { ru: "подробнее", en: "details" },

  // --- Резюме одним экраном (/cv) -------------------------------------------
  // Кнопка панели. «CV» на обоих языках: нанимающий узнаёт его без перевода,
  // и на 390px в панели нет места под слово длиннее — там уже имя, маршрут,
  // язык и тема. Смысл «без прогулки» уходит в подсказку `cvLinkTitle`
  cvLink: { ru: "CV", en: "CV" },
  cvLinkTitle: {
    ru: "Резюме одной страницей — без прогулки",
    en: "One-page CV - no walk needed",
  },
  // Обратная дорога с /cv. Кнопка стоит на месте «CV», поэтому тоже короткая
  toTown: { ru: "В город", en: "To town" },
  toTownTitle: {
    ru: "Вернуться на маршрут по городку",
    en: "Back to the walk through the town",
  },
  skipToCv: { ru: "К резюме", en: "Skip to resume" },

  // Метаданные страницы. Сервер языка не знает (он в sessionStorage), поэтому
  // в <title> уходит русская строка — как и у главной
  cvMetaTitle: { ru: "Никита Чистяков — резюме", en: "Nikita Chystsiakov - resume" },
  cvMetaDescription: {
    ru: "Резюме фронтенд-разработчика одной страницей — для тех, кому некогда гулять по городку.",
    en: "A frontend developer's resume on one page - for those with no time to walk the town.",
  },

  // Заголовки разделов резюме. Раздел без фактов не рендерится вовсе
  cvCases: { ru: "Кейсы", en: "Cases" },
  cvStack: { ru: "Стек", en: "Stack" },
  cvJobs: { ru: "Опыт", en: "Experience" },
  cvEducation: { ru: "Образование", en: "Education" },
  cvAwards: { ru: "Спорт и награды", en: "Sport and awards" },
  cvContacts: { ru: "Контакты", en: "Contacts" },

  // Части кейса: задача клиента, решение, результат
  cvTask: { ru: "Задача", en: "Task" },
  cvSolution: { ru: "Решение", en: "Solution" },
  cvResult: { ru: "Результат", en: "Result" },

  cvPresent: { ru: "сейчас", en: "now" },

  // Честный уровень владения технологией (`SkillLevel` в profile.ts)
  levelDaily: { ru: "каждый день", en: "every day" },
  levelConfident: { ru: "уверенно", en: "confident" },
  levelFamiliar: { ru: "знаком", en: "familiar" },

  // --- Командная палитра (⌘K) ---------------------------------------------
  // Имя диалога и подпись кнопки, которая его открывает
  paletteTitle: { ru: "Поиск по городу", en: "Search the town" },
  // Короткая: на 390px длиннее этого поле обрезает подсказку на полуслове
  palettePlaceholder: { ru: "Остановка или команда", en: "A stop or a command" },
  paletteClose: { ru: "Закрыть поиск", en: "Close search" },
  paletteGroupRoute: { ru: "Маршрут", en: "Route" },
  paletteGroupSettings: { ru: "Настройки", en: "Settings" },
  paletteGroupResume: { ru: "Резюме", en: "Resume" },
  // Подпись у остановки, на которой посетитель стоит сейчас
  paletteHere: { ru: "вы здесь", en: "you are here" },
  // Подпись команды темы называет, КУДА она переключит, — это действие, а не
  // состояние (у переключателя в панели наоборот: он показывает текущее)
  paletteThemeDark: { ru: "Включить тёмную тему", en: "Switch to dark theme" },
  paletteThemeLight: { ru: "Включить светлую тему", en: "Switch to light theme" },
  paletteLang: { ru: "Переключить на английский", en: "Switch to Russian" },
  paletteCv: { ru: "Резюме одним экраном", en: "Resume on one screen" },
  // Ключевые слова команд: не видны, но по ним ищет поиск. Посетитель набирает
  // «ночь» или «сводка», а не точное название команды
  paletteThemeKeywords: {
    ru: "тема оформление ночь день тёмная светлая",
    en: "theme appearance night day dark light mode",
  },
  paletteLangKeywords: {
    ru: "язык русский английский",
    en: "language english russian",
  },
  paletteCvKeywords: {
    ru: "резюме кратко одна страница сводка",
    en: "cv resume summary one page",
  },
  paletteEmpty: { ru: "Ничего не нашлось", en: "Nothing found" },
  paletteEmptyHint: {
    ru: "Ищу по остановкам и командам — на русском и английском",
    en: "I search stops and commands in both Russian and English",
  },
  // Для скринридера: «Найдено: 3» после каждого изменения запроса
  paletteFound: { ru: "Найдено", en: "Results" },
  paletteHintMove: { ru: "выбрать", en: "move" },
  paletteHintRun: { ru: "выполнить", en: "run" },
  paletteHintClose: { ru: "закрыть", en: "close" },
  // Подписи клавиш. Одинаковые в обоих языках, но живут здесь по правилу
  // «видимых строк в разметке нет»
  paletteKeyMac: { ru: "⌘K", en: "⌘K" },
  paletteKeyOther: { ru: "Ctrl K", en: "Ctrl K" },
  paletteKeyEsc: { ru: "esc", en: "esc" },

  // --- Мини-игра «Собери интерфейс» (Э9) ------------------------------------
  // Группа целиком и её части — для скринридера
  mgGame: { ru: "Мини-игра: собери страницу", en: "Mini-game: build the page" },
  mgTray: { ru: "Детали", en: "Parts" },
  mgLayout: { ru: "Макет страницы", en: "Page layout" },
  // Строка состояния: она же подсказка до первого хода и она же aria-live.
  // `{piece}` и `{left}` подставляет компонент. Сообщения короткие намеренно:
  // строка держит постоянную высоту в две строки на самой узкой колонке,
  // иначе смена сообщения сдвигала бы доску под пальцем
  mgHint: {
    ru: "Перетащи блоки в макет.",
    en: "Drag the blocks into the layout.",
  },
  mgPicked: {
    ru: "«{piece}» в руке. Выбери место.",
    en: "{piece} picked. Choose a place.",
  },
  mgPlaced: {
    ru: "«{piece}» на месте. Осталось: {left}.",
    en: "{piece} is in place. {left} to go.",
  },
  mgWrong: {
    ru: "«{piece}» сюда не встаёт.",
    en: "{piece} doesn't fit there.",
  },
  mgNoPick: { ru: "Сначала выбери блок.", en: "Pick a block first." },
  mgCancel: { ru: "Блок положен обратно.", en: "Block put back." },
  // Финал. Реплики персонажа нет — персонаж ещё не пришёл ассетом, поэтому
  // реагирует сама игра. Ачивка выдаётся один раз: повторный сбор её не дублирует
  mgDone: { ru: "Собрано. Можно катить в прод.", en: "Assembled. Ship it." },
  mgDoneAgain: {
    ru: "Снова собрано. Ачивка уже есть.",
    en: "Assembled again. Achievement already yours.",
  },
  mgAchievement: { ru: "Ачивка", en: "Achievement" },
  mgAchievementName: { ru: "Верстальщик", en: "Layout builder" },
  mgAgain: { ru: "Собрать заново", en: "Play again" },
  mgSkip: { ru: "Пропустить", en: "Skip" },
  mgSkipLabel: {
    ru: "Пропустить мини-игру и идти к следующей остановке",
    en: "Skip the mini-game and go on to the next stop",
  },
  // Клавиатурная альтернатива перетаскиванию — описание у каждого блока
  mgKeysHint: {
    ru: "Enter или пробел — взять блок, затем то же на месте в макете. Escape — положить обратно.",
    en: "Enter or Space picks a block up, then press it again on a place in the layout. Escape puts it back.",
  },
  // Имена блоков
  mgNav: { ru: "Навбар", en: "Navbar" },
  mgCard: { ru: "Карточка", en: "Card" },
  mgInput: { ru: "Поле ввода", en: "Input" },
  mgButton: { ru: "Кнопка", en: "Button" },
  // Слоты: подписей на экране нет, подсказка — форма. Скринридеру форму описываем
  mgSlotNav: {
    ru: "Место в макете: полоса во всю ширину сверху",
    en: "Layout place: a full-width strip at the top",
  },
  mgSlotCard: {
    ru: "Место в макете: большой прямоугольник слева",
    en: "Layout place: a large box on the left",
  },
  mgSlotInput: {
    ru: "Место в макете: длинная плашка справа",
    en: "Layout place: a long bar on the right",
  },
  mgSlotButton: {
    ru: "Место в макете: короткая круглая плашка справа внизу",
    en: "Layout place: a short rounded bar, bottom right",
  },
  // Текст на лицах блоков — это интерфейс, поэтому и он переводится
  mgFaceButton: { ru: "Написать", en: "Say hi" },
  mgFaceInput: { ru: "email", en: "email" },
  mgFaceNavBrand: { ru: "НЧ", en: "NC" },
  mgFaceNavLink1: { ru: "кейсы", en: "cases" },
  mgFaceNavLink2: { ru: "опыт", en: "work" },
  mgFaceCardTitle: { ru: "Кейс", en: "Case" },
  mgFaceCardText: { ru: "было → стало", en: "before → after" },
  // Раунды 2 и 3: адаптив и «найди баг». Те же правила длины: две строки
  mgLevel: { ru: "Раунд {n} из 3", en: "Round {n} of 3" },
  mgNext: { ru: "Дальше", en: "Next" },
  mgNextLabel: { ru: "Следующий раунд", en: "Next round" },
  mgRestart: { ru: "Сначала", en: "From the top" },
  mgLayoutPhone: { ru: "Макет телефона", en: "Phone layout" },
  mgHintPhone: {
    ru: "Теперь телефон. Те же блоки — в одну колонку.",
    en: "Now a phone. Same blocks, one column.",
  },
  mgDonePhone: { ru: "Адаптив готов. Дальше — баги.", en: "Responsive done. Next up: bugs." },
  mgReference: { ru: "Макет дизайнера", en: "Designer's mockup" },
  mgBuild: { ru: "Вёрстка", en: "The build" },
  mgHintBugs: {
    ru: "Слева макет, справа вёрстка. Найди три бага.",
    en: "Mockup on the left, build on the right. Find three bugs.",
  },
  mgBugFound: { ru: "Есть: {bug}. Осталось: {left}.", en: "Got it: {bug}. {left} to go." },
  mgBugNone: { ru: "«{piece}» — по макету. Ищи дальше.", en: "{piece} matches the mockup. Keep looking." },
  mgBugCard: { ru: "карточка съехала", en: "the card is off" },
  mgBugButton: { ru: "текст не влез в кнопку", en: "the label overflows" },
  mgBugInput: { ru: "не то скругление поля", en: "wrong input radius" },
  mgDoneBugs: { ru: "Три из трёх. Ревью пройдено.", en: "Three of three. Review passed." },
  mgAchievementMaster: { ru: "Ревьюер", en: "Reviewer" },
  mgXray: { ru: "Разобрать сайт", en: "Take the site apart" },

  // --- Блок 5: «Разбор сайта» (x-ray) — награда за мини-игру ----------------
  // На слой три строки: имя, одна строка о приёме (видна всегда) и
  // «подробнее» под кликом — как сделано и почему. Факты — из кода слоёв,
  // имена файлов в `xrayFiles` в snapshot.ts, они не переводятся.
  xrayTitle: { ru: "Разбор сайта", en: "Site x-ray" },
  xraySubtitle: { ru: "Этот экран, разложенный на слои", en: "This screen, split into its layers" },
  xrayCommand: { ru: "Разобрать сайт", en: "Take the site apart" },
  xrayKeywords: {
    ru: "слои рентген 3d x-ray как устроено",
    en: "layers x-ray 3d devtools how it works",
  },
  xrayClose: { ru: "Закрыть разбор", en: "Close the x-ray" },
  xrayLayers: { ru: "Слои", en: "Layers" },
  xrayGrid: { ru: "Сетка клеток", en: "Cell grid" },
  xrayHint: {
    ru: "Тяните сцену или ←→ — поворот · ↑↓ — слой · Enter — подробнее",
    en: "Drag or ←→ to rotate · ↑↓ layer · Enter for details",
  },
  xrayHintStatic: { ru: "↑↓ — слой · Enter — подробнее", en: "↑↓ layer · Enter for details" },
  xrayTour: { ru: "Показать по шагам", en: "Walk me through" },
  xrayTourStop: { ru: "Остановить показ", en: "Stop the walkthrough" },
  xrayEmpty: { ru: "На этом экране слой пуст.", en: "This layer is empty on this screen." },
  xrayHow: { ru: "Как сделан сам разбор", en: "How this x-ray works" },
  xrayHowText: {
    ru: "Это не скриншот: в момент открытия видимые элементы каждого слоя копируются и встают на свои места. Живую страницу в 3D не разложить — preserve-3d сплющивается от opacity, overflow и filter у любого предка. У каждой пластины своя матрица с perspective() без общего 3D-контекста: так кадр дешевле. Поворот пишется в transform через ref, React на кадре не участвует.",
    en: "This isn't a screenshot: on open, the visible elements of every layer are cloned into place. The live page can't be exploded in 3D — preserve-3d flattens under opacity, overflow or filter on any ancestor. Each plate gets its own matrix with perspective() instead of a shared 3D context, which keeps frames cheap. Rotation is written to transform via a ref; React stays out of the frame loop.",
  },

  xrayGround: { ru: "Земля", en: "Ground" },
  xrayGroundNote: {
    ru: "фон и изо-сетка — CSS-градиенты на токенах темы",
    en: "background and iso grid: CSS gradients on theme tokens",
  },
  xrayGroundMore: {
    ru: "Сетка — два repeating-linear-gradient под ±30°, без картинок и canvas. Цвета — токены темы, поэтому ночь — это один класс .dark, а не второй набор стилей. Свечение сверху — radial-gradient на акценте.",
    en: "The grid is two repeating-linear-gradients at ±30°: no images, no canvas. Colours are theme tokens, so night mode is one .dark class, not a second stylesheet. The glow on top is a radial-gradient on the accent.",
  },
  xrayRoad: { ru: "Дорога", en: "Road" },
  xrayRoadNote: {
    ru: "один SVG-путь, пройденное — stroke-dasharray",
    en: "one SVG path; the walked part is stroke-dasharray",
  },
  xrayRoadMore: {
    ru: "Серпантин от арки до финиша — один <path> из карты town.ts на всю высоту маршрута, толщину держит vector-effect: non-scaling-stroke. Пройденное — тот же путь со stroke-dasharray: длина в экранных пикселях меряется разово и на resize, а доля пишется в DOM через ref, без рендера React на кадр.",
    en: "The switchback from the arch to the finish is one <path> from the town.ts map, stretched over the whole route; vector-effect: non-scaling-stroke keeps its width. The walked part is the same path with stroke-dasharray: its on-screen length is measured once and on resize, and the fraction goes to the DOM via a ref, with no React render per frame.",
  },
  xrayTown: { ru: "Городок", en: "Town" },
  xrayTownNote: {
    ru: "клетки изо-сетки 30°, одна сортировка по глубине",
    en: "30° iso grid cells, one depth sort",
  },
  xrayTownMore: {
    ru: "Дома и декор — рендеры владельца, стоят на клетках карты town.ts, а не «на глаз». Порядок отрисовки — одна сортировка по глубине u + v, поэтому фонарь перед домом перекрывает дом по построению. Левые остановки — та же таблица, отражённая по оси, весь городок масштабируется одним множителем --town-unit. Клик по дому открывает комнату на CSS 3D.",
    en: "Houses and props are the owner's renders, placed on cells of the town.ts map rather than by eye. Draw order is one depth sort by u + v, so a lamp in front of a house covers it by construction. Left-hand stops reuse the same table mirrored, and the whole town scales by a single --town-unit multiplier. Clicking a house opens a room built in CSS 3D.",
  },
  xrayWalker: { ru: "Персонаж", en: "Walker" },
  xrayWalkerNote: {
    ru: "кадр шага — по пройденному пути, а не по времени",
    en: "the step frame follows distance walked, not time",
  },
  xrayWalkerMore: {
    ru: "Ролики ходьбы владельца конвейер режет в полосы кадров и вырезает фон хромакеем. Фаза шага копится от пройденного по дороге расстояния, поэтому ноги не скользят; частота упирается в потолок — два цикла шага в секунду. Разворот — с гистерезисом, позиция и кадр пишутся в transform через ref.",
    en: "A build script cuts the owner's walking clips into frame strips and keys out the background. The step phase accumulates from distance walked along the road, so the feet never slide; cadence is capped at two stride cycles a second. Turning has hysteresis; position and frame are written to transform via a ref.",
  },
  xraySky: { ru: "Небо", en: "Sky" },
  xraySkyNote: {
    ru: "облака — CSS-анимация, звёзды — координаты J2000",
    en: "clouds are CSS animation, stars are J2000 coordinates",
  },
  xraySkyMore: {
    ru: "Облака — серверный компонент без состояния: дрейф на CSS keyframes, разброс — детерминированный ЛКГ, чтобы разметка сервера и клиента совпала. Дальше по маршруту по земле ползут только их тени. Ночью — созвездия из настоящих звёзд J2000 в гномонической проекции. Свет солнца и луны — radial-gradient, переключение классами dark:, без JS.",
    en: "Clouds are a stateless server component: drift is CSS keyframes, placement is a seeded LCG so server and client markup match. Further down the route only their shadows cross the ground. At night, constellations of real J2000 stars in a gnomonic projection. Sun and moon light is a radial-gradient switched by dark: classes, no JS.",
  },
  xrayText: { ru: "Текст", en: "Text" },
  xrayTextNote: {
    ru: "каждая строка — пара { ru, en }, в разметке строк нет",
    en: "every string is a { ru, en } pair, none in the markup",
  },
  xrayTextMore: {
    ru: "Остановки идут по порядку из route.ts, строки интерфейса — из content.ts. Язык живёт в sessionStorage и читается через useSyncExternalStore, так что сервер и клиент не расходятся. Мини-игра — тоже здесь: мышь, перо и палец идут одним кодом через Pointer Events, полёт блока в слот — FLIP на Web Animations.",
    en: "Stops come in order from route.ts, UI strings from content.ts. Language lives in sessionStorage and is read with useSyncExternalStore, so server and client never disagree. The mini-game lives here too: mouse, pen and finger share one Pointer Events path, and a block flying into its slot is FLIP on Web Animations.",
  },
  xrayLandmarks: { ru: "Площадки", en: "Landmarks" },
  xrayLandmarksNote: {
    ru: "партия по ходам на доске, замеренной по файлу",
    en: "a game replayed on a board measured from its file",
  },
  xrayLandmarksMore: {
    ru: "Шахматный стол собран из ассетов владельца: ромб поля снят по пикселям файла доски, фигура встаёт центром основания, а не углом картинки. Партия из chess-games.ts разыгрывается по ходам. Трофеи по клику показывают тот же текст, что полка в доме опыта: источник один, trophies.ts.",
    en: "The chess table is built from the owner's assets: the board's rhombus is measured in the file's pixels, and each piece stands on the centre of its base, not the corner of its image. A game from chess-games.ts is replayed move by move. Trophies show the same text as the shelf in the experience house: one source, trophies.ts.",
  },
  xrayMap: { ru: "Карта", en: "Map" },
  xrayMapNote: {
    ru: "созвездие Скорпиона, остановки — на его звёздах",
    en: "the Scorpius constellation, stops on its stars",
  },
  xrayMapMore: {
    ru: "Скорпион по настоящим координатам: остановки сидят на опорных звёздах от головы к жалу, остальные звёзды — фон, дорисовывать нельзя. Карта перерисовывается только при смене остановки, а не на каждом кадре; клик по звезде ведёт к дому через Lenis.",
    en: "Scorpius from real coordinates: stops sit on its key stars from head to stinger, the other stars are background and nothing is invented. The map re-renders only when the stop changes, not every frame; clicking a star takes you to the house via Lenis.",
  },
  xrayHud: { ru: "Панель", en: "HUD" },
  xrayHudNote: {
    ru: "прогресс — scaleX от motion value, без рендера React",
    en: "progress is scaleX from a motion value, no React render",
  },
  xrayHudMore: {
    ru: "Линия прогресса сверху — transform: scaleX, привязанный к прогрессу скролла, поэтому React на кадр не перерисовывается. Имя остановки хранится в состоянии, но обновляется только когда остановка сменилась. Скролл ведёт Lenis; ⌘K открывает палитру с поиском по остановкам и командам.",
    en: "The progress line on top is transform: scaleX bound to scroll progress, so React never re-renders per frame. The stop name is state, but only updates when the stop actually changes. Scrolling runs on Lenis; ⌘K opens a palette that searches stops and commands.",
  },
} satisfies Record<string, Localized>;

