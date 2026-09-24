/**
 * Небо над городком.
 *
 * Важное наблюдение из первой версии: в изометрии, снятой почти сверху, облако,
 * нарисованное на уровне домов, читается не как небо, а как туман или лужа.
 * Поэтому слой разделён на два:
 *
 *   1. над hero и первыми домами — настоящие облака: там кадр смотрит вдаль,
 *      и небо в нём есть;
 *   2. дальше по маршруту — только мягкие тени облаков, ползущие по земле.
 *      Тень читается однозначно: над городом что-то летит. Это даёт нужное
 *      «всегда 3-4 облака на экране», не превращая газон в водоём.
 *
 * Дрейф — CSS-анимация (класс .cloud-drift), а не JS: объектов много, и каждый
 * должен стоить ноль. Компонент серверный, состояния у него нет.
 */

/** Облако видно на экране примерно 60% своего пути, поэтому их нужно с запасом. */
const PER_STOP = 6;

/** До какой остановки кадр ещё «со небом», а не вид сверху. */
const SKY_STOPS = 2;

/** Простой ЛКГ: нужен предсказуемый разброс, одинаковый на сервере и клиенте. */
function seeded(seed: number) {
  let state = seed * 4517 + 12345;
  return () => {
    state = (state * 4517 + 12345) % 233280;
    return state / 233280;
  };
}

export function Clouds({ stopCount }: { stopCount: number }) {
  const slice = 100 / stopCount;
  const items = [];

  for (let stop = 0; stop < stopCount; stop += 1) {
    const rnd = seeded(stop + 7);

    for (let n = 0; n < PER_STOP; n += 1) {
      const scale = 0.45 + rnd() * 0.5;
      items.push({
        key: `${stop}-${n}`,
        withCloud: stop < SKY_STOPS,
        top: stop * slice + slice * (0.02 + rnd() * 0.9),
        scale,
        // Мелкое дальше, поэтому плывёт медленнее
        duration: Math.round(170 - scale * 70),
        delay: -Math.round(rnd() * 170),
        // Позиция в статичном режиме (prefers-reduced-motion): дрейфа нет,
        // и облако стоит там, куда его поставил тот же ЛКГ — от края до края,
        // а не колонной в одной точке. Без Math.random: разметка сервера и
        // клиента обязана совпасть.
        staticX: Math.round(4 + rnd() * 80),
        opacity: 0.35 + scale * 0.35,
      });
    }
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map(({ key, withCloud, top, scale, duration, delay, staticX, opacity }) => (
        <div key={key} data-sky className="absolute inset-x-0" style={{ top: `${top}%` }}>
          <div
            className="cloud-drift w-fit"
            style={
              {
                "--cloud-duration": `${duration}s`,
                "--cloud-delay": `${delay}s`,
                "--cloud-x": `${staticX}vw`,
              } as React.CSSProperties
            }
          >
            <div style={{ transform: `scale(${scale.toFixed(2)})` }}>
              {withCloud && (
                <div style={{ opacity }}>
                  <Cloud />
                </div>
              )}
              <CloudShadow strong={withCloud} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Тень облака на земле. Радиальный градиент даёт мягкий край без фильтров. */
function CloudShadow({ strong }: { strong: boolean }) {
  return (
    <div
      className="h-16 w-64 rounded-[50%]"
      style={{
        background:
          "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 70%, transparent), transparent)",
        opacity: strong ? 0.1 : 0.07,
      }}
    />
  );
}

function Cloud() {
  return (
    <svg width="240" height="90" viewBox="0 0 240 90" fill="none">
      {/* Подбрюшье чуть темнее корпуса: без него форма не читается на близком по светлоте фоне */}
      <g fill="var(--color-cloud-shade)">
        <ellipse cx="70" cy="64" rx="62" ry="24" />
        <ellipse cx="176" cy="66" rx="46" ry="21" />
      </g>
      <g fill="var(--color-cloud)">
        <ellipse cx="70" cy="56" rx="60" ry="28" />
        <ellipse cx="128" cy="42" rx="47" ry="33" />
        <ellipse cx="176" cy="58" rx="44" ry="25" />
      </g>
    </svg>
  );
}
