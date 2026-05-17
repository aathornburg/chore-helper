import { useState } from "react";
import type { Recommendation } from "@chore-helper/shared";
import { createHousehold, generateRecommendations, saveBaseline } from "./api";
import "./App.css";

function App() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState("Ready to learn the lay of the land.");

  async function handleGenerate() {
    setStatus("Building household baseline...");

    const household = await createHousehold("Home");

    await saveBaseline(household.id, {
      homeType: "house",
      rooms: ["kitchen", "bathroom"],
      flooring: ["hardwood", "tile"],
      hasPets: true,
      hasOutdoorSpace: true,
      notes: "Initial mock baseline for the first vertical slice."
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
        <p className="status">{status}</p>
        <button type="button" onClick={handleGenerate}>
          Generate expert suggestions
        </button>
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
