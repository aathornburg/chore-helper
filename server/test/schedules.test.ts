import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function auth(email: string) {
  return { Authorization: `Bearer ${email}` };
}

function createScheduleTestApp() {
  const links: string[] = [];
  const app = createApp({
    store: createInMemoryStore(),
    authMode: "test",
    invitationBaseUrl: "http://localhost:5173",
    invitationMailer: {
      async sendInvitation(message) {
        links.push(message.acceptUrl);
      }
    }
  });
  return { app, links };
}

async function prepareHousehold(app: ReturnType<typeof createApp>, links: string[]) {
  const household = await request(app)
    .post("/api/households")
    .set(auth("owner@example.com"))
    .send({ name: "Home" })
    .expect(201);
  const chore = await request(app)
    .post(`/api/households/${household.body.id}/chores`)
    .set(auth("owner@example.com"))
    .send({ title: "Kitchen reset", cadence: "daily", estimatedMinutes: 15, source: "manual" })
    .expect(201);

  await request(app)
    .post(`/api/households/${household.body.id}/invitations`)
    .set(auth("owner@example.com"))
    .send({ email: "member@example.com" })
    .expect(201);
  await request(app)
    .post(`/api/invitations/${links[0].split("/").at(-1)!}/accept`)
    .set(auth("member@example.com"))
    .expect(200);

  const members = await request(app)
    .get(`/api/households/${household.body.id}/members`)
    .set(auth("owner@example.com"))
    .expect(200);

  return {
    householdId: household.body.id as string,
    choreId: chore.body.id as string,
    ownerId: members.body.find((member: { primaryEmail: string }) => member.primaryEmail === "owner@example.com").userId as string,
    memberId: members.body.find((member: { primaryEmail: string }) => member.primaryEmail === "member@example.com").userId as string
  };
}

function dailySchedule(memberId: string) {
  return {
    recurrence: { frequency: "daily", interval: 1 },
    localStartTime: "07:00",
    startsOn: "2026-05-25",
    plannedMinutes: 15,
    assignment: { mode: "fixed", memberUserIds: [memberId] }
  };
}

describe("chore schedules", () => {
  it("allows an owner to create multiple schedules and a member to read them", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    const morning = await request(app)
      .post(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
      .set(auth("owner@example.com"))
      .send(dailySchedule(household.memberId))
      .expect(201);
    const evening = await request(app)
      .post(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
      .set(auth("owner@example.com"))
      .send({
        recurrence: { frequency: "weekly", interval: 1, weekDays: [1, 3, 5] },
        localStartTime: "19:00",
        startsOn: "2026-05-25",
        plannedMinutes: 20,
        assignment: { mode: "rotation", memberUserIds: [household.ownerId, household.memberId] }
      })
      .expect(201);

    await request(app)
      .get(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
      .set(auth("member@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({ id: morning.body.id, localStartTime: "07:00" }),
          expect.objectContaining({ id: evening.body.id, localStartTime: "19:00" })
        ]);
      });
  });

  it("prevents an ordinary member from creating a schedule", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
      .set(auth("member@example.com"))
      .send(dailySchedule(household.memberId))
      .expect(403);
  });

  it("rejects assignments to a user outside the household", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
      .set(auth("owner@example.com"))
      .send(dailySchedule("outside-user"))
      .expect(400)
      .expect((response) => {
        expect(response.body).toEqual({ error: "Schedule assignee must be a household member" });
      });
  });

  it("allows an owner to update and archive a schedule series", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);
    const created = await request(app)
      .post(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
      .set(auth("owner@example.com"))
      .send(dailySchedule(household.memberId))
      .expect(201);

    await request(app)
      .put(`/api/households/${household.householdId}/schedules/${created.body.id}`)
      .set(auth("owner@example.com"))
      .send({ ...dailySchedule(household.memberId), localStartTime: "08:30", plannedMinutes: 25 })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({ localStartTime: "08:30", plannedMinutes: 25 }));
      });

    await request(app)
      .post(`/api/households/${household.householdId}/schedules/${created.body.id}/archive`)
      .set(auth("owner@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body.archivedAt).toEqual(expect.any(String));
      });
  });

  it("materializes occurrences for a new schedule and filters the range by assignee", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
      .set(auth("owner@example.com"))
      .send({
        ...dailySchedule(household.memberId),
        assignment: { mode: "rotation", memberUserIds: [household.ownerId, household.memberId] }
      })
      .expect(201);

    await request(app)
      .get(`/api/households/${household.householdId}/occurrences`)
      .query({
        startAt: "2026-05-25T00:00:00.000Z",
        endAt: "2026-05-28T23:59:59.999Z"
      })
      .set(auth("member@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body.map((occurrence: { assignedUserId: string }) => occurrence.assignedUserId)).toEqual([
          household.ownerId,
          household.memberId,
          household.ownerId,
          household.memberId
        ]);
      });

    await request(app)
      .get(`/api/households/${household.householdId}/occurrences`)
      .query({
        startAt: "2026-05-25T00:00:00.000Z",
        endAt: "2026-05-28T23:59:59.999Z",
        assignedUserId: household.memberId
      })
      .set(auth("member@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(2);
        expect(response.body.every((occurrence: { assignedUserId: string }) =>
          occurrence.assignedUserId === household.memberId
        )).toBe(true);
      });
  });
});
