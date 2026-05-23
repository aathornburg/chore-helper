/*
  This file is the server's bootstrap entrypoint and is analogous to a
  Spring Boot application class annotated with `@SpringBootApplication`.
  `createApp` wires middleware and routes, similar to how a Spring Boot
  app configures beans and controller wiring during startup.
*/
import cors from "cors";
import express from "express";
import type { AgentProvider } from "./agent/AgentProvider.js";
import { createAgentProvider } from "./agent/createAgentProvider.js";
import type { HouseholdStore } from "./repositories/inMemoryStore.js";
import { createPrismaClient } from "./repositories/prismaClient.js";
import { createPrismaStore } from "./repositories/prismaStore.js";
import { createHouseholdRouter } from "./routes/households.js";

type AppDependencies = {
  store?: HouseholdStore;
  agentProvider?: AgentProvider;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();
  const store = dependencies.store ?? createPrismaStore(createPrismaClient());
  const agentProvider = dependencies.agentProvider ?? createAgentProvider();

  app.use(cors());
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/chores", async (req, res) => {
    const includeArchived = req.query.includeArchived === "true";
    const archivedOnly = req.query.status === "archived";

    return res.status(200).json(await store.listAllChores({
      includeArchived,
      archivedOnly
    }));
  });
  app.get("/api/recommendations", async (_req, res) => {
    return res.status(200).json(await store.listAllRecommendations());
  });
  app.use("/api/households", createHouseholdRouter(store, agentProvider));

  return app;
}
