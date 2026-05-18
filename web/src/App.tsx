import { useState } from "react";
import type { FlooringType, HomeType, Recommendation } from "@chore-helper/shared";
import { createChore, createHousehold, generateRecommendations, saveBaseline } from "./api";
import "./App.css";

const allowedFlooringTypes: FlooringType[] = ["carpet", "hardwood", "tile", "mixed", "unknown"];

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFlooring(value: string): FlooringType[] {
  const requestedTypes = parseList(value).map((item) => item.toLowerCase());
  const validTypes = requestedTypes.filter((item): item is FlooringType =>
    allowedFlooringTypes.includes(item as FlooringType)
  );

  return validTypes.length > 0 ? validTypes : ["unknown"];
}

function App() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState("Ready to learn the lay of the land.");
  const [householdName, setHouseholdName] = useState("Home");
  const [homeType, setHomeType] = useState<HomeType>("house");
  const [rooms, setRooms] = useState("kitchen, bathroom");
  const [flooring, setFlooring] = useState("hardwood, tile");
  const [hasPets, setHasPets] = useState(true);
  const [hasOutdoorSpace, setHasOutdoorSpace] = useState(true);
  const [notes, setNotes] = useState("We already have recurring chores in Google Calendar.");
  const [choreTitle, setChoreTitle] = useState("Clean bathrooms");
  const [choreCadence, setChoreCadence] = useState("weekly");
  const [estimatedMinutes, setEstimatedMinutes] = useState("5");
  const [choreSource, setChoreSource] = useState<"manual" | "google-calendar">("manual");

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Building household baseline...");

    const household = await createHousehold(householdName);

    await saveBaseline(household.id, {
      homeType,
      rooms: parseList(rooms),
      flooring: parseFlooring(flooring),
      hasPets,
      hasOutdoorSpace,
      notes
    });

    await createChore(household.id, {
      title: choreTitle,
      cadence: choreCadence,
      estimatedMinutes: Number(estimatedMinutes),
      source: choreSource
    });

    const nextRecommendations = await generateRecommendations(household.id);
    setRecommendations(nextRecommendations);
    setStatus("Expert suggestions ready.");
  }

  return (
    <main className="app-shell">
      <section className="baseline-panel">
        <p className="eyebrow">Chore Helper</p>
        <h1>Household Baseline</h1>
        <p className="lede">
          Start by giving the assistant enough context to make practical, respectful chore
          recommendations.
        </p>
        <form className="baseline-form" onSubmit={handleGenerate}>
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

          <label>
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          <section className="existing-chore-panel" aria-labelledby="existing-chore-heading">
            <h2 id="existing-chore-heading">Existing chore</h2>
            <p>
              Add one chore you already track so the assistant can begin reviewing cadence,
              duration, and scope.
            </p>

            <label>
              Chore title
              <input value={choreTitle} onChange={(event) => setChoreTitle(event.target.value)} />
            </label>

            <label>
              Cadence
              <input value={choreCadence} onChange={(event) => setChoreCadence(event.target.value)} />
            </label>

            <label>
              Estimated minutes
              <input
                min="1"
                type="number"
                value={estimatedMinutes}
                onChange={(event) => setEstimatedMinutes(event.target.value)}
              />
            </label>

            <label>
              Source
              <select
                value={choreSource}
                onChange={(event) =>
                  setChoreSource(event.target.value as "manual" | "google-calendar")
                }
              >
                <option value="manual">Manual</option>
                <option value="google-calendar">Google Calendar</option>
              </select>
            </label>
          </section>

          <p className="status">{status}</p>
          <button type="submit">
            Generate expert suggestions
          </button>
        </form>
      </section>

      <section className="recommendations" aria-label="Expert suggestions">
        {recommendations.map((recommendation) => (
          <article key={recommendation.id} className="recommendation">
            <div>
              <h2>{recommendation.title}</h2>
              <p>{recommendation.rationale}</p>
            </div>
            <span>Confidence: {recommendation.confidence}</span>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
