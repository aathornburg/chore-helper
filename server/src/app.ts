/*
  This file is the server's bootstrap entrypoint and is analogous to a
  Spring Boot application class annotated with `@SpringBootApplication`.
  `createApp` wires middleware and routes, similar to how a Spring Boot
  app configures beans and controller wiring during startup.
*/
import cors from "cors";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import type { AgentProvider } from "./agent/AgentProvider.js";
import { createAgentProvider } from "./agent/createAgentProvider.js";
import type { AuthMode } from "./auth/currentUser.js";
import { resolveCurrentUser } from "./auth/currentUser.js";
import type { InvitationMailer } from "./invitations/InvitationMailer.js";
import { LocalInvitationMailer, UnavailableInvitationMailer } from "./invitations/InvitationMailer.js";
import { ResendInvitationMailer } from "./invitations/ResendInvitationMailer.js";
import type { HouseholdStore } from "./repositories/inMemoryStore.js";
import { createPrismaClient } from "./repositories/prismaClient.js";
import { createPrismaStore } from "./repositories/prismaStore.js";
import { createHouseholdRouter } from "./routes/households.js";
import { createInvitationRouter } from "./routes/invitations.js";
import { createMeRouter } from "./routes/me.js";
import { createCalendarRouter } from "./routes/calendar.js";
import type { GoogleCalendarProvider } from "./calendar/googleCalendarProvider.js";
import {
  assertProductionSecurityConfig,
  createCorsOptions,
  expensiveEndpointRateLimit,
  rejectDisallowedCorsOrigins,
  securityHeaders
} from "./security/httpSecurity.js";

type AppDependencies = {
  store?: HouseholdStore;
  agentProvider?: AgentProvider;
  authMode?: AuthMode;
  invitationMailer?: InvitationMailer;
  invitationBaseUrl?: string;
  calendarProvider?: GoogleCalendarProvider;
};

export function createApp(dependencies: AppDependencies = {}) {
  assertProductionSecurityConfig();
  const app = express();
  const store = dependencies.store ?? createPrismaStore(createPrismaClient());
  const agentProvider = dependencies.agentProvider ?? createAgentProvider();
  const authMode = dependencies.authMode ?? "clerk";
  const invitationMailer = dependencies.invitationMailer ??
    (process.env.RESEND_API_KEY && process.env.INVITATION_FROM_EMAIL
      ? new ResendInvitationMailer(process.env.RESEND_API_KEY, process.env.INVITATION_FROM_EMAIL)
      : process.env.NODE_ENV !== "production"
        ? new LocalInvitationMailer()
        : new UnavailableInvitationMailer());
  const invitationBaseUrl = dependencies.invitationBaseUrl ?? process.env.APP_BASE_URL ?? "http://localhost:5173";

  app.use(securityHeaders());
  app.use(rejectDisallowedCorsOrigins());
  app.use(cors(createCorsOptions()));
  app.use(expensiveEndpointRateLimit());
  if (authMode === "clerk") {
    app.use(clerkMiddleware());
  }
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "256kb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/tasks", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;

    const includeArchived = req.query.includeArchived === "true";
    const archivedOnly = req.query.status === "archived";
    const households = await store.listHouseholdsForUser(user.id);
    const householdNames = new Map(households.map((household) => [household.id, household.name]));
    const tasks = (
      await Promise.all(
        households.map((household) =>
          store.listTasks(household.id, {
            includeArchived,
            archivedOnly
          })
        )
      )
    ).flat();

    return res.status(200).json(
      tasks.map((task) => ({
        ...task,
        householdName: householdNames.get(task.householdId)
      }))
    );
  });
  app.get("/api/recommendations", async (req, res) => {
    const user = await resolveCurrentUser(req, res, store, authMode);
    if (!user) return;

    const households = await store.listHouseholdsForUser(user.id);
    const recommendations = (
      await Promise.all(households.map((household) => store.listRecommendations(household.id)))
    ).flat();

    return res.status(200).json(recommendations);
  });
  app.use("/api/me", createMeRouter(store, authMode));
  app.use("/api", createCalendarRouter(store, authMode, { googleProvider: dependencies.calendarProvider }));
  app.use("/api/invitations", createInvitationRouter(store, authMode));
  app.use(
    "/api/households",
    createHouseholdRouter(store, agentProvider, authMode, {
      mailer: invitationMailer,
      baseUrl: invitationBaseUrl
    })
  );

  return app;
}
