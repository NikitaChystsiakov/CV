import type { RouteStopKind } from "@/lib/route";

const SIZES: Record<RouteStopKind, { width: number; height: number }> = {
  hero: { width: 170, height: 56 },
  house: { width: 150, height: 84 },
  interlude: { width: 156, height: 34 },
  fork: { width: 150, height: 62 },
  outro: { width: 160, height: 24 },
};

/** Во сколько раз участок шире объекта на нём */
const PAD_RATIO = 1.3;

/**
 * Плейсхолдер объекта на маршруте: изометрический блок на CSS-трансформах.
 * Итерации 2–7 заменяют его реальным артом (SVG/спрайты) — размеры площадки
 * держим здесь, чтобы подмена не ломала раскладку маршрута.
 */
export function IsoPlaceholder({
  kind,
  hue,
  label,
}: {
  kind: RouteStopKind;
  hue: number;
  label: string;
}) {
  const { width, height } = SIZES[kind];
  const isNeon = kind === "fork";

  return (
    <div className="iso-scene grid place-items-center py-6">
      <div
        className="relative scale-[0.85] sm:scale-100"
        style={
          {
            "--iso-w": `${width}px`,
            "--iso-h": `${height}px`,
            "--iso-pad": `${Math.round(width * PAD_RATIO)}px`,
            width: `${width * 2}px`,
            height: `${width * 1.25}px`,
          } as React.CSSProperties
        }
      >
        {/* Площадка под объектом */}
        <div
          className="iso-pad absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-dashed"
          style={{
            borderColor: isNeon
              ? "color-mix(in oklab, var(--color-neon-1) 55%, transparent)"
              : "color-mix(in oklab, var(--color-line) 90%, transparent)",
            background: isNeon
              ? "color-mix(in oklab, var(--color-neon-1) 10%, transparent)"
              : "color-mix(in oklab, var(--color-bg-2) 70%, transparent)",
          }}
        />

        {/* Сам объект */}
        <div className="iso-box absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className="iso-box__face iso-box__top rounded-[6px]"
            style={{ background: faceColor(hue, isNeon, "top") }}
          />
          <div
            className="iso-box__face iso-box__side-a"
            style={{ background: faceColor(hue, isNeon, "side-a") }}
          />
          <div
            className="iso-box__face iso-box__side-b"
            style={{ background: faceColor(hue, isNeon, "side-b") }}
          />
        </div>

        {/* Подпись «здесь будет арт» */}
        <span className="absolute inset-x-0 bottom-0 text-center font-mono text-[11px] uppercase tracking-widest text-muted">
          {label}
        </span>
      </div>
    </div>
  );
}

function faceColor(hue: number, isNeon: boolean, face: "top" | "side-a" | "side-b") {
  if (isNeon) {
    const neon = face === "top" ? "var(--color-neon-2)" : "var(--color-neon-1)";
    const mix = face === "side-b" ? 45 : face === "side-a" ? 65 : 80;
    return `color-mix(in oklab, ${neon} ${mix}%, var(--color-neon-bg))`;
  }

  const lightness = face === "top" ? 68 : face === "side-a" ? 52 : 42;
  return `oklch(${lightness}% 0.09 ${hue})`;
}
