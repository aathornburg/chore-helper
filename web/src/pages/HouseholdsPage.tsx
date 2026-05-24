import { useEffect, useMemo, useState } from "react";
import type { HouseholdFloor, HouseholdStructure } from "@chore-helper/shared";
import { getHouseholdStructure } from "../api";
import type { HouseholdSetupState } from "../types";
import {
  createDefaultHouseholdStructure,
  flooringOptions,
  sortFloors
} from "../utils/householdStructure";

type HouseholdsPageProps = {
  householdSetup: HouseholdSetupState;
};

function getMainFloorId(floors: HouseholdFloor[]) {
  return floors.find((floor) => floor.levelType === "main")?.id ?? floors[0]?.id;
}

export function HouseholdsPage({ householdSetup }: HouseholdsPageProps) {
  const [structure, setStructure] = useState<HouseholdStructure>();
  const [selectedFloorId, setSelectedFloorId] = useState<string>();
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (householdSetup.isRestoring) {
      setLoadState("loading");
      return;
    }

    if (!householdSetup.householdId) {
      setStructure(undefined);
      setSelectedFloorId(undefined);
      setLoadState("ready");
      return;
    }

    let cancelled = false;

    async function loadStructure() {
      setLoadState("loading");
      try {
        const householdId = householdSetup.householdId as string;
        const loaded = await getHouseholdStructure(householdId);
        const nextStructure = loaded.floors.length > 0
          ? loaded
          : createDefaultHouseholdStructure(householdId, householdSetup.baseline);
        if (cancelled) return;

        setStructure(nextStructure);
        setSelectedFloorId(getMainFloorId(nextStructure.floors));
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void loadStructure();

    return () => {
      cancelled = true;
    };
  }, [householdSetup.baseline, householdSetup.householdId, householdSetup.isRestoring]);

  const floors = useMemo(() => sortFloors(structure?.floors ?? []), [structure]);
  const selectedFloor = floors.find((floor) => floor.id === selectedFloorId);

  if (!householdSetup.householdId && !householdSetup.isRestoring) {
    return (
      <section className="placeholder-page">
        <h1>Households</h1>
        <p className="lede">Create a household before editing floors and rooms.</p>
      </section>
    );
  }

  return (
    <div className="households-page">
      <header className="workspace-hero compact-hero">
        <div>
          <h1>Households</h1>
          <p className="lede">Manage floors, rooms, flooring, pet impact, and cleaning-device coverage.</p>
        </div>
      </header>

      {loadState === "loading" ? <div className="empty-state">Loading household structure...</div> : null}
      {loadState === "error" ? <div className="empty-state">Could not load household structure.</div> : null}

      {loadState === "ready" && selectedFloor ? (
        <section className="household-editor" aria-label="Household floor editor">
          <aside className="floor-selector-panel">
            <p className="eyebrow">Floor selector</p>
            <div className="compact-house" aria-label="House floor selector">
              <div className="compact-house-roof" />
              {floors.map((floor) => (
                <button
                  aria-pressed={selectedFloor.id === floor.id}
                  aria-label={`Select ${floor.name}`}
                  className={`compact-house-floor ${selectedFloor.id === floor.id ? "active" : ""} compact-house-floor-${floor.levelType}`}
                  key={floor.id}
                  onClick={() => setSelectedFloorId(floor.id)}
                  type="button"
                >
                  {floor.name}
                </button>
              ))}
            </div>
            <div className="floor-summary-list">
              {floors.map((floor) => (
                <button
                  aria-pressed={selectedFloor.id === floor.id}
                  key={floor.id}
                  onClick={() => setSelectedFloorId(floor.id)}
                  type="button"
                >
                  <strong>{floor.name}</strong>
                  <span>{floor.rooms.length} room{floor.rooms.length === 1 ? "" : "s"}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="floor-detail-panel">
            <h2>{selectedFloor.name}</h2>
            <p className="lede">Floor details</p>
            <div className="chip-list" aria-label="Flooring">
              {flooringOptions.map((flooring) => (
                <button
                  aria-pressed={selectedFloor.flooring.includes(flooring)}
                  key={flooring}
                  type="button"
                >
                  {flooring}
                </button>
              ))}
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}
