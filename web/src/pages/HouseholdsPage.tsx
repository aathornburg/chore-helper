import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FlooringSurface,
  HouseholdAppData,
  HouseholdFloor,
  HouseholdRoom,
  HouseholdStructure
} from "@chore-helper/shared";
import { saveHouseholdStructure } from "../api";
import {
  createBasementFloor,
  createDefaultHouseholdStructure,
  createNewFloor,
  flooringOptions,
  sortFloors
} from "../utils/householdStructure";

type HouseholdsPageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
  onAddHousehold: (name: string) => Promise<void>;
};

type ManageTab = "overview" | "floors" | "rooms";

function getMainFloorId(floors: HouseholdFloor[]) {
  return floors.find((floor) => floor.levelType === "main")?.id ?? floors[0]?.id;
}

export function HouseholdsPage({ households, isLoading, onAddHousehold }: HouseholdsPageProps) {
  const [isAddingHousehold, setIsAddingHousehold] = useState(false);

  async function handleAddHousehold() {
    if (isAddingHousehold) return;
    setIsAddingHousehold(true);
    try {
      await onAddHousehold("New household");
    } finally {
      setIsAddingHousehold(false);
    }
  }

  return (
    <div className="households-page">
      <header className="workspace-hero compact-hero">
        <div>
          <h1>Households</h1>
          <p className="lede">Manage floors, rooms, flooring, pet impact, and cleaning-device coverage.</p>
        </div>
      </header>

      {isLoading ? (
        <div className="empty-state">Loading households...</div>
      ) : (
        <>
        <section className="dashboard-section" aria-labelledby="households-heading">
          <div className="section-heading">
            <div className="section-title">
              <div>
                <h2 id="households-heading">Households</h2>
                <p>Manage your households and their associated details.</p>
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button disabled={isAddingHousehold} onClick={handleAddHousehold} type="button">
              Add household
            </button>
          </div>
        </section>
        { households.length > 0 ? ( households.map((household) => (
          <HouseholdEditor household={household} key={household.id} />
        ))) : null}
        </>
      )}
    </div>
  );
}

