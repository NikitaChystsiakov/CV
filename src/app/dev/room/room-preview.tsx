"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { HouseRoom } from "@/components/room/house-room";
import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { ROOM_SPOTS, type RoomArt } from "@/lib/room-art";
import { routeStopsAll } from "@/lib/route";
import { roomFor } from "@/lib/rooms";
import manifest from "@/lib/scene-manifest.json";
import { useLang } from "@/lib/use-lang";

/**
 * ФИКСТУРА: вместо интерьера — ассет финиша маршрута. Это не арт комнаты, а
 * картинка нужного размера, чтобы проверить раскладку по точкам ROOM_SPOTS.
 * Живёт только на dev-странице, в прод не уезжает.
 */
const FIXTURE_ART: RoomArt = { ...manifest.end, spots: ROOM_SPOTS };

export function RoomPreview() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}

function Preview() {
  const { lang } = useLang();
  const say = useSay();
  const params = useSearchParams();
  const [open, setOpen] = useState(true);
  const slots = roomFor("experience", lang);

  return (
    <main data-dev-preview="room" className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <p className="font-mono text-xs text-muted">{say(UI.devFixture)}</p>
      <button
        type="button"
        data-dev-reopen
        onClick={() => setOpen(true)}
        className="demo-chip mt-4 rounded-full px-4 py-2 text-sm font-medium"
      >
        {say(UI.devReopen)}
      </button>
      {open ? <div aria-hidden className="fixed inset-0 z-[54] bg-room-veil" /> : null}
      {open && slots ? (
        <HouseRoom
          title={say(routeStopsAll.find((stop) => stop.id === "experience")!.title)}
          slots={slots}
          onClose={() => setOpen(false)}
          art={params.get("art") ? FIXTURE_ART : null}
        />
      ) : null}
    </main>
  );
}
