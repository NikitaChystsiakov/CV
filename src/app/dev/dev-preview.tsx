"use client";

import { useEffect, useRef, useState } from "react";

import { CasesGallery } from "@/components/cases/cases-gallery";
import { HousePanel } from "@/components/skills/house-panel";
import { SkillsGallery } from "@/components/skills/skills-gallery";
import { useSay } from "@/components/skills/use-say";
import { UI } from "@/lib/content";
import { routeStopsAll } from "@/lib/route";

import { FIXTURE_CASES } from "./cases/fixtures";
import { FIXTURE_STACK } from "./skills/fixtures";

/**
 * Общая оболочка dev-превью: панель дома открыта сразу, без входа камерой
 * (дома на этой странице нет). Закрыли — остаётся кнопка «Открыть снова», и
 * фокус возвращается на неё, как на маршруте возвращается на дом.
 */
export function DevPreview({ kind }: { kind: "skills" | "cases" }) {
  const say = useSay();
  const [open, setOpen] = useState(true);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(true);

  useEffect(() => {
    if (!open && wasOpen.current) reopenRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const stop = routeStopsAll.find((item) => item.id === kind);
  const title = stop ? say(stop.title) : kind;

  return (
    <main data-dev-preview={kind} className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <p className="font-mono text-xs text-muted">{say(UI.devFixture)}</p>
      <button
        ref={reopenRef}
        type="button"
        data-dev-reopen
        onClick={() => setOpen(true)}
        className="demo-chip mt-4 rounded-full px-4 py-2 text-sm font-medium"
      >
        {say(UI.devReopen)}
      </button>

      {/* Завеса — как у входа в дом на маршруте (там её держит route-stop) */}
      {open ? <div aria-hidden className="fixed inset-0 z-[54] bg-room-veil" /> : null}

      {open ? (
        <HousePanel
          id={kind}
          title={title}
          onClose={() => setOpen(false)}
          lead={kind === "skills" ? say(UI.skillsLead) : undefined}
        >
          {kind === "skills" ? (
            <SkillsGallery stack={FIXTURE_STACK} />
          ) : (
            <CasesGallery cases={FIXTURE_CASES} />
          )}
        </HousePanel>
      ) : null}
    </main>
  );
}