function HouseholdEditor({ household }: { household: HouseholdAppData }) {
  const saveInFlightRef = useRef(false);
  const [isManaging, setIsManaging] = useState(false);
  const [manageTab, setManageTab] = useState<ManageTab>("overview");
  const [isEditingSurfaces, setIsEditingSurfaces] = useState(false);
  const initialStructure = household.structure.floors.length > 0
    ? household.structure
    : createDefaultHouseholdStructure(household.id, household.baseline);
  const [structure, setStructure] = useState<HouseholdStructure>(initialStructure);
  const [selectedFloorId, setSelectedFloorId] = useState<string>();
  const [pendingRemoveFloorId, setPendingRemoveFloorId] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [editingRoom, setEditingRoom] = useState<HouseholdRoom>();

  useEffect(() => {
    setStructure(initialStructure);
    setSelectedFloorId(getMainFloorId(initialStructure.floors));
    setPendingRemoveFloorId(undefined);
    setEditingRoom(undefined);
    setManageTab("overview");
    setIsEditingSurfaces(false);
    setSaveError(undefined);
  }, [household.id]);

  const activeStructure = structure;
  const floors = useMemo(() => sortFloors(activeStructure.floors), [activeStructure]);
  const selectedFloor = floors.find((floor) => floor.id === selectedFloorId);

  function handleToggleManage() {
    setIsManaging((current) => {
      const next = !current;
      setManageTab("overview");
      setIsEditingSurfaces(false);
      setPendingRemoveFloorId(undefined);
      return next;
    });
  }

  function handleSelectFloor(floorId: string) {
    setSelectedFloorId(floorId);
    setIsEditingSurfaces(false);
    setPendingRemoveFloorId(undefined);
  }

  function renderFloorSelector(showActions: boolean) {
    if (!selectedFloor) return null;

    return (
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
              onClick={() => handleSelectFloor(floor.id)}
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
              onClick={() => handleSelectFloor(floor.id)}
              type="button"
            >
              <strong>{floor.name}</strong>
              <span>{floor.rooms.length} room{floor.rooms.length === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
        {showActions ? (
          <div className="floor-actions">
            <button disabled={isSaving} onClick={handleAddFloor} type="button">Add floor</button>
            {!floors.some((floor) => floor.levelType === "basement") ? (
              <button disabled={isSaving} onClick={handleAddBasement} type="button">Add basement</button>
            ) : null}
          </div>
        ) : null}
      </aside>
    );
  }

  function renderRoomsPanel() {
    if (!selectedFloor) return null;

    return (
      <section className="floor-detail-panel">
        <div className="floor-detail-heading">
          <div>
            <h2>{selectedFloor.name}</h2>
            <p className="lede">Rooms</p>
          </div>
          <button
            disabled={isSaving}
            onClick={() => setEditingRoom(createRoom(selectedFloor.id))}
            type="button"
          >
            Add room
          </button>
        </div>

        <section className="room-card-section" aria-label="Rooms">
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
    );
  }

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
    if (!activeStructure || !editingRoom || !editingRoom.name.trim() || isSaving) return;

    const targetFloor = activeStructure.floors.find((floor) => floor.id === editingRoom.floorId);
    if (!targetFloor) return;

    const nextRoom = { ...editingRoom, name: editingRoom.name.trim(), floorId: targetFloor.id };
    const nextFloors = activeStructure.floors.map((floor) => {
      if (floor.id !== targetFloor.id) return floor;
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

  return (
    <section className="household-instance panel" aria-label={`${household.name} floor editor`}>
      <div className="section-heading">
        <div className="section-title">
          <h2>{household.name}</h2>
        </div>
        <button onClick={handleToggleManage} type="button">
          {isManaging ? "Done" : "Manage"}
        </button>
      </div>
      {!isManaging ? (
        <div className="empty-state">
          {floors.length} floor{floors.length === 1 ? "" : "s"} / {household.chores.length} chore{household.chores.length === 1 ? "" : "s"}
        </div>
      ) : null}
      {saveError ? <div className="empty-state" role="status">{saveError}</div> : null}

      {isManaging && selectedFloor ? (
        <>
          <div className="household-manage-tabs" role="tablist" aria-label={`${household.name} management sections`}>
            <button
              aria-selected={manageTab === "overview"}
              onClick={() => setManageTab("overview")}
              role="tab"
              type="button"
            >
              Overview
            </button>
            <button
              aria-selected={manageTab === "floors"}
              onClick={() => {
                setManageTab("floors");
                setEditingRoom(undefined);
              }}
              role="tab"
              type="button"
            >
              Floors
            </button>
            <button
              aria-selected={manageTab === "rooms"}
              onClick={() => {
                setManageTab("rooms");
                setIsEditingSurfaces(false);
                setPendingRemoveFloorId(undefined);
              }}
              role="tab"
              type="button"
            >
              Rooms
            </button>
          </div>

          {manageTab === "overview" ? (
            <section className="household-overview" aria-label="Household overview">
              <div className="empty-state">
                {floors.length} floor{floors.length === 1 ? "" : "s"} / {household.chores.length} chore{household.chores.length === 1 ? "" : "s"}
              </div>
              <div className="overview-stat-grid">
                <div>
                  <span>Selected floor</span>
                  <strong>{selectedFloor.name}</strong>
                </div>
                <div>
                  <span>Rooms</span>
                  <strong>{floors.reduce((total, floor) => total + floor.rooms.length, 0)}</strong>
                </div>
                <div>
                  <span>Surfaces</span>
                  <strong>{selectedFloor.flooring.length > 0 ? selectedFloor.flooring.join(", ") : "None set"}</strong>
                </div>
              </div>
            </section>
          ) : null}

          {manageTab === "floors" ? (
            <section className="household-editor" aria-label="Household floor editor">
              {renderFloorSelector(true)}
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
                <div className="floor-surface-summary">
                  <div>
                    <span>Flooring</span>
                    <strong>{selectedFloor.flooring.length > 0 ? selectedFloor.flooring.join(", ") : "No floor surfaces set"}</strong>
                  </div>
                  <button disabled={isSaving} onClick={() => setIsEditingSurfaces(true)} type="button">
                    Edit surfaces
                  </button>
                </div>
                {isEditingSurfaces ? (
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
                ) : null}
              </section>
            </section>
          ) : null}

          {manageTab === "rooms" ? (
            <section className="household-editor" aria-label="Household room editor">
              {renderFloorSelector(false)}
              {renderRoomsPanel()}
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
