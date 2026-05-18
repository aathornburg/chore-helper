import cors from "cors";
import express from "express";
import type { AgentProvider } from "./agent/AgentProvider.js";
import { MockChoreAgentProvider } from "./agent/MockChoreAgentProvider.js";
import { createInMemoryStore, type InMemoryStore } from "./repositories/inMemoryStore.js";
import { createHouseholdRouter } from "./routes/households.js";

type AppDependencies = {
  store?: InMemoryStore;
  agentProvider?: AgentProvider;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const store = dependencies.store ?? createInMemoryStore();
  const agentProvider = dependencies.agentProvider ?? new MockChoreAgentProvider();

  app.use(cors());
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/households", createHouseholdRouter(store, agentProvider));

  return app;
}
