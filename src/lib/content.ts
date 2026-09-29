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

  // Разбор сайта (x-ray): награда за мини-игру. Одна строка на слой — имя и
  // одна техническая деталь, объяснений больше не надо
  xrayTitle: { ru: "Разбор сайта", en: "Site x-ray" },
  xrayCommand: { ru: "Разобрать сайт", en: "Take the site apart" },
  xrayKeywords: {
    ru: "слои рентген 3d x-ray как устроено",
    en: "layers x-ray 3d devtools how it works",
  },
  xrayClose: { ru: "Закрыть разбор", en: "Close the x-ray" },
  xrayLayers: { ru: "Слои", en: "Layers" },
  xrayGrid: { ru: "Сетка клеток", en: "Cell grid" },
  xrayGround: { ru: "Земля", en: "Ground" },
  xrayGroundNote: { ru: "фон и сетка из токенов темы", en: "background and grid from theme tokens" },
  xrayRoad: { ru: "Дорога", en: "Road" },
  xrayRoadNote: { ru: "SVG-серпантин, одна лента", en: "SVG switchback, one ribbon" },
  xrayTown: { ru: "Городок", en: "Town" },
  xrayTownNote: { ru: "клетки town.ts, сортировка по глубине", en: "town.ts cells, depth-sorted" },
  xraySky: { ru: "Небо", en: "Sky" },
  xraySkyNote: { ru: "облака на CSS, звёзды J2000", en: "CSS clouds, J2000 stars" },
  xrayText: { ru: "Текст", en: "Text" },
  xrayTextNote: { ru: "route.ts, строки парой ru/en", en: "route.ts, strings in ru/en pairs" },
  xrayLandmarks: { ru: "Площадки", en: "Landmarks" },
  xrayLandmarksNote: { ru: "партия по ходам, трофеи", en: "a chess game move by move, trophies" },
  xrayMap: { ru: "Карта", en: "Map" },
  xrayMapNote: { ru: "Скорпион, остановки на звёздах", en: "Scorpius, stops on its stars" },
  xrayHud: { ru: "Панель", en: "HUD" },
  xrayHudNote: { ru: "прогресс пишется в DOM через ref", en: "progress written to the DOM via ref" },

  // --- Б6. Волейбол: мини-игра «Держи мяч» на площадке у дороги ---------------
  // На экране — только слово на кнопке, подсказка на время игры и строка
  // ачивки во всплывашке; остальное — подписи для экранного диктора
  volleyPlay: { ru: "Сыграть", en: "Play" },
  volleyPlayLabel: {
    ru: "Волейбол: сыграть. Выиграй три розыгрыша подряд",
    en: "Volleyball: play. Win three rallies in a row",
  },
  volleyHit: { ru: "Бей", en: "Hit" },
  volleyHitLabel: {
    ru: "Отбить мяч: клик, пробел или Enter. Escape — стоп",
    en: "Hit the ball: click, Space or Enter. Escape stops",
  },
  volleyHint: { ru: "бей, когда мяч у кольца", en: "hit as the ball meets the ring" },
  volleyTrophy: { ru: "Трофей", en: "Trophy" },
  volleyAchievement: { ru: "Три розыгрыша подряд", en: "Three rallies in a row" },
  volleySaidStart: { ru: "Подача соперника", en: "Opponent serves" },
  volleySaidWon: { ru: "Очко ваше. Серия {n} из 3", en: "Your point. Streak {n} of 3" },
  volleySaidLost: { ru: "Мяч упал. Серия сначала", en: "Ball down. Streak reset" },
  volleySaidStopped: { ru: "Игра остановлена", en: "Game stopped" },
} satisfies Record<string, Localized>;

