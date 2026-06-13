import { useMemo, useRef, useState } from "react";
import type {
  FlooringSurface,
  HouseholdAppData,
  HouseholdFloor,
  HouseholdProfile,
  HouseholdRoom,
  HouseholdStructure
} from "@chore-helper/shared";
import { deleteHousehold, saveHouseholdProfile, saveHouseholdStructure } from "../api";
import {
  createBasementFloor,
  createDefaultHouseholdStructure,
  createNewFloor,
  coverageOptions,
  flooringOptions,
  floorLevelOptions,
  petImpactOptions,
  sortFloors
} from "../utils/householdStructure";

type HouseholdsPageProps = {
  households: HouseholdAppData[];
  isLoading: boolean;
  onAddHousehold: (name: string) => Promise<void>;
  onReload: () => Promise<void>;
};

type HomeWorkspaceView = "overview" | "floors";

function getMainFloorId(floors: HouseholdFloor[]) {
  return floors.find((floor) => floor.levelType === "main")?.id ?? floors[0]?.id;
}

function roomCount(household: HouseholdAppData) {
  return household.structure.floors.reduce((total, floor) => total + floor.rooms.length, 0);
}

function floorRoomCountLabel(floor: HouseholdFloor) {
  const count = floor.rooms.length;
  return `${count} room${count === 1 ? "" : "s"}`;
}

function floorSetupLabel(floor: HouseholdFloor) {
  if (floor.rooms.length === 0) return "Needs rooms";
  if (floor.flooring.length === 0) return "Needs surfaces";
  return "Ready";
}

function setupQualityLabel(household: HouseholdAppData) {
  const floors = household.structure.floors.length;
  const floorsWithRooms = household.structure.floors.filter((floor) => floor.rooms.length > 0).length;
  if (floors > 0 && floorsWithRooms === floors) return "Profile healthy";
  if (floors > 0) return "Rooms need detail";
  return "Setup needed";
}

function formatBoolean(value: boolean) {
  return value ? "Yes" : "No";
}

function formatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "None set";
}

export function HouseholdsPage({ households, isLoading, onAddHousehold, onReload }: HouseholdsPageProps) {
  const [isAddingHousehold, setIsAddingHousehold] = useState(false);
  const householdSummaries = households.map((household) => ({
    household,
    rooms: roomCount(household),
    setupQuality: setupQualityLabel(household)
  }));

  async function handleAddHousehold() {
    if (isAddingHousehold) return;
    setIsAddingHousehold(true);
    try {
      await onAddHousehold("New household");
    } finally {
      setIsAddingHousehold(false);
    }
  }

  if (isLoading) {
    return (
      <div className="households-page operational-page">
        <div className="empty-state">Loading households...</div>
      </div>
    );
  }

  if (households.length === 0) {
    return (
      <div className="households-page operational-page">
        <header className="page-command-header">
          <div>
            <p className="eyebrow">Household setup</p>
            <h1>My Home</h1>
            <p className="lede">Add a household or accept an invite so Clenella has a shared place to organize.</p>
          </div>
        </header>
        <section className="setup-empty-state first-home-empty-state" aria-labelledby="first-home-heading">
          <div>
            <p className="eyebrow">No household yet</p>
            <h2 id="first-home-heading">Add or join a household</h2>
            <p>Once you belong to a household, you can tune floors, rooms, pet impact, and routine recommendations.</p>
          </div>
          <button disabled={isAddingHousehold} onClick={handleAddHousehold} type="button">
            Add household
          </button>
        </section>
      </div>
    );
  }

  if (households.length === 1) {
    return (
      <div className="households-page operational-page my-home-page">
        <SingleHomeWorkspace
          household={households[0]}
          isAddingHousehold={isAddingHousehold}
          onAddHousehold={handleAddHousehold}
          onReload={onReload}
        />
      </div>
    );
  }

  return (
    <div className="households-page operational-page homes-page">
      <HomesListWorkspace
        households={householdSummaries}
        isAddingHousehold={isAddingHousehold}
        onAddHousehold={handleAddHousehold}
        onReload={onReload}
      />
    </div>
  );
}

