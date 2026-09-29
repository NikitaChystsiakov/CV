import Image from "next/image";

import { VolleyBall } from "@/components/route/landmarks";
import { VOLLEYBALL_COURT } from "@/lib/scene-assets";

/**
 * Волейбольная площадка у дороги: корт владельца и мяч кодом поверх.
 *
 * Собрана так же, как шахматы (`chess-scene.tsx`): внутри себя в базовых
 * пикселях, а в масштаб городка её переводит обёртка `.town-scale`. Мяч —
 * svg в координатах самого корта, поэтому траектория над сеткой не
 * разъезжается с картинкой ни на одной ширине.
 *
 * При reduced-motion мяч стоит (анимации `volley-*` выключены в globals.css)
 * — над ближней половиной поля, как перед подачей.
 */
export function VolleyballScene() {
  const court = VOLLEYBALL_COURT;
  return (
    <div data-volleyball-scene className="relative" style={{ width: `${court.display}px` }}>
      <div
        aria-hidden
        className="absolute inset-x-[8%] bottom-[2%] -z-10 h-[16%]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 40%, transparent), transparent)",
        }}
      />
      <Image
        src={court.src}
        alt=""
        width={court.width}
        height={court.height}
        sizes={`${court.display}px`}
        className="scene-art h-auto w-full select-none"
      />
      <VolleyBall />
    </div>
  );
}
