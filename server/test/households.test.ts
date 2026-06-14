import type { Recommendation } from "@chore-helper/shared";
import supertest from "supertest";
import { describe, expect, it } from "vitest";
import type {
  AgentChatContext,
  AgentChatResponse,
  AgentProvider,
  AgentRecommendationContext
} from "../src/agent/AgentProvider.js";
import { MockChoreAgentProvider } from "../src/agent/MockChoreAgentProvider.js";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function createTestApp() {
  return createApp({
    store: createInMemoryStore(),
    agentProvider: new MockChoreAgentProvider(),
    authMode: "test"
  });
}

function createTestAppWithStore() {
  const store = createInMemoryStore();
  const app = createApp({
    store,
    agentProvider: new MockChoreAgentProvider(),
    authMode: "test"
  });

  return { app, store };
}

function createInvitationTestApp() {
  const invitationLinks: string[] = [];
  const app = createApp({
    store: createInMemoryStore(),
    agentProvider: new MockChoreAgentProvider(),
    authMode: "test",
    invitationBaseUrl: "http://localhost:5173",
    invitationMailer: {
      async sendInvitation(message) {
        invitationLinks.push(message.acceptUrl);
      }
    }
  });

  return { app, invitationLinks };
}

function request(app: ReturnType<typeof createApp>, userId = "test-user-a") {
  const authorization = `Bearer ${userId}`;

  return {
    get: (url: string) => supertest(app).get(url).set("Authorization", authorization),
    post: (url: string) => supertest(app).post(url).set("Authorization", authorization),
    patch: (url: string) => supertest(app).patch(url).set("Authorization", authorization),
    put: (url: string) => supertest(app).put(url).set("Authorization", authorization),
    delete: (url: string) => supertest(app).delete(url).set("Authorization", authorization)
  };
}

async function createScheduledTask(
  app: ReturnType<typeof createApp>,
  householdId: string,
  title: string,
  userId = "test-user-a"
) {
  const members = await request(app, userId)
    .get(`/api/households/${householdId}/members`)
    .expect(200);
  const assigneeId = members.body[0].userId as string;
  const response = await request(app, userId)
    .post(`/api/households/${householdId}/tasks`)
    .send({
      task: { title, type: "chore", libraryState: "saved", source: "manual" },
      schedules: [{
        planningMode: "timed",
        recurrence: { frequency: "weekly", interval: 1, weekDays: [1] },
        localStartTime: "09:00",
        localEndTime: "09:30",
        startsOn: "2026-05-25",
        assignment: { mode: "fixed", memberUserIds: [assigneeId] }
      }]
    })
    .expect(201);

  return { ...response, body: response.body.task };
}

async function joinHouseholdMember(
  app: ReturnType<typeof createApp>,
  invitationLinks: string[],
  householdId: string,
  email: string
) {
  await request(app, "owner@example.com")
    .post(`/api/households/${householdId}/invitations`)
    .send({ email })
    .expect(201);

  const token = invitationLinks.at(-1)!.split("/").at(-1)!;
  await request(app, email)
    .post(`/api/invitations/${token}/accept`)
    .expect(200);
}

async function findHouseholdMemberId(app: ReturnType<typeof createApp>, householdId: string, primaryEmail: string) {
  const members = await request(app, "owner@example.com")
    .get(`/api/households/${householdId}/members`)
    .expect(200);
  const member = members.body.find((candidate: { primaryEmail?: string }) => candidate.primaryEmail === primaryEmail);
  expect(member).toBeTruthy();
  return member.userId as string;
}

class FailingAgentProvider implements AgentProvider {
  async recommendSetupImprovements(
    _context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    throw new Error("OpenAI request failed");
  }

  async answerHouseholdQuestion(_context: AgentChatContext): Promise<AgentChatResponse> {
    return { answer: "Not used by this test." };
  }
}

class RecordingChatAgentProvider implements AgentProvider {
  receivedContext?: AgentChatContext;

  async recommendSetupImprovements(
    context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    const firstChore = context.chores[0];

    return [
      {
        id: `chat-context-recommendation-${context.household.id}`,
        householdId: context.household.id,
        affectedTaskId: firstChore?.id,
        title: firstChore ? `Review duration for ${firstChore.title}` : "Review household setup",
        rationale: "Deterministic fixture recommendation for assistant chat context tests.",
        confidence: "high",
        status: "pending"
      }
    ];
  }

