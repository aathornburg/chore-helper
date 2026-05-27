import request from "supertest";
import { describe, expect, it, vi } from "vitest";
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
  const ownerId = members.body.find((member: { primaryEmail: string }) => member.primaryEmail === "owner@example.com").userId as string;
  const memberId = members.body.find((member: { primaryEmail: string }) => member.primaryEmail === "member@example.com").userId as string;
  const scheduledChore = await request(app)
    .post(`/api/households/${household.body.id}/chores`)
    .set(auth("owner@example.com"))
    .send({
      chore: { title: "Kitchen reset", source: "manual" },
      schedules: [{
        planningMode: "timed",
        recurrence: { frequency: "one_time", interval: 1 },
        localStartTime: "07:00",
        localEndTime: "07:15",
        startsOn: "2026-01-01",
        assignment: { mode: "fixed", memberUserIds: [memberId] }
      }]
    })
    .expect(201);

  return {
    householdId: household.body.id as string,
    choreId: scheduledChore.body.chore.id as string,
    ownerId,
    memberId
  };
}

function dailySchedule(memberId: string) {
  return {
    planningMode: "timed",
    recurrence: { frequency: "daily", interval: 1 },
    localStartTime: "07:00",
    localEndTime: "07:15",
    startsOn: "2026-05-25",
    assignment: { mode: "fixed", memberUserIds: [memberId] }
  };
}