function HomesListWorkspace({
  households,
  isAddingHousehold,
  onAddHousehold,
  onReload
}: {
  households: Array<{ household: HouseholdAppData; rooms: number; setupQuality: string }>;
  isAddingHousehold: boolean;
  onAddHousehold: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [expandedHouseholdId, setExpandedHouseholdId] = useState<string>(households[0]?.household.id ?? "");
  const expanded = households.find(({ household }) => household.id === expandedHouseholdId)?.household;

  return (
    <>
      <header className="page-command-header homes-list-header">
        <div>
          <h1>Homes</h1>
          <p className="lede">Manage each home's floors, rooms, surfaces, and cleaning coverage.</p>
        </div>
        <button disabled={isAddingHousehold} onClick={onAddHousehold} type="button">
          Add another home
        </button>
      </header>

      <section className="homes-list" aria-label="Homes">
        {households.map(({ household, rooms, setupQuality }) => (
          <section className="homes-list-card" aria-label={`${household.name} summary`} key={household.id}>
            <div>
              <h2>{household.name}</h2>
              <p>{setupQuality}</p>
              <span>
                {household.structure.floors.length} floor{household.structure.floors.length === 1 ? "" : "s"} / {rooms} room{rooms === 1 ? "" : "s"}
              </span>
            </div>
            <button onClick={() => setExpandedHouseholdId(household.id)} type="button">
              Manage {household.name}
            </button>
          </section>
        ))}
      </section>

      {expanded ? <HouseholdWorkspace key={expanded.id} household={expanded} onReload={onReload} /> : null}
    </>
  );
}

function SingleHomeWorkspace({
  household,
  isAddingHousehold,
  onAddHousehold,
  onReload
}: {
  household: HouseholdAppData;
  isAddingHousehold: boolean;
  onAddHousehold: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  return (
    <>
      <header className="my-home-header">
        <div>
          <h1>My Home</h1>
          <p className="lede">Review floors, rooms, surfaces, pet impact, and cleaning coverage.</p>
        </div>
        <div className="my-home-header-actions">
          <button
            className="my-home-add-link"
            disabled={isAddingHousehold}
            onClick={onAddHousehold}
            type="button"
          >
            Add another home
          </button>
        </div>
      </header>
      <HouseholdWorkspace household={household} onReload={onReload} />
    </>
  );
}

function HouseholdWorkspace({ household, onReload }: { household: HouseholdAppData; onReload: () => Promise<void> }) {
  const saveInFlightRef = useRef(false);
  const [workspaceView, setWorkspaceView] = useState<HomeWorkspaceView>("overview");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingFloor, setIsEditingFloor] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const overviewTabId = `${household.id}-overview-tab`;
  const overviewPanelId = `${household.id}-overview-panel`;
  const floorsTabId = `${household.id}-floors-tab`;
  const floorsPanelId = `${household.id}-floors-panel`;
  const [isEditingSurfaces, setIsEditingSurfaces] = useState(false);
  const initialStructure = household.structure.floors.length > 0
    ? household.structure
    : createDefaultHouseholdStructure(household.id, household.profile);
  const [structure, setStructure] = useState<HouseholdStructure>(initialStructure);
  const [selectedFloorId, setSelectedFloorId] = useState<string | undefined>(() => getMainFloorId(initialStructure.floors));
  const [pendingRemoveFloorId, setPendingRemoveFloorId] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [editingRoom, setEditingRoom] = useState<HouseholdRoom>();
  const [profileName, setProfileName] = useState(household.name);
  const [profile, setProfile] = useState<HouseholdProfile>(household.profile ?? {
    homeType: "house",
    hasPets: false,
    hasOutdoorSpace: false,
    notes: ""
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string>();

  const activeStructure = structure;
  const floors = useMemo(() => sortFloors(activeStructure.floors), [activeStructure]);
  const selectedFloor = floors.find((floor) => floor.id === selectedFloorId);

  function handleSelectWorkspaceView(nextView: HomeWorkspaceView) {
    setWorkspaceView(nextView);
    setIsDeleteConfirming(false);
    if (nextView !== "overview") resetProfileDraft();
    if (nextView !== "floors") {
      setIsEditingFloor(false);
      setIsEditingSurfaces(false);
      setEditingRoom(undefined);
    }
    setPendingRemoveFloorId(undefined);
  }

  function handleSelectFloor(floorId: string) {
    setSelectedFloorId(floorId);
    setIsEditingFloor(false);
    setIsEditingSurfaces(false);
    setPendingRemoveFloorId(undefined);
  }

  function handleOpenFloorFromOverview(floorId: string) {
    setSelectedFloorId(floorId);
    handleSelectWorkspaceView("floors");
  }

  function resetProfileDraft() {
    setProfileName(household.name);
    setProfile(household.profile ?? {
      homeType: "house",
      hasPets: false,
      hasOutdoorSpace: false,
      notes: ""
    });
    setProfileError(undefined);
    setIsEditingProfile(false);
  }

  function resetFloorEdit() {
    setIsEditingFloor(false);
    setIsEditingSurfaces(false);
    setPendingRemoveFloorId(undefined);
  }

  function renderStudioHouseModel({
    mode,
    showActions = false
  }: {
    mode: "overview" | "select";
    showActions?: boolean;
  }) {
    if (!selectedFloor) return null;

    return (
      <aside className="home-studio-model-panel">
        <div className="home-studio-model-heading">
          <p className="eyebrow">Home model</p>
          <strong>
            {floors.length} floor{floors.length === 1 ? "" : "s"}
          </strong>
        </div>
        <div className="studio-house" aria-label="Home model" role="group">
          <span className="studio-house-sun" aria-hidden="true">
            <span className="studio-house-sun-rays" />
            <span className="studio-house-sun-core" />
          </span>
          <div className="studio-house-roof" aria-hidden="true" />
          <div className="studio-house-body">
            {floors.map((floor) => {
              const isActive = mode === "select" && selectedFloor.id === floor.id;
              const roomLabel = floorRoomCountLabel(floor);
              const buttonLabel = mode === "overview"
                ? `View ${floor.name} details, ${roomLabel}`
                : `Select ${floor.name}, ${roomLabel}`;

              return (
                <button
                  aria-label={buttonLabel}
                  aria-pressed={mode === "select" ? isActive : undefined}
                  className={`studio-house-floor ${isActive ? "is-active" : ""} studio-house-floor-${floor.levelType}`}
                  disabled={isSaving}
                  key={floor.id}
                  onClick={() => (mode === "overview" ? handleOpenFloorFromOverview(floor.id) : handleSelectFloor(floor.id))}
                  type="button"
                >
                  <span>
                    <strong>{floor.name}</strong>
                    <small>{roomLabel}</small>
                  </span>
                  <span className="studio-house-windows" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {showActions ? (
          <div className="home-studio-model-actions">
            <button className="secondary-action" disabled={isSaving} onClick={handleAddFloor} type="button">Add floor</button>
            {!floors.some((floor) => floor.levelType === "basement") ? (
              <button className="secondary-action" disabled={isSaving} onClick={handleAddBasement} type="button">Add basement</button>
            ) : null}
          </div>
        ) : null}
      </aside>
    );
  }

  function renderRoomsPanel() {
    if (!selectedFloor) return null;

    return (
      <section className="floor-rooms-panel" aria-label={`Rooms on ${selectedFloor.name}`}>
        <div className="floor-detail-heading">
          <div>
            <h2>Rooms</h2>
            <p className="lede">{selectedFloor.name}</p>
          </div>
          <button
            className="quiet-link"
            disabled={isSaving}
            onClick={() => setEditingRoom(createRoom(selectedFloor.id))}
            type="button"
          >
            Add room to {selectedFloor.name}
          </button>
        </div>

        <section className="room-card-section" aria-label="Room list">
          {selectedFloor.rooms.length > 0 ? (
            <div className="room-card-grid">
              {selectedFloor.rooms.map((room) => (
                <article aria-label={`${room.name} room annotation`} className="room-annotation" key={room.id}>
                  <div>
                    <strong>{room.name}</strong>
                    <span>{room.flooring.length > 0 ? room.flooring.join(", ") : "Inherits floor surfaces"}</span>
                  </div>
                  <span className="room-annotation-meta">Pet impact: {room.petImpact}</span>
                  <span className="room-annotation-meta">Vacuum: {room.robotVacuumCoverage}</span>
                  <span className="room-annotation-meta">Mop: {room.robotMopCoverage}</span>
                  <button className="quiet-link" disabled={isSaving} onClick={() => setEditingRoom(room)} type="button">Edit {room.name}</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No rooms modeled for this floor yet.</div>
          )}
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
            <div className="field-grid">
              <label>
                Pet impact
                <select
                  disabled={isSaving}
                  value={editingRoom.petImpact}
                  onChange={(event) => setEditingRoom({ ...editingRoom, petImpact: event.target.value as HouseholdRoom["petImpact"] })}
                >
                  <option value="inherit">Inherit from floor</option>
                  {petImpactOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Vacuum coverage
                <select
                  disabled={isSaving}
                  value={editingRoom.robotVacuumCoverage}
                  onChange={(event) => setEditingRoom({ ...editingRoom, robotVacuumCoverage: event.target.value as HouseholdRoom["robotVacuumCoverage"] })}
                >
                  <option value="inherit">Inherit from floor</option>
                  {coverageOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Mop coverage
                <select
                  disabled={isSaving}
                  value={editingRoom.robotMopCoverage}
                  onChange={(event) => setEditingRoom({ ...editingRoom, robotMopCoverage: event.target.value as HouseholdRoom["robotMopCoverage"] })}
                >
                  <option value="inherit">Inherit from floor</option>
                  {coverageOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Room notes
                <textarea
                  disabled={isSaving}
                  value={editingRoom.notes ?? ""}
                  onChange={(event) => setEditingRoom({ ...editingRoom, notes: event.target.value })}
                />
              </label>
            </div>
            <div className="room-editor-actions">
              <button
                className="danger-link"
                disabled={isSaving || !selectedFloor.rooms.some((room) => room.id === editingRoom.id)}
                onClick={() => {
                  const roomId = editingRoom.id;
                  setEditingRoom(undefined);
                  void handleRemoveRoom(roomId);
                }}
                type="button"
              >
                Remove room
              </button>
              <div className="form-actions">
                <button className="secondary-action" disabled={isSaving} onClick={() => setEditingRoom(undefined)} type="button">Cancel</button>
                <button disabled={isSaving} type="submit">Save room</button>
              </div>
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
      await onReload();
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

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileName.trim() || isSavingProfile) return;

    setIsSavingProfile(true);
    setProfileError(undefined);
    try {
      await saveHouseholdProfile(household.id, { name: profileName.trim(), ...profile });
      await onReload();
      setIsEditingProfile(false);
    } catch {
      setProfileError("Could not save household profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleDeleteHousehold() {
    if (isDeleting) return;

    setIsDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteHousehold(household.id);
      await onReload();
    } catch {
      setDeleteError("Could not delete this household.");
      setIsDeleteConfirming(false);
      setIsDeleting(false);
    }
  }

  async function handleSaveFloor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFloor || isSaving) return;
    const saved = await persist(activeStructure);
    if (saved) resetFloorEdit();
  }

  function updateSelectedFloor(update: Partial<HouseholdFloor>) {
    if (!selectedFloor) return;
    setStructure({
      ...activeStructure,
      floors: activeStructure.floors.map((floor) =>
        floor.id === selectedFloor.id ? { ...floor, ...update } : floor
      )
    });
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
    setIsEditingFloor(true);
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
    setIsEditingFloor(true);
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
    <section className="household-workspace" aria-label="Home setup studio">
      <div className="home-workspace-toolbar">
        <div className="home-workspace-tabs" role="tablist" aria-label={`${household.name} home views`}>
          <button
            aria-controls={overviewPanelId}
            aria-selected={workspaceView === "overview"}
            id={overviewTabId}
            onClick={() => handleSelectWorkspaceView("overview")}
            role="tab"
            type="button"
          >
            Overview
          </button>
          <button
            aria-controls={floorsPanelId}
            aria-selected={workspaceView === "floors"}
            id={floorsTabId}
            onClick={() => handleSelectWorkspaceView("floors")}
            role="tab"
            type="button"
          >
            Floors
          </button>
        </div>
        <button
          className="danger-link"
          disabled={isDeleting || isSaving || isSavingProfile}
          onClick={() => setIsDeleteConfirming(true)}
          type="button"
        >
          Delete home
        </button>
      </div>

      {saveError ? <div className="empty-state" role="status">{saveError}</div> : null}
      {profileError ? <div className="empty-state" role="status">{profileError}</div> : null}
      {deleteError ? <div className="empty-state" role="status">{deleteError}</div> : null}
      {isDeleteConfirming ? (
        <section className="inline-confirmation household-delete-confirmation" aria-label="Delete household confirmation">
          <div>
            <strong>Delete {household.name}?</strong>
            <p>This removes the household, chores, calendar imports, and setup details for everyone in it.</p>
          </div>
          <div className="form-actions">
            <button className="danger-action" disabled={isDeleting} onClick={handleDeleteHousehold} type="button">
              Confirm delete home
            </button>
            <button className="secondary-action" disabled={isDeleting} onClick={() => setIsDeleteConfirming(false)} type="button">
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section
        aria-label={`${household.name} overview`}
        aria-labelledby={overviewTabId}
        className="household-editor home-studio-workspace"
        hidden={workspaceView !== "overview"}
        id={overviewPanelId}
        role="tabpanel"
      >
        {workspaceView === "overview" && selectedFloor ? (
          <>
            {renderStudioHouseModel({ mode: "overview" })}
            {isEditingProfile ? (
              <form className="manual-chore-form household-profile-form floor-detail-panel" onSubmit={handleSaveProfile}>
                <div className="floor-detail-heading">
                  <div>
                    <p className="eyebrow">Edit profile</p>
                    <h2>Home details</h2>
                    <p>These details help Clenella tune setup prompts and coverage assumptions.</p>
                  </div>
                </div>
                <div className="field-grid household-profile-grid">
                  <label>
                    Household name
                    <input
                      disabled={isSavingProfile}
                      required
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                    />
                  </label>
                  <label>
                    Home type
                    <select
                      disabled={isSavingProfile}
                      value={profile.homeType}
                      onChange={(event) => setProfile({ ...profile, homeType: event.target.value as HouseholdProfile["homeType"] })}
                    >
                      {["house", "apartment", "condo", "townhouse", "other"].map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="checkbox-field household-profile-check">
                    <input
                      checked={profile.hasPets}
                      disabled={isSavingProfile}
                      onChange={(event) => setProfile({ ...profile, hasPets: event.target.checked })}
                      type="checkbox"
                    />
                    Pets live here
                  </label>
                  <label className="checkbox-field household-profile-check">
                    <input
                      checked={profile.hasOutdoorSpace}
                      disabled={isSavingProfile}
                      onChange={(event) => setProfile({ ...profile, hasOutdoorSpace: event.target.checked })}
                      type="checkbox"
                    />
                    Outdoor space
                  </label>
                </div>
                <label className="household-notes-field">
                  Household notes
                  <textarea
                    disabled={isSavingProfile}
                    value={profile.notes ?? ""}
                    onChange={(event) => setProfile({ ...profile, notes: event.target.value })}
                  />
                </label>
                <div className="household-profile-actions">
                  <button className="secondary-action" disabled={isSavingProfile} onClick={resetProfileDraft} type="button">Cancel</button>
                  <button disabled={isSavingProfile} type="submit">Save</button>
                </div>
              </form>
            ) : (
              <section className="home-profile-summary floor-detail-panel" aria-label="Home profile summary">
                <div className="floor-detail-heading">
              <div>
                <h2>Home details</h2>
              </div>
              <button className="secondary-action" onClick={() => setIsEditingProfile(true)} type="button">Edit home details</button>
            </div>
            <section className="home-setup-path" aria-label="Home setup path">
              <p className="eyebrow">Setup path</p>
              <h3>Build the house in three passes</h3>
              <div className="home-setup-steps">
                <span><strong>Floors</strong> Name each level.</span>
                <span><strong>Rooms</strong> Add spaces.</span>
                <span><strong>Surfaces</strong> Tell Clenella what matters.</span>
              </div>
            </section>
            <div className="home-summary-grid">
              <div>
                <span>Home name</span>
                <strong>{profileName}</strong>
              </div>
              <div>
                <span>Home type</span>
                <strong>{profile.homeType}</strong>
              </div>
              <div>
                <span>Pets</span>
                <strong>{formatBoolean(profile.hasPets)}</strong>
              </div>
              <div>
                <span>Outdoor space</span>
                <strong>{formatBoolean(profile.hasOutdoorSpace)}</strong>
              </div>
              <div>
                <span>Modeled structure</span>
                <strong>
                  {floors.length} floor{floors.length === 1 ? "" : "s"} / {floors.reduce((total, floor) => total + floor.rooms.length, 0)} rooms
                </strong>
              </div>
              <div>
                <span>Setup status</span>
                <strong>{setupQualityLabel({ ...household, structure: activeStructure })}</strong>
              </div>
            </div>
            <section className="overview-floor-summary" aria-label="Floor setup summary">
              <div className="overview-floor-summary-heading">
                <p className="eyebrow">Floor snapshot</p>
                <h3>What Clenella knows about each level</h3>
              </div>
              <div className="overview-floor-list">
                {floors.map((floor) => (
                  <button
                    className="overview-floor-row"
                    key={floor.id}
                    onClick={() => handleOpenFloorFromOverview(floor.id)}
                    type="button"
                  >
                    <span>
                      <strong>{floor.name}</strong>
                      <small>{floorSetupLabel(floor)}</small>
                    </span>
                    <span>{floorRoomCountLabel(floor)}</span>
                    <span>{formatList(floor.flooring)}</span>
                  </button>
                ))}
              </div>
            </section>
            {profile.notes ? <p>{profile.notes}</p> : null}
          </section>
            )}
          </>
        ) : workspaceView === "overview" ? (
          <div className="empty-state">No floors modeled yet.</div>
        ) : null}
      </section>

      <section
        aria-label="Household floor editor"
        aria-labelledby={floorsTabId}
        className="household-editor home-studio-workspace"
        hidden={workspaceView !== "floors"}
        id={floorsPanelId}
        role="tabpanel"
      >
        {workspaceView === "floors" && selectedFloor ? (
          <>
            {renderStudioHouseModel({ mode: "select", showActions: !isEditingFloor })}
            <div className="floor-workspace-stack">
              {isEditingFloor ? (
                <form className="floor-detail-panel" onSubmit={handleSaveFloor}>
              <div className="floor-detail-heading">
                <div>
                  <h2>{selectedFloor.name}</h2>
                </div>
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
              <div className="field-grid aligned-field-grid">
                <label>
                  Floor name
                  <input
                    disabled={isSaving}
                    required
                    value={selectedFloor.name}
                    onChange={(event) => updateSelectedFloor({ name: event.target.value })}
                  />
                </label>
                <label>
                  Level type
                  <select
                    disabled={isSaving || selectedFloor.levelType === "main"}
                    value={selectedFloor.levelType}
                    onChange={(event) => updateSelectedFloor({ levelType: event.target.value as HouseholdFloor["levelType"] })}
                  >
                    {floorLevelOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Pet impact
                  <select
                    disabled={isSaving}
                    value={selectedFloor.petImpact}
                    onChange={(event) => updateSelectedFloor({ petImpact: event.target.value as HouseholdFloor["petImpact"] })}
                  >
                    {petImpactOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Vacuum coverage
                  <select
                    disabled={isSaving}
                    value={selectedFloor.robotVacuumCoverage}
                    onChange={(event) => updateSelectedFloor({ robotVacuumCoverage: event.target.value as HouseholdFloor["robotVacuumCoverage"] })}
                  >
                    {coverageOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Mop coverage
                  <select
                    disabled={isSaving}
                    value={selectedFloor.robotMopCoverage}
                    onChange={(event) => updateSelectedFloor({ robotMopCoverage: event.target.value as HouseholdFloor["robotMopCoverage"] })}
                  >
                    {coverageOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Floor notes
                  <textarea
                    disabled={isSaving}
                    value={selectedFloor.notes ?? ""}
                    onChange={(event) => updateSelectedFloor({ notes: event.target.value })}
                  />
                </label>
              </div>
              <section className="floor-surface-panel" aria-label="Flooring surfaces">
                <div className="floor-surface-summary">
                  <div>
                    <span>Flooring</span>
                    <strong>{selectedFloor.flooring.length > 0 ? selectedFloor.flooring.join(", ") : "No floor surfaces set"}</strong>
                  </div>
                  <button className="secondary-action" disabled={isSaving} onClick={() => setIsEditingSurfaces(true)} type="button">
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
              <div className="floor-edit-actions">
                <div>
                  {selectedFloor.levelType !== "main" ? (
                    <button className="danger-link" disabled={isSaving} onClick={() => setPendingRemoveFloorId(selectedFloor.id)} type="button">
                      {selectedFloor.levelType === "basement" ? "Remove basement" : "Remove floor"}
                    </button>
                  ) : null}
                </div>
                <div className="form-actions">
                  <button className="secondary-action" disabled={isSaving} onClick={resetFloorEdit} type="button">Cancel</button>
                  <button disabled={isSaving} type="submit">Save floor details</button>
                </div>
              </div>
                </form>
              ) : (
                <>
                  <section className="floor-detail-panel" aria-label={`${selectedFloor.name} floor details`}>
                <div className="floor-detail-heading">
                  <div>
                    <h2>{selectedFloor.name}</h2>
                  </div>
                  <button className="secondary-action" onClick={() => setIsEditingFloor(true)} type="button">Edit floor</button>
                </div>
                <div className="home-summary-grid floor-readonly-grid">
                  <div>
                    <span>Level type</span>
                    <strong>{selectedFloor.levelType}</strong>
                  </div>
                  <div>
                    <span>Pet impact</span>
                    <strong>{selectedFloor.petImpact}</strong>
                  </div>
                  <div>
                    <span>Vacuum coverage</span>
                    <strong>{selectedFloor.robotVacuumCoverage}</strong>
                  </div>
                  <div>
                    <span>Mop coverage</span>
                    <strong>{selectedFloor.robotMopCoverage}</strong>
                  </div>
                  <div>
                    <span>Flooring</span>
                    <strong>{formatList(selectedFloor.flooring)}</strong>
                  </div>
                </div>
                {selectedFloor.notes ? <p className="readonly-notes">{selectedFloor.notes}</p> : null}
                  </section>
                  {renderRoomsPanel()}
                </>
              )}
            </div>
          </>
        ) : workspaceView === "floors" ? (
          <div className="empty-state">No floors modeled yet.</div>
        ) : null}
      </section>
    </section>
  );
}
