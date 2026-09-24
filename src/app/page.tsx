import { RouteFooter } from "@/components/route/route-footer";
import { RouteTrack } from "@/components/route/route-track";
import { SkyBody } from "@/components/route/sky-body";

export default function Home() {
  return (
    <main className="iso-grid relative">
      {/* Мягкое свечение над городком, чтобы сетка не читалась как таблица */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, var(--color-accent) 12%, transparent) 0%, transparent 60%)",
        }}
      />

      {/* Солнце в светлой теме, созвездия в тёмной */}
      <SkyBody />

      <RouteTrack />

      {/* Зона оверскролла (resistance + бонусная сцена + ачивки) — итерация 7 */}
      <RouteFooter />
    </main>
  );
}
