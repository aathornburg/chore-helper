import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FlooringSurface,
  HouseholdFloor,
  HouseholdRoom,
  HouseholdStructure
} from "@chore-helper/shared";
import { getHouseholdStructure, saveHouseholdStructure } from "../api";
import type { HouseholdSetupState } from "../types";
import {
  createBasementFloor,
  createDefaultHouseholdStructure,
  createNewFloor,
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
  const saveInFlightRef = useRef(false);
  const [structure, setStructure] = useState<HouseholdStructure>();
  const [selectedFloorId, setSelectedFloorId] = useState<string>();
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [pendingRemoveFloorId, setPendingRemoveFloorId] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [editingRoom, setEditingRoom] = useState<HouseholdRoom>();

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
        setPendingRemoveFloorId(undefined);
        setEditingRoom(undefined);
        setSaveError(undefined);
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

  const activeStructure = structure?.householdId === householdSetup.householdId ? structure : undefined;
  const floors = useMemo(() => sortFloors(activeStructure?.floors ?? []), [activeStructure]);
  const selectedFloor = floors.find((floor) => floor.id === selectedFloorId);

  async function persist(nextStructure: HouseholdStructure) {
    if (saveInFlightRef.current) return false;

    const previousStructure = activeStructure;
    const previousSelectedFloorId = selectedFloorId;
    saveInFlightRef.current = true;
    setIsSaving(true);
    setSaveError(undefined);
    setStructure(nextStructure);
    try {
      await saveHouseholdStructure(nextStructure.householdId, nextStructure);
      return true;
    } catch {
      setStructure(previousStructure);
      setSelectedFloorId(previousSelectedFloorId);
      setSaveError("Could not save household structure.");
      return false;
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleToggleFlooring(flooring: FlooringSurface) {
    if (!activeStructure || !selectedFloor || isSaving) return;

    const nextFloors = activeStructure.floors.map((floor) => {
      if (floor.id !== selectedFloor.id) return floor;
      const nextFlooring = floor.flooring.includes(flooring)
        ? floor.flooring.filter((candidate) => candidate !== flooring)
        : [...floor.flooring, flooring];
      return { ...floor, flooring: nextFlooring };
    });
    await persist({ ...activeStructure, floors: nextFloors });
  }

  async function handleAddFloor() {
    if (!activeStructure || isSaving) return;
    const floor = createNewFloor(activeStructure.householdId, activeStructure.floors.length);
    const nextStructure = { ...activeStructure, floors: sortFloors([...activeStructure.floors, floor]) };
    setSelectedFloorId(floor.id);
    await persist(nextStructure);
  }

  function createRoom(floorId: string): HouseholdRoom {
    return {
      id: crypto.randomUUID(),
      floorId,
      name: "",
      flooring: [...(selectedFloor?.flooring ?? [])],
      petImpact: "inherit",
      robotVacuumCoverage: "inherit",
      robotMopCoverage: "inherit"
    };
  }

  async function handleSaveRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStructure || !selectedFloor || !editingRoom || !editingRoom.name.trim() || isSaving) return;

    const nextRoom = { ...editingRoom, name: editingRoom.name.trim(), floorId: selectedFloor.id };
    const nextFloors = activeStructure.floors.map((floor) => {
      if (floor.id !== selectedFloor.id) return floor;
      const exists = floor.rooms.some((room) => room.id === nextRoom.id);
      return {
        ...floor,
        rooms: exists
          ? floor.rooms.map((room) => (room.id === nextRoom.id ? nextRoom : room))
          : [...floor.rooms, nextRoom]
      };
    });
    setEditingRoom(undefined);
    const saved = await persist({ ...activeStructure, floors: nextFloors });
    if (!saved) setEditingRoom(editingRoom);
  }

  async function handleRemoveRoom(roomId: string) {
    if (!activeStructure || !selectedFloor || isSaving) return;

    const nextFloors = activeStructure.floors.map((floor) =>
      floor.id === selectedFloor.id
        ? { ...floor, rooms: floor.rooms.filter((room) => room.id !== roomId) }
        : floor
    );
    await persist({ ...activeStructure, floors: nextFloors });
  }

  async function handleAddBasement() {
    if (isSaving || !activeStructure || activeStructure.floors.some((floor) => floor.levelType === "basement")) return;
    const basement = createBasementFloor(activeStructure.householdId);
    const nextStructure = { ...activeStructure, floors: sortFloors([...activeStructure.floors, basement]) };
    setSelectedFloorId(basement.id);
    await persist(nextStructure);
  }

  async function handleConfirmRemoveFloor() {
    if (isSaving || !activeStructure || !pendingRemoveFloorId) return;
    const nextFloors = activeStructure.floors.filter((floor) => floor.id !== pendingRemoveFloorId);
    const nextStructure = { ...activeStructure, floors: nextFloors };
    setPendingRemoveFloorId(undefined);
    setSelectedFloorId(getMainFloorId(nextFloors));
    await persist(nextStructure);
  }

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
      {saveError ? <div className="empty-state" role="status">{saveError}</div> : null}

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
                  disabled={isSaving}
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
                  disabled={isSaving}
                  key={floor.id}
                  onClick={() => setSelectedFloorId(floor.id)}
                  type="button"
                >
                  <strong>{floor.name}</strong>
                  <span>{floor.rooms.length} room{floor.rooms.length === 1 ? "" : "s"}</span>
                </button>
              ))}
            </div>
            <div className="floor-actions">
              <button disabled={isSaving} onClick={handleAddFloor} type="button">Add floor</button>
              {!floors.some((floor) => floor.levelType === "basement") ? (
                <button disabled={isSaving} onClick={handleAddBasement} type="button">Add basement</button>
              ) : null}
            </div>
          </aside>

          <section className="floor-detail-panel">
            <div className="floor-detail-heading">
              <div>
                <h2>{selectedFloor.name}</h2>
                <p className="lede">Floor details</p>
              </div>
              {selectedFloor.levelType !== "main" ? (
                <button disabled={isSaving} onClick={() => setPendingRemoveFloorId(selectedFloor.id)} type="button">
                  {selectedFloor.levelType === "basement" ? "Remove basement" : "Remove floor"}
                </button>
              ) : null}
            </div>
            {pendingRemoveFloorId === selectedFloor.id ? (
              <div className="inline-confirmation">
                <p>Remove {selectedFloor.name} and {selectedFloor.rooms.length} rooms?</p>
                <div className="form-actions">
                  <button disabled={isSaving} onClick={handleConfirmRemoveFloor} type="button">Confirm remove floor</button>
                  <button disabled={isSaving} onClick={() => setPendingRemoveFloorId(undefined)} type="button">Cancel</button>
                </div>
              </div>
            ) : null}
            <div className="chip-list" aria-label="Flooring">
              {flooringOptions.map((flooring) => (
                <button
                  aria-pressed={selectedFloor.flooring.includes(flooring)}
                  disabled={isSaving}
                  key={flooring}
                  onClick={() => handleToggleFlooring(flooring)}
                  type="button"
                >
                  {flooring}
                </button>
              ))}
            </div>
            <section className="room-card-section" aria-labelledby="room-card-heading">
              <div className="section-heading">
                <div className="section-title">
                  <h3 id="room-card-heading">Rooms</h3>
                </div>
                <button
                  disabled={isSaving}
                  onClick={() => setEditingRoom(createRoom(selectedFloor.id))}
                  type="button"
                >
                  Add room
                </button>
              </div>

              <div className="room-card-grid">
                {selectedFloor.rooms.map((room) => (
                  <article className="room-card" key={room.id}>
                    <strong>{room.name}</strong>
                    <span>{room.flooring.length > 0 ? room.flooring.join(", ") : "Inherits floor surfaces"}</span>
                    <span>Pet impact: {room.petImpact}</span>
                    <span>Vacuum: {room.robotVacuumCoverage}</span>
                    <span>Mop: {room.robotMopCoverage}</span>
                    <div className="form-actions">
                      <button disabled={isSaving} onClick={() => setEditingRoom(room)} type="button">Edit {room.name}</button>
                      <button disabled={isSaving} onClick={() => handleRemoveRoom(room.id)} type="button">Remove {room.name}</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {editingRoom ? (
              <form className="room-editor" onSubmit={handleSaveRoom}>
                <label>
                  Room name
                  <input
                    disabled={isSaving}
                    required
                    value={editingRoom.name}
                    onChange={(event) => setEditingRoom({ ...editingRoom, name: event.target.value })}
                  />
                </label>
                <div className="chip-list" aria-label="Room flooring">
                  {flooringOptions.map((flooring) => (
                    <button
                      aria-pressed={editingRoom.flooring.includes(flooring)}
                      disabled={isSaving}
                      key={flooring}
                      onClick={() => {
                        setEditingRoom({
                          ...editingRoom,
                          flooring: editingRoom.flooring.includes(flooring)
                            ? editingRoom.flooring.filter((candidate) => candidate !== flooring)
                            : [...editingRoom.flooring, flooring]
                        });
                      }}
                      type="button"
                    >
                      {flooring}
                    </button>
                  ))}
                </div>
                <div className="form-actions">
                  <button disabled={isSaving} type="submit">Save room</button>
                  <button disabled={isSaving} onClick={() => setEditingRoom(undefined)} type="button">Cancel</button>
                </div>
              </form>
            ) : null}
          </section>
        </section>
      ) : null}
    </div>
  );
}