  async answerHouseholdQuestion(context: AgentChatContext): Promise<AgentChatResponse> {
    this.receivedContext = context;
    return {
      answer: `Mock answer for ${context.household.name}`,
      relatedRecommendationIds: context.recommendations.map((recommendation) => recommendation.id)
    };
  }
}

class FailingChatAgentProvider implements AgentProvider {
  async recommendSetupImprovements(
    _context: AgentRecommendationContext
  ): Promise<Recommendation[]> {
    return [];
  }

  async answerHouseholdQuestion(_context: AgentChatContext): Promise<AgentChatResponse> {
    throw new Error("Assistant chat failed");
  }
}

describe("household profile flow", () => {
  it("lets a household owner delete a household and removes it from their list", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .delete(`/api/households/${created.body.id}`)
      .expect(204);

    await request(app)
      .get("/api/households")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });
  });

  it("requires household owner access to delete a household", async () => {
    const { app, invitationLinks } = createInvitationTestApp();
    const created = await request(app, "owner@example.com").post("/api/households").send({ name: "Home" }).expect(201);

    await joinHouseholdMember(app, invitationLinks, created.body.id, "member@example.com");

    await request(app, "member@example.com")
      .delete(`/api/households/${created.body.id}`)
      .expect(403)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household owner access required" });
      });

    await request(app, "outsider@example.com")
      .delete(`/api/households/${created.body.id}`)
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household not found" });
      });
  });

  it("saves an editable household profile with the household name", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .put(`/api/households/${created.body.id}/profile`)
      .send({
        name: "Lake House",
        homeType: "house",
        hasPets: true,
        hasOutdoorSpace: true,
        notes: "Track seasonal porch cleanup."
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          id: created.body.id,
          name: "Lake House",
          timeZone: "America/New_York",
          profile: {
            homeType: "house",
            hasPets: true,
            hasOutdoorSpace: true,
            notes: "Track seasonal porch cleanup."
          }
        });
      });
  });

  it("lists households with their initial app data", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id as string;

    await request(app)
      .put(`/api/households/${householdId}/profile`)
      .send({
        name: "Home",
        homeType: "house",
        hasPets: true,
        hasOutdoorSpace: false,
        notes: ""
      })
      .expect(200);
    await request(app)
      .put(`/api/households/${householdId}/structure`)
      .send({
        floors: [
          {
            id: "floor-main",
            householdId,
            name: "Main floor",
            levelType: "main",
            flooring: ["hardwood"],
            petImpact: "medium",
            robotVacuumCoverage: "most",
            robotMopCoverage: "partial",
            rooms: []
          }
        ]
      })
      .expect(200);
    const chore = await createScheduledTask(app, householdId, "Clean kitchen");
    await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({ selectedChoreIds: [chore.body.id] })
      .expect(201);

    const response = await request(app).get("/api/households").expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: householdId,
      name: "Home",
      profile: { homeType: "house" },
      structure: {
        householdId,
        floors: [{ id: "floor-main", rooms: [] }]
      },
      tasks: [{
        id: chore.body.id,
        title: "Clean kitchen",
        recommendations: [{ householdId, affectedTaskId: chore.body.id }]
      }],
      recommendations: [{ householdId, affectedTaskId: chore.body.id }]
    });
  });

  it("rejects unauthenticated household API requests", async () => {
    const app = createTestApp();

    await supertest(app)
      .get("/api/households")
      .expect(401)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Authentication required" });
      });
  });

  it("rejects unauthenticated top-level aggregate API requests", async () => {
    const app = createTestApp();

    await supertest(app).get("/api/tasks").expect(401);
    await supertest(app).get("/api/recommendations").expect(401);
  });

  it("rejects unauthenticated nested household API requests", async () => {
    const app = createTestApp();
    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    await supertest(app).get(`/api/households/${created.body.id}/tasks`).expect(401);
  });

  it("returns 404 when an authenticated user accesses another user's household", async () => {
    const app = createTestApp();
    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    await request(app, "test-user-b")
      .get(`/api/households/${created.body.id}`)
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household not found" });
      });
  });

  it("returns 404 when an authenticated nonmember accesses nested household routes", async () => {
    const app = createTestApp();
    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    await request(app, "test-user-b")
      .get(`/api/households/${created.body.id}/tasks`)
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household not found" });
      });
  });

  it("returns 404 for the old household chores route after the task rename", async () => {
    const app = createTestApp();
    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    await request(app)
      .get(`/api/households/${created.body.id}/chores`)
      .expect(404);
  });

  it("creates saved chore and commitment tasks from the household task route", async () => {
    const app = createTestApp();
    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);
    const householdId = created.body.id as string;

    await request(app)
      .post(`/api/households/${householdId}/tasks`)
      .send({
        task: {
          title: "Clean stove",
          type: "chore",
          libraryState: "saved",
          source: "manual",
          instructions: "Degrease the burners.",
          tags: ["kitchen"]
        }
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({
          householdId,
          title: "Clean stove",
          type: "chore",
          libraryState: "saved",
          source: "manual",
          instructions: "Degrease the burners.",
          tags: ["kitchen"]
        }));
      });

    await request(app)
      .post(`/api/households/${householdId}/tasks`)
      .send({
        task: {
          title: "Soccer practice",
          type: "commitment",
          libraryState: "saved",
          source: "manual",
          tags: ["family"]
        }
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({
          householdId,
          title: "Soccer practice",
          type: "commitment",
          libraryState: "saved",
          source: "manual",
          tags: ["family"]
        }));
      });
  });

  it("creates a one-time scheduled task with a task-linked schedule", async () => {
    const app = createTestApp();
    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);
    const householdId = created.body.id as string;
    const members = await request(app)
      .get(`/api/households/${householdId}/members`)
      .expect(200);
    const assigneeId = members.body[0].userId as string;

    await request(app)
      .post(`/api/households/${householdId}/tasks`)
      .send({
        task: {
          title: "One-off repair window",
          type: "commitment",
          libraryState: "one_time",
          source: "manual"
        },
        schedules: [{
          planningMode: "timed",
          recurrence: { frequency: "one_time", interval: 1 },
          localStartTime: "10:00",
          localEndTime: "11:00",
          startsOn: "2026-06-20",
          assignment: { mode: "fixed", memberUserIds: [assigneeId] }
        }]
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.task).toEqual(expect.objectContaining({
          title: "One-off repair window",
          type: "commitment",
          libraryState: "one_time"
        }));
        expect(response.body.schedules).toHaveLength(1);
        expect(response.body.schedules[0]).toEqual(expect.objectContaining({
          taskId: response.body.task.id,
          recurrence: expect.objectContaining({ frequency: "one_time" })
        }));
      });
  });

  it("lists pending imports and one-time scheduled tasks in the task inbox", async () => {
    const { app, store } = createTestAppWithStore();
    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);
    const householdId = created.body.id as string;
    const members = await request(app)
      .get(`/api/households/${householdId}/members`)
      .expect(200);
    const assigneeId = members.body[0].userId as string;

    await store.createCalendarImportQueueItem({
      householdId,
      submittedByUserId: assigneeId,
      submittedByName: "Alex",
      proposedType: "commitment",
      detailLevel: "full_details",
      title: "Busy",
      privacyTitle: "Busy",
      startsAt: "2026-06-20T12:00:00.000Z",
      endsAt: "2026-06-20T13:00:00.000Z"
    });

    await request(app)
      .post(`/api/households/${householdId}/tasks`)
      .send({
        task: {
          title: "Drop off donation",
          type: "commitment",
          libraryState: "one_time",
          source: "manual"
        },
        schedules: [{
          planningMode: "timed",
          recurrence: { frequency: "one_time", interval: 1 },
          localStartTime: "10:00",
          localEndTime: "11:00",
          startsOn: "2026-06-20",
          assignment: { mode: "fixed", memberUserIds: [assigneeId] }
        }]
      })
      .expect(201);

    const response = await request(app)
      .get(`/api/households/${householdId}/task-inbox`)
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "import_queue", badge: "Pending import", title: "Busy" }),
        expect.objectContaining({ kind: "task", badge: "Scheduled", title: "Drop off donation" })
      ])
    );
  });

  it("links a pending import inbox item to an existing task without approving the calendar import", async () => {
    const { app, store } = createTestAppWithStore();
    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);
    const householdId = created.body.id as string;
    const members = await request(app)
      .get(`/api/households/${householdId}/members`)
      .expect(200);
    const assigneeId = members.body[0].userId as string;
    const task = await request(app)
      .post(`/api/households/${householdId}/tasks`)
      .send({
        task: {
          title: "Clean bathrooms",
          type: "chore",
          libraryState: "saved",
          source: "manual"
        }
      })
      .expect(201);
    const queueItem = await store.createCalendarImportQueueItem({
      householdId,
      submittedByUserId: assigneeId,
      submittedByName: "Alex",
      proposedType: "chore",
      detailLevel: "full_details",
      title: "Clean bathrooms",
      privacyTitle: "Busy",
      startsAt: "2026-06-20T12:00:00.000Z",
      endsAt: "2026-06-20T13:00:00.000Z"
    });

    const response = await request(app)
      .post(`/api/households/${householdId}/task-inbox/import_queue/${queueItem.id}/link`)
      .send({ taskId: task.body.id, scope: "single" })
      .expect(200);

    expect(response.body).toEqual(expect.objectContaining({
      queueStatus: "pending",
      taskLinkStatus: "linked",
      linkedTaskId: task.body.id,
      importScope: "single"
    }));
  });

  it("creates a household, saves profile facts, and returns expert recommendations", async () => {
    const app = createTestApp();

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    const householdId = created.body.id;

    await request(app)
      .put(`/api/households/${householdId}/profile`)
      .send({
        name: "Home",
        homeType: "house",
        hasPets: true,
        hasOutdoorSpace: true,
        notes: "We already have recurring chores in Google Calendar."
      })
      .expect(200);

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .expect(201);

    expect(recommendations.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Add a recurring pet hair floor reset",
          confidence: "medium",
          status: "pending"
        })
      ])
    );
  });

  it("saves and fetches household floor and room structure", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;

    await request(app)
      .put(`/api/households/${householdId}/structure`)
      .send({
        floors: [
          {
            id: "floor-main",
            householdId,
            name: "Main floor",
            levelType: "main",
            flooring: ["hardwood", "rugs"],
            petImpact: "medium",
            robotVacuumCoverage: "most",
            robotMopCoverage: "partial",
            notes: "Rugs in the living room.",
            rooms: [
              {
                id: "room-living",
                floorId: "floor-main",
                name: "Living room",
                flooring: ["hardwood", "rugs"],
                petImpact: "high",
                robotVacuumCoverage: "all",
                robotMopCoverage: "inherit",
                notes: "Dog spends most evenings here."
              }
            ]
          }
        ]
      })
      .expect(200);

    await request(app)
      .get(`/api/households/${householdId}/structure`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          householdId,
          floors: [
            expect.objectContaining({
              id: "floor-main",
              householdId,
              name: "Main floor",
              levelType: "main",
              flooring: ["hardwood", "rugs"],
              rooms: [
                expect.objectContaining({
                  id: "room-living",
                  floorId: "floor-main",
                  flooring: ["hardwood", "rugs"]
                })
              ]
            })
          ]
        });
      });
  });

  it("prevents an ordinary member from updating household structure", async () => {
    const { app, invitationLinks } = createInvitationTestApp();
    const created = await request(app, "owner@example.com")
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);
    const householdId = created.body.id as string;
    await joinHouseholdMember(app, invitationLinks, householdId, "member@example.com");

    await request(app, "member@example.com")
      .put(`/api/households/${householdId}/structure`)
      .send({ floors: [] })
      .expect(403)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household owner access required" });
      });
  });

  it("rejects invalid household structure payloads", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .put(`/api/households/${created.body.id}/structure`)
      .send({
        floors: [
          {
            id: "floor-main",
            householdId: created.body.id,
            name: "Main floor",
            levelType: "main",
            flooring: ["marble"],
            petImpact: "medium",
            robotVacuumCoverage: "most",
            robotMopCoverage: "partial",
            rooms: []
          }
        ]
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Invalid household structure payload" });
      });
  });

  it("rejects duplicate household structure ids", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;

    await request(app)
      .put(`/api/households/${householdId}/structure`)
      .send({
        floors: [
          {
            id: "floor-main",
            householdId,
            name: "Main floor",
            levelType: "main",
            flooring: ["hardwood"],
            petImpact: "medium",
            robotVacuumCoverage: "most",
            robotMopCoverage: "partial",
            rooms: [
              {
                id: "room-duplicate",
                floorId: "floor-main",
                name: "Living room",
                flooring: ["hardwood"],
                petImpact: "inherit",
                robotVacuumCoverage: "inherit",
                robotMopCoverage: "inherit"
              }
            ]
          },
          {
            id: "floor-main",
            householdId,
            name: "Duplicate main floor",
            levelType: "other",
            flooring: ["tile"],
            petImpact: "low",
            robotVacuumCoverage: "partial",
            robotMopCoverage: "none",
            rooms: [
              {
                id: "room-duplicate",
                floorId: "floor-main",
                name: "Kitchen",
                flooring: ["tile"],
                petImpact: "inherit",
                robotVacuumCoverage: "inherit",
                robotMopCoverage: "inherit"
              }
            ]
          }
        ]
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Invalid household structure payload" });
      });
  });

  it("allows room ids to repeat on different floors", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;

    await request(app)
      .put(`/api/households/${householdId}/structure`)
      .send({
        floors: [
          {
            id: "floor-main",
            householdId,
            name: "Main floor",
            levelType: "main",
            flooring: ["hardwood"],
            petImpact: "medium",
            robotVacuumCoverage: "most",
            robotMopCoverage: "partial",
            rooms: [
              {
                id: "room-bathroom",
                floorId: "floor-main",
                name: "Main bathroom",
                flooring: ["tile"],
                petImpact: "inherit",
                robotVacuumCoverage: "inherit",
                robotMopCoverage: "inherit"
              }
            ]
          },
          {
            id: "floor-upstairs",
            householdId,
            name: "Upstairs",
            levelType: "upstairs",
            flooring: ["carpet"],
            petImpact: "low",
            robotVacuumCoverage: "partial",
            robotMopCoverage: "none",
            rooms: [
              {
                id: "room-bathroom",
                floorId: "floor-upstairs",
                name: "Upstairs bathroom",
                flooring: ["tile"],
                petImpact: "inherit",
                robotVacuumCoverage: "inherit",
                robotMopCoverage: "inherit"
              }
            ]
          }
        ]
      })
      .expect(200);
  });

  it("flags existing chores that look under-scoped for their ask", async () => {
    const app = createTestApp();

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    const householdId = created.body.id;

    await createScheduledTask(app, householdId, "Clean bathrooms");

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({ reviewPrompt: "Review my existing setup and focus on under-scoped chores." })
      .expect(201);

    expect(recommendations.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Review scheduling for Clean bathrooms",
          confidence: "high",
          status: "pending"
        })
      ])
    );
  });

  it("stages a recommendation decision without immediately changing chores", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;
    const chore = await createScheduledTask(app, householdId, "Clean bathrooms");

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({
        selectedChoreIds: [chore.body.id],
        reviewPrompt: "Review the selected chores."
      })
      .expect(201);
    const recommendation = recommendations.body[0];

    await request(app)
      .put(`/api/households/${householdId}/recommendations/${recommendation.id}/decision`)
      .send({ decision: "accepted" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            id: recommendation.id,
            affectedTaskId: chore.body.id,
            decision: "accepted"
          })
        );
      });

    await request(app)
      .get(`/api/households/${householdId}/tasks`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            id: chore.body.id
          })
        ]);
        expect(response.body[0]).not.toHaveProperty("estimatedMinutes");
      });
  });

  it("applies accepted recommendation decisions in one explicit request", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;
    const chore = await createScheduledTask(app, householdId, "Clean bathrooms");

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({ selectedChoreIds: [chore.body.id] })
      .expect(201);
    const recommendation = recommendations.body[0];

    await request(app)
      .put(`/api/households/${householdId}/recommendations/${recommendation.id}/decision`)
      .send({ decision: "accepted" })
      .expect(200);

    await request(app)
      .post(`/api/households/${householdId}/recommendations/apply`)
      .expect(200)
      .expect((response) => {
        expect(response.body.applied).toEqual([]);
        expect(response.body.requiresScheduleDraftDesign).toBe(true);
      });

    await request(app)
      .get(`/api/households/${householdId}/tasks`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            id: chore.body.id
          })
        ]);
        expect(response.body[0]).not.toHaveProperty("estimatedMinutes");
      });
  });

  it("fetches a saved household with its profile for frontend restore", async () => {
    const app = createTestApp();

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    await request(app)
      .put(`/api/households/${created.body.id}/profile`)
      .send({
        name: "Home",
        homeType: "house",
        hasPets: true,
        hasOutdoorSpace: true,
        notes: "Setup survives refresh."
      })
      .expect(200);

    const fetched = await request(app)
      .get(`/api/households/${created.body.id}`)
      .expect(200);

    expect(fetched.body).toEqual({
      id: created.body.id,
      name: "Home",
      timeZone: "America/New_York",
      profile: {
        homeType: "house",
        hasPets: true,
        hasOutdoorSpace: true,
        notes: "Setup survives refresh."
      }
    });
  });

  it("fetches saved recommendations for a household", async () => {
    const app = createTestApp();

    const created = await request(app)
      .post("/api/households")
      .send({ name: "Home" })
      .expect(201);

    await request(app)
      .put(`/api/households/${created.body.id}/profile`)
      .send({
        name: "Home",
        homeType: "house",
        hasPets: true,
        hasOutdoorSpace: false
      })
      .expect(200);

    await request(app)
      .post(`/api/households/${created.body.id}/recommendations`)
      .expect(201);

    const fetched = await request(app)
      .get(`/api/households/${created.body.id}/recommendations`)
      .expect(200);

    expect(fetched.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          householdId: created.body.id,
          status: "pending"
        })
      ])
    );
  });

  it("updates, archives, lists archived, and restores household chores", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;
    const chore = await createScheduledTask(app, householdId, "Clean bathrooms");

    await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({ reviewPrompt: "Review existing chores." })
      .expect(201);

    await request(app)
      .put(`/api/households/${householdId}/tasks/${chore.body.id}`)
      .send({ title: "Clean main bathroom", type: "chore", libraryState: "saved", source: "manual" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({ title: "Clean main bathroom" }));
      });

    await request(app)
      .get(`/api/households/${householdId}/recommendations`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });

    await request(app)
      .post(`/api/households/${householdId}/tasks/${chore.body.id}/archive`)
      .expect(200)
      .expect((response) => {
        expect(response.body.archivedAt).toEqual(expect.any(String));
      });

    await request(app)
      .get(`/api/households/${householdId}/tasks`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });

    await request(app)
      .get(`/api/households/${householdId}/tasks?status=archived`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([expect.objectContaining({ id: chore.body.id })]);
      });

    await request(app)
      .post(`/api/households/${householdId}/tasks/${chore.body.id}/restore`)
      .expect(200)
      .expect((response) => {
        expect(response.body.archivedAt).toBeUndefined();
      });
  });

  it("defaults new household members to view-only chore library access", async () => {
    const { app, invitationLinks } = createInvitationTestApp();
    const created = await request(app, "owner@example.com").post("/api/households").send({ name: "Home" }).expect(201);

    await joinHouseholdMember(app, invitationLinks, created.body.id, "member@example.com");

    await request(app, "owner@example.com")
      .get(`/api/households/${created.body.id}/members`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.arrayContaining([
          expect.objectContaining({
            primaryEmail: "member@example.com",
            taskLibraryPermission: "view"
          })
        ]));
      });
  });

  it("lets owners grant chore library management to individual members", async () => {
    const { app, invitationLinks } = createInvitationTestApp();
    const created = await request(app, "owner@example.com").post("/api/households").send({ name: "Home" }).expect(201);
    await joinHouseholdMember(app, invitationLinks, created.body.id, "member@example.com");
    const memberId = await findHouseholdMemberId(app, created.body.id, "member@example.com");

    await request(app, "owner@example.com")
      .patch(`/api/households/${created.body.id}/members/${memberId}/task-library-permission`)
      .send({ taskLibraryPermission: "manage" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({
          userId: memberId,
          taskLibraryPermission: "manage"
        }));
      });
  });

  it("allows manage members to create, update, archive, and restore library chores", async () => {
    const { app, invitationLinks } = createInvitationTestApp();
    const created = await request(app, "owner@example.com").post("/api/households").send({ name: "Home" }).expect(201);
    await joinHouseholdMember(app, invitationLinks, created.body.id, "member@example.com");
    const memberId = await findHouseholdMemberId(app, created.body.id, "member@example.com");
    await request(app, "owner@example.com")
      .patch(`/api/households/${created.body.id}/members/${memberId}/task-library-permission`)
      .send({ taskLibraryPermission: "manage" })
      .expect(200);

    const chore = await request(app, "member@example.com")
      .post(`/api/households/${created.body.id}/tasks`)
      .send({
        task: {
          title: "Wipe counters",
          type: "chore",
          libraryState: "saved",
          source: "manual",
          instructions: "Use spray.",
          tags: ["kitchen"]
        }
      })
      .expect(201);

    await request(app, "member@example.com")
      .put(`/api/households/${created.body.id}/tasks/${chore.body.id}`)
      .send({
        title: "Wipe kitchen counters",
        type: "chore",
        libraryState: "saved",
        source: "manual",
        instructions: "Use spray.",
        tags: ["kitchen"]
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.title).toBe("Wipe kitchen counters");
      });

    await request(app, "member@example.com")
      .post(`/api/households/${created.body.id}/tasks/${chore.body.id}/archive`)
      .expect(200)
      .expect((response) => {
        expect(response.body.archivedAt).toEqual(expect.any(String));
      });

    await request(app, "member@example.com")
      .post(`/api/households/${created.body.id}/tasks/${chore.body.id}/restore`)
      .expect(200)
      .expect((response) => {
        expect(response.body.archivedAt).toBeUndefined();
      });
  });

  it("blocks view-only members from mutating chore library chores", async () => {
    const { app, invitationLinks } = createInvitationTestApp();
    const created = await request(app, "owner@example.com").post("/api/households").send({ name: "Home" }).expect(201);
    await joinHouseholdMember(app, invitationLinks, created.body.id, "member@example.com");
    const chore = await request(app, "owner@example.com")
      .post(`/api/households/${created.body.id}/tasks`)
      .send({ task: { title: "Dust shelves", type: "chore", libraryState: "saved", source: "manual", tags: ["dusting"] } })
      .expect(201);

    await request(app, "member@example.com")
      .post(`/api/households/${created.body.id}/tasks`)
      .send({ task: { title: "Vacuum stairs", type: "chore", libraryState: "saved", source: "manual" } })
      .expect(403);

    await request(app, "member@example.com")
      .put(`/api/households/${created.body.id}/tasks/${chore.body.id}`)
      .send({ title: "Dust book shelves", type: "chore", libraryState: "saved", source: "manual", tags: ["dusting"] })
      .expect(403);

    await request(app, "member@example.com")
      .post(`/api/households/${created.body.id}/tasks/${chore.body.id}/archive`)
      .expect(403);
  });

  it("lists active chores across households from the top-level chores route", async () => {
    const app = createTestApp();
    const first = await request(app).post("/api/households").send({ name: "First" }).expect(201);
    const second = await request(app).post("/api/households").send({ name: "Second" }).expect(201);

    const firstChore = await createScheduledTask(app, first.body.id, "Vacuum");
    const secondChore = await createScheduledTask(app, second.body.id, "Mop");

    await request(app)
      .get("/api/tasks")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            id: firstChore.body.id,
            householdId: first.body.id,
            householdName: "First"
          }),
          expect.objectContaining({
            id: secondChore.body.id,
            householdId: second.body.id,
            householdName: "Second"
          })
        ]);
      });
  });

  it("lists only the authenticated user's chores from the top-level chores route", async () => {
    const app = createTestApp();
    const first = await request(app, "test-user-a").post("/api/households").send({ name: "First" }).expect(201);
    const second = await request(app, "test-user-b").post("/api/households").send({ name: "Second" }).expect(201);

    const firstChore = await createScheduledTask(app, first.body.id, "Vacuum", "test-user-a");
    await createScheduledTask(app, second.body.id, "Mop", "test-user-b");

    await request(app, "test-user-a")
      .get("/api/tasks")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            id: firstChore.body.id,
            householdId: first.body.id,
            householdName: "First"
          })
        ]);
      });
  });

  it("lists only the authenticated user's recommendations from the top-level recommendations route", async () => {
    const app = createTestApp();
    const first = await request(app, "test-user-a").post("/api/households").send({ name: "First" }).expect(201);
    const second = await request(app, "test-user-b").post("/api/households").send({ name: "Second" }).expect(201);

    await createScheduledTask(app, first.body.id, "Clean bathroom", "test-user-a");
    await createScheduledTask(app, second.body.id, "Clean bathroom", "test-user-b");

    await request(app, "test-user-a")
      .post(`/api/households/${first.body.id}/recommendations`)
      .send({ reviewPrompt: "Review first home." })
      .expect(201);
    await request(app, "test-user-b")
      .post(`/api/households/${second.body.id}/recommendations`)
      .send({ reviewPrompt: "Review second home." })
      .expect(201);

    await request(app, "test-user-a")
      .get("/api/recommendations")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            householdId: first.body.id
          })
        ]);
      });
  });

  it("returns 404 when updating a chore through the wrong household", async () => {
    const app = createTestApp();
    const first = await request(app).post("/api/households").send({ name: "First" }).expect(201);
    const second = await request(app).post("/api/households").send({ name: "Second" }).expect(201);
    const chore = await createScheduledTask(app, first.body.id, "Vacuum");

    await request(app)
      .put(`/api/households/${second.body.id}/tasks/${chore.body.id}`)
      .send({ title: "Vacuum", type: "chore", libraryState: "saved", source: "manual" })
      .expect(404);
  });

  it("returns a stable 502 when recommendation generation fails", async () => {
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider: new FailingAgentProvider(),
      authMode: "test"
    });
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/recommendations`)
      .send({ reviewPrompt: "Review these chores." })
      .expect(502)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Could not generate recommendations" });
      });
  });

  it("answers assistant chat questions with household context", async () => {
    const agentProvider = new RecordingChatAgentProvider();
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider,
      authMode: "test"
    });
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);
    const householdId = created.body.id;

    await request(app)
      .put(`/api/households/${householdId}/profile`)
      .send({
        name: "Home",
        homeType: "house",
        hasPets: true,
        hasOutdoorSpace: false,
        notes: "One dog."
      })
      .expect(200);

    const chore = await createScheduledTask(app, householdId, "Clean bathrooms");

    const recommendations = await request(app)
      .post(`/api/households/${householdId}/recommendations`)
      .send({ selectedChoreIds: [chore.body.id] })
      .expect(201);

    await request(app)
      .post(`/api/households/${householdId}/assistant/chat`)
      .send({ message: " Which chores look under-scoped? " })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          answer: "Mock answer for Home",
          relatedRecommendationIds: [recommendations.body[0].id]
        });
      });

    expect(agentProvider.receivedContext).toEqual(
      expect.objectContaining({
        message: "Which chores look under-scoped?",
        household: expect.objectContaining({ id: householdId, name: "Home" }),
        chores: [expect.objectContaining({ id: chore.body.id, title: "Clean bathrooms" })],
        recommendations: [
          expect.objectContaining({
            id: recommendations.body[0].id,
            householdId,
            affectedTaskId: chore.body.id,
            title: "Review duration for Clean bathrooms",
            status: "pending"
          })
        ]
      })
    );
  });

  it("returns 400 for empty assistant chat messages", async () => {
    const app = createTestApp();
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/assistant/chat`)
      .send({ message: "   " })
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Invalid assistant chat payload" });
      });
  });

  it("returns 404 for assistant chat on an unknown household", async () => {
    const app = createTestApp();

    await request(app)
      .post("/api/households/missing-household/assistant/chat")
      .send({ message: "What should I optimize?" })
      .expect(404)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Household not found" });
      });
  });

  it("returns a stable 502 when assistant chat generation fails", async () => {
    const app = createApp({
      store: createInMemoryStore(),
      agentProvider: new FailingChatAgentProvider(),
      authMode: "test"
    });
    const created = await request(app).post("/api/households").send({ name: "Home" }).expect(201);

    await request(app)
      .post(`/api/households/${created.body.id}/assistant/chat`)
      .send({ message: "What should I optimize?" })
      .expect(502)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Could not answer assistant question" });
      });
  });
});