describe("chore schedules", () => {
  it("creates a chore and multiple initial schedules atomically", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    const created = await request(app)
      .post(`/api/households/${household.householdId}/chores`)
      .set(auth("owner@example.com"))
      .send({
        chore: { title: "Laundry", source: "manual", tags: ["clothing"] },
        schedules: [
          {
            planningMode: "timed",
            recurrence: { frequency: "daily", interval: 1 },
            localStartTime: "07:00",
            localEndTime: "07:20",
            startsOn: "2026-05-25",
            assignment: { mode: "fixed", memberUserIds: [household.memberId] }
          },
          {
            planningMode: "flexible",
            recurrence: { frequency: "weekly", interval: 1, weekDays: [0, 6] },
            startsOn: "2026-05-30",
            estimatedMinutes: 60,
            flexibleWindowRule: "once_within_selected_days",
            assignment: { mode: "fixed", memberUserIds: [household.memberId] }
          }
        ]
      })
      .expect(201);

    expect(created.body.chore).toEqual(expect.objectContaining({ title: "Laundry", tags: ["clothing"] }));
    expect(created.body.schedules).toHaveLength(2);
    expect(created.body.schedules).toEqual(expect.arrayContaining([
      expect.objectContaining({ planningMode: "timed", localEndTime: "07:20" }),
      expect.objectContaining({ planningMode: "flexible", estimatedMinutes: 60 })
    ]));
  });

  it("rejects a new chore without an initial schedule", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/chores`)
      .set(auth("owner@example.com"))
      .send({ chore: { title: "Invalid", source: "manual" }, schedules: [] })
      .expect(400);
  });

  it("rejects a flexible once-within-selected-days schedule with duplicate weekdays", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/chores`)
      .set(auth("owner@example.com"))
      .send({
        chore: { title: "Duplicate-day chore", source: "manual" },
        schedules: [{
          planningMode: "flexible",
          recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 6] },
          startsOn: "2026-05-30",
          estimatedMinutes: 60,
          flexibleWindowRule: "once_within_selected_days",
          assignment: { mode: "fixed", memberUserIds: [household.memberId] }
        }]
      })
      .expect(400);
  });

  it("prevents an ordinary member from creating a chore definition and schedule", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/chores`)
      .set(auth("member@example.com"))
      .send({
        chore: { title: "Member-created chore", source: "manual" },
        schedules: [dailySchedule(household.memberId)]
      })
      .expect(403);
  });

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
        planningMode: "timed",
        recurrence: { frequency: "weekly", interval: 1, weekDays: [1, 3, 5] },
        localStartTime: "19:00",
        localEndTime: "19:20",
        startsOn: "2026-05-25",
        assignment: { mode: "rotation", memberUserIds: [household.ownerId, household.memberId] }
      })
      .expect(201);

    await request(app)
      .get(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
      .set(auth("member@example.com"))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: morning.body.id, localStartTime: "07:00" }),
          expect.objectContaining({ id: evening.body.id, localStartTime: "19:00" })
        ]));
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

  it("prevents an ordinary member from editing or archiving a chore definition", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .put(`/api/households/${household.householdId}/chores/${household.choreId}`)
      .set(auth("member@example.com"))
      .send({ title: "Changed by member", source: "manual" })
      .expect(403);
    await request(app)
      .post(`/api/households/${household.householdId}/chores/${household.choreId}/archive`)
      .set(auth("member@example.com"))
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
      .send({ ...dailySchedule(household.memberId), localStartTime: "08:30", localEndTime: "08:55" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({ localStartTime: "08:30", localEndTime: "08:55" }));
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
        endAt: "2026-05-28T23:59:59.999Z",
        startOn: "2026-05-25",
        endOn: "2026-05-28"
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
        startOn: "2026-05-25",
        endOn: "2026-05-28",
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

  it("returns the same flexible once-window occurrence for overlapping Saturday and Sunday ranges", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    const created = await request(app)
      .post(`/api/households/${household.householdId}/chores`)
      .set(auth("owner@example.com"))
      .send({
        chore: { title: "Clean bathrooms", source: "manual" },
        schedules: [{
          planningMode: "flexible",
          recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
          startsOn: "2026-05-30",
          estimatedMinutes: 60,
          flexibleWindowRule: "once_within_selected_days",
          assignment: { mode: "fixed", memberUserIds: [household.memberId] }
        }]
      })
      .expect(201);
    const scheduleId = created.body.schedules[0].id as string;

    const saturday = await request(app)
      .get(`/api/households/${household.householdId}/occurrences`)
      .query({
        startAt: "2026-05-30T00:00:00.000Z",
        endAt: "2026-05-30T23:59:59.999Z",
        startOn: "2026-05-30",
        endOn: "2026-05-30"
      })
      .set(auth("owner@example.com"))
      .expect(200);
    const sunday = await request(app)
      .get(`/api/households/${household.householdId}/occurrences`)
      .query({
        startAt: "2026-05-31T00:00:00.000Z",
        endAt: "2026-05-31T23:59:59.999Z",
        startOn: "2026-05-31",
        endOn: "2026-05-31"
      })
      .set(auth("owner@example.com"))
      .expect(200);

    const saturdayFlexible = saturday.body.filter((occurrence: { scheduleId: string }) => occurrence.scheduleId === scheduleId);
    const sundayFlexible = sunday.body.filter((occurrence: { scheduleId: string }) => occurrence.scheduleId === scheduleId);

    expect(saturdayFlexible).toHaveLength(1);
    expect(sundayFlexible).toHaveLength(1);
    expect(saturdayFlexible[0]).toEqual(expect.objectContaining({
      id: sundayFlexible[0].id,
      planningMode: "flexible",
      eligibleStartOn: "2026-05-30",
      eligibleEndOn: "2026-05-31"
    }));
    expect(saturdayFlexible[0]).not.toHaveProperty("plannedStartAt");
  });

  it("records occurrence exceptions and regenerates only untouched future occurrences", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-25T12:00:00.000Z"));

    try {
      const { app, links } = createScheduleTestApp();
      const household = await prepareHousehold(app, links);
      const schedule = await request(app)
        .post(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
        .set(auth("owner@example.com"))
        .send(dailySchedule(household.memberId))
        .expect(201);

      const initial = await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-05-25T00:00:00.000Z",
          endAt: "2026-05-28T23:59:59.999Z",
          startOn: "2026-05-25",
          endOn: "2026-05-28"
        })
        .set(auth("owner@example.com"))
        .expect(200);

      await request(app)
        .put(`/api/households/${household.householdId}/occurrences/${initial.body[1].id}`)
        .set(auth("owner@example.com"))
        .send({
          plannedStartAt: "2026-05-26T14:00:00.000Z",
          plannedEndAt: "2026-05-26T14:45:00.000Z",
          assignedUserId: household.ownerId
        })
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual(expect.objectContaining({
            exceptionType: "rescheduled",
            assignedUserId: household.ownerId
          }));
        });

      await request(app)
        .post(`/api/households/${household.householdId}/occurrences/${initial.body[2].id}/skip`)
        .set(auth("owner@example.com"))
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual(expect.objectContaining({
            exceptionType: "skipped",
            status: "skipped"
          }));
        });

      await request(app)
        .put(`/api/households/${household.householdId}/schedules/${schedule.body.id}`)
        .set(auth("owner@example.com"))
        .send({
          ...dailySchedule(household.ownerId),
          localStartTime: "09:00",
          localEndTime: "09:30"
        })
        .expect(200);

      await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-05-25T00:00:00.000Z",
          endAt: "2026-05-28T23:59:59.999Z",
          startOn: "2026-05-25",
          endOn: "2026-05-28"
        })
        .set(auth("member@example.com"))
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual([
            expect.objectContaining({
              plannedStartAt: "2026-05-25T11:00:00.000Z",
              assignedUserId: household.memberId,
              exceptionType: "none"
            }),
            expect.objectContaining({
              plannedStartAt: "2026-05-26T14:00:00.000Z",
              assignedUserId: household.ownerId,
              exceptionType: "rescheduled"
            }),
            expect.objectContaining({
              plannedStartAt: "2026-05-27T11:00:00.000Z",
              assignedUserId: household.memberId,
              exceptionType: "skipped",
              status: "skipped"
            }),
            expect.objectContaining({
              plannedStartAt: "2026-05-28T13:00:00.000Z",
              plannedEndAt: "2026-05-28T13:30:00.000Z",
              assignedUserId: household.ownerId,
              exceptionType: "none"
            })
          ]);
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("limits occurrence edits to owners and classifies resize and reassignment exceptions", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);
    await request(app)
      .post(`/api/households/${household.householdId}/chores/${household.choreId}/schedules`)
      .set(auth("owner@example.com"))
      .send(dailySchedule(household.memberId))
      .expect(201);

    const occurrence = (await request(app)
      .get(`/api/households/${household.householdId}/occurrences`)
      .query({
        startAt: "2026-05-26T00:00:00.000Z",
        endAt: "2026-05-26T23:59:59.999Z",
        startOn: "2026-05-26",
        endOn: "2026-05-26"
      })
      .set(auth("owner@example.com"))
      .expect(200)).body[0];

    await request(app)
      .put(`/api/households/${household.householdId}/occurrences/${occurrence.id}`)
      .set(auth("member@example.com"))
      .send({
        plannedStartAt: occurrence.plannedStartAt,
        plannedEndAt: "2026-05-26T11:45:00.000Z",
        assignedUserId: household.memberId
      })
      .expect(403);

    await request(app)
      .put(`/api/households/${household.householdId}/occurrences/${occurrence.id}`)
      .set(auth("owner@example.com"))
      .send({
        plannedStartAt: occurrence.plannedStartAt,
        plannedEndAt: "2026-05-26T11:45:00.000Z",
        assignedUserId: household.memberId
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.exceptionType).toBe("resized");
      });

    await request(app)
      .put(`/api/households/${household.householdId}/occurrences/${occurrence.id}`)
      .set(auth("owner@example.com"))
      .send({
        plannedStartAt: occurrence.plannedStartAt,
        plannedEndAt: "2026-05-26T11:45:00.000Z",
        assignedUserId: household.ownerId
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.exceptionType).toBe("reassigned");
      });
  });
});
