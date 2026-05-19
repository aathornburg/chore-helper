import { useState } from "react";
import type { HomeType } from "@chore-helper/shared";
import type { HouseholdSetupState, SetupFormValues } from "../types";

type SetupPageProps = {
  householdSetup: HouseholdSetupState;
  onSave: (values: SetupFormValues) => Promise<void>;
};

export function SetupPage({ householdSetup, onSave }: SetupPageProps) {
  const [householdName, setHouseholdName] = useState(householdSetup.householdName);
  const [homeType, setHomeType] = useState<HomeType>(householdSetup.baseline?.homeType ?? "house");
  const [rooms, setRooms] = useState(
    householdSetup.baseline?.rooms.join(", ") ?? "kitchen, bathrooms, bedrooms"
  );
  const [flooring, setFlooring] = useState(
    householdSetup.baseline?.flooring.join(", ") ?? "hardwood, tile, carpet"
  );
  const [hasPets, setHasPets] = useState(householdSetup.baseline?.hasPets ?? true);
  const [hasOutdoorSpace, setHasOutdoorSpace] = useState(
    householdSetup.baseline?.hasOutdoorSpace ?? true
  );
  const [notes, setNotes] = useState(
    householdSetup.baseline?.notes ?? "We already use Google Calendar for recurring chores."
  );
  const [status, setStatus] = useState("Ready to save household basics.");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving household setup...");

    try {
      await onSave({
        householdName,
        homeType,
        rooms,
        flooring,
        hasPets,
        hasOutdoorSpace,
        notes
      });
    } catch {
      setStatus("Could not save household setup.");
    }
  }

  return (
    <div className="setup-page">
      <header className="workspace-hero compact-hero">
        <div>
          <p className="eyebrow">Household basics</p>
          <h1>Household setup</h1>
          <p className="lede">
            Start with the context the assistant needs before reviewing cadence, coverage, and
            estimated effort.
          </p>
        </div>
      </header>

      <form className="panel setup-form" onSubmit={handleSubmit}>
        <div className="field-grid">
          <label>
            Household name
            <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} />
          </label>

          <label>
            Home type
            <select value={homeType} onChange={(event) => setHomeType(event.target.value as HomeType)}>
              <option value="house">House</option>
              <option value="apartment">Apartment</option>
              <option value="condo">Condo</option>
              <option value="townhouse">Townhouse</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            Rooms
            <input value={rooms} onChange={(event) => setRooms(event.target.value)} />
          </label>

          <label>
            Flooring
            <input value={flooring} onChange={(event) => setFlooring(event.target.value)} />
          </label>
        </div>

        <div className="choice-row">
          <label className="checkbox-field">
            <input
              checked={hasPets}
              onChange={(event) => setHasPets(event.target.checked)}
              type="checkbox"
            />
            Has pets
          </label>

          <label className="checkbox-field">
            <input
              checked={hasOutdoorSpace}
              onChange={(event) => setHasOutdoorSpace(event.target.checked)}
              type="checkbox"
            />
            Has outdoor space
          </label>
        </div>

        <label>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        <div className="form-footer">
          <button type="submit">Save basics</button>
          <span>People and calendar setup come later.</span>
        </div>
        <p className="status" role="status">{status}</p>
      </form>
    </div>
  );
}
