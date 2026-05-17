import cors from "cors";
import express from "express";
import { MockChoreAgentProvider } from "./agent/MockChoreAgentProvider.js";
import { createInMemoryStore } from "./repositories/inMemoryStore.js";
import { createHouseholdRouter } from "./routes/households.js";

export function createApp() {
  const app = express();
  const store = createInMemoryStore();
  const agentProvider = new MockChoreAgentProvider();

  app.use(cors());
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/households", createHouseholdRouter(store, agentProvider));

  return app;
}
