"use client";

import dynamic from "next/dynamic";

import type { RoomCamera } from "@/components/room/house-room";
import { HousePanel } from "@/components/skills/house-panel";
import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { profile } from "@/lib/profile";

/**
 * Какие дома вместо 3D-комнаты открывают плоскую галерею (блок 3).
 *
 * Оболочка панели (`HousePanel`) лёгкая и грузится вместе с маршрутом: она
 * должна появиться в первый же кадр входа — камера ведёт её из двери. Само
 * содержимое — демо дома навыков и экспозиция кейсов — отдельные чанки,
 * которые скачиваются только при входе в дом (`next/dynamic`, без SSR: на
 * сервере панель всё равно не рисуется).
 *
 * Открывается ли дом вообще, решает не этот файл, а `ROOM_STOP_IDS` в
 * `src/lib/rooms.tsx`: дом кейсов попадает туда, только когда в
 * `profile.cases` появился хоть один кейс.
 */

function Loading() {
  const say = useSay();
  return (
    <p aria-busy="true" className="mt-6 font-mono text-xs text-muted">
      {say(UI.skillsLoading)}
    </p>
  );
}

const SkillsGallery = dynamic(
  () => import("@/components/skills/skills-gallery").then((module) => module.SkillsGallery),
  { ssr: false, loading: Loading },
);

const CasesGallery = dynamic(
  () => import("@/components/cases/cases-gallery").then((module) => module.CasesGallery),
  { ssr: false, loading: Loading },
);

const PANEL_STOPS = new Set(["skills", "cases"]);

/** У дома вместо комнаты — галерея-панель */
export function hasHousePanel(stopId: string) {
  return PANEL_STOPS.has(stopId);
}

/** Панель дома по id остановки. Пропсы — те же, что у комнаты */
export function HousePanelFor({
  stopId,
  title,
  onClose,
  camera,
}: {
  stopId: string;
  title: string;
  onClose: () => void;
  camera?: RoomCamera;
}) {
  const say = useSay();

  switch (stopId) {
    case "skills":
      return (
        <HousePanel id="skills" title={title} onClose={onClose} camera={camera} lead={say(UI.skillsLead)}>
          <SkillsGallery stack={profile.stack} />
        </HousePanel>
      );
    case "cases":
      return (
        <HousePanel id="cases" title={title} onClose={onClose} camera={camera}>
          <CasesGallery cases={profile.cases} />
        </HousePanel>
      );
    default:
      return null;
  }
}
