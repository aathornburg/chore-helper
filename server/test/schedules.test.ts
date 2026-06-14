import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { TaskOccurrence } from "@chore-helper/shared";
import { createApp } from "../src/app.js";
import { createInMemoryStore } from "../src/repositories/inMemoryStore.js";

function auth(email: string) {
  return { Authorization: `Bearer ${email}` };
}

function createScheduleTestApp() {
  const links: string[] = [];
  const store = createInMemoryStore();
  const app = createApp({
    store,
    authMode: "test",
    invitationBaseUrl: "http://localhost:5173",
    invitationMailer: {
      async sendInvitation(message) {
        links.push(message.acceptUrl);
      }
    }
  });
  return { app, links, store };
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
    .post(`/api/households/${household.body.id}/tasks`)
    .set(auth("owner@example.com"))
    .send({
      task: { title: "Kitchen reset", type: "chore", libraryState: "saved", source: "manual" },
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
    taskId: scheduledChore.body.task.id as string,
    ownerId,
    memberId
  };
}

async function addMember(
  app: ReturnType<typeof createApp>,
  links: string[],
  householdId: string,
  email: string
) {
  await request(app)
    .post(`/api/households/${householdId}/invitations`)
    .set(auth("owner@example.com"))
    .send({ email })
    .expect(201);
  await request(app)
    .post(`/api/invitations/${links.at(-1)!.split("/").at(-1)!}/accept`)
    .set(auth(email))
    .expect(200);

  const members = await request(app)
    .get(`/api/households/${householdId}/members`)
    .set(auth("owner@example.com"))
    .expect(200);
  return members.body.find((member: { primaryEmail: string }) => member.primaryEmail === email).userId as string;
}

async function createAssignedFlexibleOccurrence(
  app: ReturnType<typeof createApp>,
  household: Awaited<ReturnType<typeof prepareHousehold>>
) {
  const response = await request(app)
    .post(`/api/households/${household.householdId}/tasks`)
    .set(auth("owner@example.com"))
    .send({
      task: { title: "Clean bathrooms", type: "chore", libraryState: "saved", source: "manual" },
      schedules: [{
        planningMode: "flexible",
        recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
        estimatedMinutes: 60,
        flexibleWindowRule: "once_within_selected_days",
        startsOn: "2026-05-30",
        assignment: { mode: "fixed", memberUserIds: [household.memberId] }
      }]
    })
    .expect(201);
  const scheduleId = response.body.schedules[0].id as string;
  const occurrences = await request(app)
    .get(`/api/households/${household.householdId}/occurrences`)
    .query({
      startAt: "2026-05-30T00:00:00.000Z",
      endAt: "2026-05-31T23:59:59.999Z",
      startOn: "2026-05-30",
      endOn: "2026-05-31"
    })
    .set(auth("owner@example.com"))
    .expect(200);
  return occurrences.body.find((occurrence: TaskOccurrence) => occurrence.scheduleId === scheduleId) as TaskOccurrence;
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

describe("Task schedules", () => {
  it("lets the assigned member complete planned work with audit identity and timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T16:00:00.000Z"));

    try {
      const { app, links } = createScheduleTestApp();
      const household = await prepareHousehold(app, links);
      const occurrence = await createAssignedFlexibleOccurrence(app, household);

      await request(app)
        .post(`/api/households/${household.householdId}/occurrences/${occurrence.id}/complete`)
        .set(auth("member@example.com"))
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual(expect.objectContaining({
            status: "completed",
            completedAt: "2026-05-30T16:00:00.000Z",
            completedByUserId: household.memberId
          }));
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records completion check-in answers for completed work", async () => {
    const { app, links, store } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);
    const occurrence = await createAssignedFlexibleOccurrence(app, household);

    const completed = await request(app)
      .post(`/api/households/${household.householdId}/occurrences/${occurrence.id}/complete`)
      .set(auth("member@example.com"))
      .send({
        completedOnTime: false,
        durationAccurate: false,
        keepAssignee: true,
        rebaseFutureOccurrences: true
      })
      .expect(200);

    await expect(Promise.resolve(
      store.getCompletionCheckInForOccurrence(household.householdId, occurrence.id)
    )).resolves.toEqual(expect.objectContaining({
      householdId: household.householdId,
      occurrenceId: occurrence.id,
      completedByUserId: household.memberId,
      completedAt: completed.body.completedAt,
      completedOnTime: false,
      durationAccurate: false,
      keepAssignee: true,
      rebaseFutureOccurrences: true
    }));
  });

  it("lets the completing member update completion check-in answers later", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);
    await addMember(app, links, household.householdId, "other-member@example.com");
    const occurrence = await createAssignedFlexibleOccurrence(app, household);

    await request(app)
      .post(`/api/households/${household.householdId}/occurrences/${occurrence.id}/complete`)
      .set(auth("member@example.com"))
      .send({})
      .expect(200);

    await request(app)
      .put(`/api/households/${household.householdId}/occurrences/${occurrence.id}/check-in`)
      .set(auth("other-member@example.com"))
      .send({ completedOnTime: false })
      .expect(403);

    await request(app)
      .put(`/api/households/${household.householdId}/occurrences/${occurrence.id}/check-in`)
      .set(auth("member@example.com"))
      .send({
        completedOnTime: false,
        durationAccurate: false,
        rebaseFutureOccurrences: false
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(expect.objectContaining({
          occurrenceId: occurrence.id,
          completedByUserId: household.memberId,
          completedOnTime: false,
          durationAccurate: false,
          rebaseFutureOccurrences: false
        }));
      });
  });

  it("does not let a different ordinary member complete assigned work", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);
    await addMember(app, links, household.householdId, "other-member@example.com");
    const occurrence = await createAssignedFlexibleOccurrence(app, household);

    await request(app)
      .post(`/api/households/${household.householdId}/occurrences/${occurrence.id}/complete`)
      .set(auth("other-member@example.com"))
      .expect(403);
  });

  it("does not complete work for a former assignee after reassignment", async () => {
    const store = createInMemoryStore();
    const links: string[] = [];
    let raced = false;
    const racingStore = {
      ...store,
      async completeOccurrence(
        householdId: string,
        occurrenceId: string,
        completedByUserId: string,
        completedAt: string
      ) {
        const occurrence = await store.getOccurrence(householdId, occurrenceId);
        if (!raced && occurrence) {
          raced = true;
          await store.updateOccurrenceException(householdId, occurrenceId, {
            plannedStartAt: occurrence.plannedStartAt!,
            plannedEndAt: occurrence.plannedEndAt!,
            assignedUserId: occurrence.assignedUserId === completedByUserId ? "race-user" : completedByUserId
          });
        }
        return store.completeOccurrence(householdId, occurrenceId, completedByUserId, completedAt);
      }
    };
    const app = createApp({
      store: racingStore,
      authMode: "test",
      invitationBaseUrl: "http://localhost:5173",
      invitationMailer: {
        async sendInvitation(message) {
          links.push(message.acceptUrl);
        }
      }
    });
    const household = await prepareHousehold(app, links);
    const occurrence = await createAssignedFlexibleOccurrence(app, household);

    await request(app)
      .post(`/api/households/${household.householdId}/occurrences/${occurrence.id}/complete`)
      .set(auth("member@example.com"))
      .expect(409);
  });

  it("returns not found for missing completed work and conflict for non-planned work", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T16:00:00.000Z"));

    try {
      const { app, links } = createScheduleTestApp();
      const household = await prepareHousehold(app, links);
      const occurrence = await createAssignedFlexibleOccurrence(app, household);

      await request(app)
        .post(`/api/households/${household.householdId}/occurrences/missing-occurrence/complete`)
        .set(auth("member@example.com"))
        .expect(404);

      await request(app)
        .post(`/api/households/${household.householdId}/occurrences/${occurrence.id}/complete`)
        .set(auth("member@example.com"))
        .expect(200);

      await request(app)
        .post(`/api/households/${household.householdId}/occurrences/${occurrence.id}/complete`)
        .set(auth("member@example.com"))
        .expect(409);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rebases future recurring occurrences from the completion date when requested", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T16:00:00.000Z"));

    try {
      const { app, links } = createScheduleTestApp();
      const household = await prepareHousehold(app, links);
      const created = await request(app)
        .post(`/api/households/${household.householdId}/tasks`)
        .set(auth("owner@example.com"))
        .send({
          task: { title: "Clean filter", type: "chore", libraryState: "saved", source: "manual" },
          schedules: [{
            planningMode: "flexible",
            recurrence: { frequency: "weekly", interval: 5, weekDays: [3] },
            estimatedMinutes: 30,
            flexibleWindowRule: "each_selected_day",
            startsOn: "2026-04-22",
            assignment: { mode: "fixed", memberUserIds: [household.memberId] }
          }]
        })
        .expect(201);
      const scheduleId = created.body.schedules[0].id as string;

      const before = await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-05-20T00:00:00.000Z",
          endAt: "2026-07-20T23:59:59.999Z",
          startOn: "2026-05-20",
          endOn: "2026-07-20"
        })
        .set(auth("owner@example.com"))
        .expect(200);
      const lateOccurrence = before.body.find((occurrence: TaskOccurrence) =>
        occurrence.scheduleId === scheduleId && occurrence.eligibleStartOn === "2026-05-27"
      ) as TaskOccurrence;

      await request(app)
        .post(`/api/households/${household.householdId}/occurrences/${lateOccurrence.id}/complete`)
        .set(auth("member@example.com"))
        .send({
          completedOnTime: false,
          durationAccurate: true,
          keepAssignee: true,
          rebaseFutureOccurrences: true
        })
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual(expect.objectContaining({
            status: "completed",
            eligibleStartOn: "2026-05-27",
            completedAt: "2026-06-03T16:00:00.000Z"
          }));
        });

      await request(app)
        .get(`/api/households/${household.householdId}/tasks/${created.body.task.id}/schedules`)
        .set(auth("owner@example.com"))
        .expect(200)
        .expect((response) => {
          expect(response.body[0]).toEqual(expect.objectContaining({
            startsOn: "2026-06-03",
            recurrence: expect.objectContaining({ weekDays: [3] })
          }));
        });

      await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-05-20T00:00:00.000Z",
          endAt: "2026-07-20T23:59:59.999Z",
          startOn: "2026-05-20",
          endOn: "2026-07-20"
        })
        .set(auth("owner@example.com"))
        .expect(200)
        .expect((response) => {
          expect(response.body).toEqual(expect.arrayContaining([
            expect.objectContaining({
              id: lateOccurrence.id,
              status: "completed",
              eligibleStartOn: "2026-05-27"
            }),
            expect.objectContaining({
              scheduleId,
              status: "planned",
              eligibleStartOn: "2026-07-08"
            })
          ]));
          expect(response.body).not.toEqual(expect.arrayContaining([
            expect.objectContaining({
              scheduleId,
              status: "planned",
              eligibleStartOn: "2026-07-01"
            })
          ]));
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates a Task and multiple initial schedules atomically", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    const created = await request(app)
      .post(`/api/households/${household.householdId}/tasks`)
      .set(auth("owner@example.com"))
      .send({
        task: { title: "Laundry", type: "chore", libraryState: "saved", source: "manual", tags: ["clothing"] },
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

    expect(created.body.task).toEqual(expect.objectContaining({ title: "Laundry", tags: ["clothing"] }));
    expect(created.body.schedules).toHaveLength(2);
    expect(created.body.schedules).toEqual(expect.arrayContaining([
      expect.objectContaining({ planningMode: "timed", localEndTime: "07:20" }),
      expect.objectContaining({ planningMode: "flexible", estimatedMinutes: 60 })
    ]));
  });

  it("rejects a new Task without an initial schedule", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/tasks`)
      .set(auth("owner@example.com"))
      .send({ task: { title: "Invalid", type: "chore", libraryState: "saved", source: "manual" }, schedules: [] })
      .expect(400);
  });

  it("rejects a flexible once-within-selected-days schedule with duplicate weekdays", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/tasks`)
      .set(auth("owner@example.com"))
      .send({
        task: { title: "Duplicate-day Task", type: "chore", libraryState: "saved", source: "manual" },
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

  it("prevents an ordinary member from creating a Task definition and schedule", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/tasks`)
      .set(auth("member@example.com"))
      .send({
        task: { title: "Member-created Task", type: "chore", libraryState: "saved", source: "manual" },
        schedules: [dailySchedule(household.memberId)]
      })
      .expect(403);
  });

  it("allows an owner to create multiple schedules and a member to read them", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    const morning = await request(app)
      .post(`/api/households/${household.householdId}/tasks/${household.taskId}/schedules`)
      .set(auth("owner@example.com"))
      .send(dailySchedule(household.memberId))
      .expect(201);
    const evening = await request(app)
      .post(`/api/households/${household.householdId}/tasks/${household.taskId}/schedules`)
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
      .get(`/api/households/${household.householdId}/tasks/${household.taskId}/schedules`)
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
      .post(`/api/households/${household.householdId}/tasks/${household.taskId}/schedules`)
      .set(auth("member@example.com"))
      .send(dailySchedule(household.memberId))
      .expect(403);
  });

  it("prevents an ordinary member from editing or archiving a Task definition", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .put(`/api/households/${household.householdId}/tasks/${household.taskId}`)
      .set(auth("member@example.com"))
      .send({ title: "Changed by member", source: "manual" })
      .expect(403);
    await request(app)
      .post(`/api/households/${household.householdId}/tasks/${household.taskId}/archive`)
      .set(auth("member@example.com"))
      .expect(403);
  });

  it("rejects assignments to a user outside the household", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .post(`/api/households/${household.householdId}/tasks/${household.taskId}/schedules`)
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
      .post(`/api/households/${household.householdId}/tasks/${household.taskId}/schedules`)
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
      .post(`/api/households/${household.householdId}/tasks/${household.taskId}/schedules`)
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
      .post(`/api/households/${household.householdId}/tasks`)
      .set(auth("owner@example.com"))
      .send({
        task: { title: "Clean bathrooms", type: "chore", libraryState: "saved", source: "manual" },
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

  it("orders mixed timed and flexible occurrences by local eligibility date and planned time", async () => {
    const { app, links } = createScheduleTestApp();
    const household = await prepareHousehold(app, links);

    await request(app)
      .put(`/api/households/${household.householdId}/settings`)
      .set(auth("owner@example.com"))
      .send({ timeZone: "America/Los_Angeles" })
      .expect(200);

    await request(app)
      .post(`/api/households/${household.householdId}/tasks`)
      .set(auth("owner@example.com"))
      .send({
        task: { title: "Mixed ordering", type: "chore", libraryState: "saved", source: "manual" },
        schedules: [
          {
            planningMode: "flexible",
            recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
            startsOn: "2026-03-07",
            estimatedMinutes: 45,
            flexibleWindowRule: "once_within_selected_days",
            assignment: { mode: "fixed", memberUserIds: [household.memberId] }
          },
          {
            planningMode: "timed",
            recurrence: { frequency: "daily", interval: 1 },
            localStartTime: "00:30",
            localEndTime: "01:00",
            startsOn: "2026-03-08",
            assignment: { mode: "fixed", memberUserIds: [household.memberId] }
          },
          {
            planningMode: "timed",
            recurrence: { frequency: "daily", interval: 1 },
            localStartTime: "23:30",
            localEndTime: "23:45",
            startsOn: "2026-03-07",
            assignment: { mode: "fixed", memberUserIds: [household.memberId] }
          }
        ]
      })
      .expect(201);

    await request(app)
      .get(`/api/households/${household.householdId}/occurrences`)
      .query({
        startAt: "2026-03-07T00:00:00.000Z",
        endAt: "2026-03-09T23:59:59.999Z",
        startOn: "2026-03-07",
        endOn: "2026-03-09"
      })
      .set(auth("owner@example.com"))
      .expect(200)
      .expect((response) => {
        const mixed = response.body.filter((occurrence: { taskId: string }) => occurrence.taskId !== household.taskId);
        expect(mixed.map((occurrence: { planningMode: string; eligibleStartOn: string; plannedStartAt?: string }) => ({
          planningMode: occurrence.planningMode,
          eligibleStartOn: occurrence.eligibleStartOn,
          plannedStartAt: occurrence.plannedStartAt
        }))).toEqual([
          {
            planningMode: "timed",
            eligibleStartOn: "2026-03-07",
            plannedStartAt: "2026-03-08T07:30:00.000Z"
          },
          {
            planningMode: "flexible",
            eligibleStartOn: "2026-03-07",
            plannedStartAt: undefined
          },
          {
            planningMode: "timed",
            eligibleStartOn: "2026-03-08",
            plannedStartAt: "2026-03-08T08:30:00.000Z"
          },
          {
            planningMode: "timed",
            eligibleStartOn: "2026-03-08",
            plannedStartAt: "2026-03-09T06:30:00.000Z"
          },
          {
            planningMode: "timed",
            eligibleStartOn: "2026-03-09",
            plannedStartAt: "2026-03-09T07:30:00.000Z"
          }
        ]);
      });
  });

  it("replaces untouched future flexible occurrences after schedule edits while preserving skipped rows", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    try {
      const { app, links } = createScheduleTestApp();
      const household = await prepareHousehold(app, links);
      const created = await request(app)
        .post(`/api/households/${household.householdId}/tasks`)
        .set(auth("owner@example.com"))
        .send({
          task: { title: "Flexible cleanup", type: "chore", libraryState: "saved", source: "manual" },
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

      const initial = await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-05-30T00:00:00.000Z",
          endAt: "2026-06-14T23:59:59.999Z",
          startOn: "2026-05-30",
          endOn: "2026-06-14"
        })
        .set(auth("owner@example.com"))
        .expect(200);
      const flexible = initial.body.filter((occurrence: { scheduleId: string }) => occurrence.scheduleId === scheduleId);

      const completed = await request(app)
        .post(`/api/households/${household.householdId}/occurrences/${flexible[0].id}/complete`)
        .set(auth("member@example.com"))
        .expect(200);

      const skipped = await request(app)
        .post(`/api/households/${household.householdId}/occurrences/${flexible[1].id}/skip`)
        .set(auth("owner@example.com"))
        .expect(200);

      await request(app)
        .put(`/api/households/${household.householdId}/schedules/${scheduleId}`)
        .set(auth("owner@example.com"))
        .send({
          planningMode: "flexible",
          recurrence: { frequency: "weekly", interval: 1, weekDays: [6, 0] },
          startsOn: "2026-05-30",
          estimatedMinutes: 45,
          flexibleWindowRule: "once_within_selected_days",
          assignment: { mode: "fixed", memberUserIds: [household.ownerId] }
        })
        .expect(200);

      await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-05-30T00:00:00.000Z",
          endAt: "2026-06-14T23:59:59.999Z",
          startOn: "2026-05-30",
          endOn: "2026-06-14"
        })
        .set(auth("owner@example.com"))
        .expect(200)
        .expect((response) => {
          const updatedFlexible = response.body.filter((occurrence: { scheduleId: string }) => occurrence.scheduleId === scheduleId);
          expect(updatedFlexible).toEqual([
            expect.objectContaining({
              id: completed.body.id,
              eligibleStartOn: "2026-05-30",
              eligibleEndOn: "2026-05-31",
              estimatedMinutes: 60,
              assignedUserId: household.memberId,
              exceptionType: "none",
              status: "completed",
              completedByUserId: household.memberId
            }),
            expect.objectContaining({
              id: skipped.body.id,
              eligibleStartOn: "2026-06-06",
              eligibleEndOn: "2026-06-07",
              estimatedMinutes: 60,
              assignedUserId: household.memberId,
              exceptionType: "skipped",
              status: "skipped"
            }),
            expect.objectContaining({
              eligibleStartOn: "2026-06-13",
              eligibleEndOn: "2026-06-14",
              estimatedMinutes: 45,
              assignedUserId: household.ownerId,
              exceptionType: "none"
            })
          ]);
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists regenerated future work when preserved completed history reuses the next sequence", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));

    try {
      const { app, links } = createScheduleTestApp();
      const household = await prepareHousehold(app, links);
      const created = await request(app)
        .post(`/api/households/${household.householdId}/tasks`)
        .set(auth("owner@example.com"))
        .send({
          task: { title: "Regenerated future", type: "chore", libraryState: "saved", source: "manual" },
          schedules: [{
            planningMode: "timed",
            recurrence: { frequency: "daily", interval: 1 },
            localStartTime: "09:00",
            localEndTime: "09:30",
            startsOn: "2026-06-01",
            assignment: { mode: "fixed", memberUserIds: [household.memberId] }
          }]
        })
        .expect(201);
      const scheduleId = created.body.schedules[0].id as string;

      const initial = await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-06-03T23:59:59.999Z",
          startOn: "2026-06-01",
          endOn: "2026-06-03"
        })
        .set(auth("owner@example.com"))
        .expect(200);
      const scheduleRows = initial.body.filter((occurrence: { scheduleId: string }) => occurrence.scheduleId === scheduleId);

      const completed = await request(app)
        .post(`/api/households/${household.householdId}/occurrences/${scheduleRows[0].id}/complete`)
        .set(auth("member@example.com"))
        .expect(200);
      await request(app)
        .put(`/api/households/${household.householdId}/schedules/${scheduleId}`)
        .set(auth("owner@example.com"))
        .send({
          planningMode: "flexible",
          recurrence: { frequency: "weekly", interval: 1, weekDays: [3, 4] },
          startsOn: "2026-06-03",
          estimatedMinutes: 20,
          flexibleWindowRule: "once_within_selected_days",
          assignment: { mode: "fixed", memberUserIds: [household.ownerId] }
        })
        .expect(200);

      await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-06-05T23:59:59.999Z",
          startOn: "2026-06-01",
          endOn: "2026-06-05"
        })
        .set(auth("owner@example.com"))
        .expect(200)
        .expect((response) => {
          const updatedRows = response.body.filter((occurrence: { scheduleId: string }) => occurrence.scheduleId === scheduleId);
          expect(updatedRows).toEqual([
            expect.objectContaining({
              id: completed.body.id,
              planningMode: "timed",
              eligibleStartOn: "2026-06-01",
              sequence: 0,
              status: "completed",
              completedByUserId: household.memberId
            }),
            expect.objectContaining({
              planningMode: "flexible",
              eligibleStartOn: "2026-06-03",
              eligibleEndOn: "2026-06-04",
              sequence: 0,
              status: "planned",
              assignedUserId: household.ownerId
            })
          ]);
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists regenerated future work when preserved skipped history has the same eligible window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-31T12:00:00.000Z"));

    try {
      const { app, links } = createScheduleTestApp();
      const household = await prepareHousehold(app, links);
      const created = await request(app)
        .post(`/api/households/${household.householdId}/tasks`)
        .set(auth("owner@example.com"))
        .send({
          task: { title: "Same window regeneration", type: "chore", libraryState: "saved", source: "manual" },
          schedules: [{
            planningMode: "flexible",
            recurrence: { frequency: "weekly", interval: 1, weekDays: [1, 2] },
            startsOn: "2026-05-25",
            estimatedMinutes: 60,
            flexibleWindowRule: "once_within_selected_days",
            assignment: { mode: "fixed", memberUserIds: [household.memberId] }
          }]
        })
        .expect(201);
      const scheduleId = created.body.schedules[0].id as string;

      const initial = await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-06-02T23:59:59.999Z",
          startOn: "2026-06-01",
          endOn: "2026-06-02"
        })
        .set(auth("owner@example.com"))
        .expect(200);
      const skipped = await request(app)
        .post(`/api/households/${household.householdId}/occurrences/${initial.body.find((occurrence: { scheduleId: string }) => occurrence.scheduleId === scheduleId).id}/skip`)
        .set(auth("owner@example.com"))
        .expect(200);

      await request(app)
        .put(`/api/households/${household.householdId}/schedules/${scheduleId}`)
        .set(auth("owner@example.com"))
        .send({
          planningMode: "flexible",
          recurrence: { frequency: "weekly", interval: 1, weekDays: [1, 2] },
          startsOn: "2026-06-01",
          estimatedMinutes: 20,
          flexibleWindowRule: "once_within_selected_days",
          assignment: { mode: "fixed", memberUserIds: [household.ownerId] }
        })
        .expect(200);

      await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-06-02T23:59:59.999Z",
          startOn: "2026-06-01",
          endOn: "2026-06-02"
        })
        .set(auth("owner@example.com"))
        .expect(200)
        .expect((response) => {
          const rows = response.body.filter((occurrence: { scheduleId: string }) => occurrence.scheduleId === scheduleId);
          expect(rows).toEqual([
            expect.objectContaining({
              eligibleStartOn: "2026-06-01",
              eligibleEndOn: "2026-06-02",
              sequence: 0,
              status: "planned",
              estimatedMinutes: 20,
              assignedUserId: household.ownerId
            }),
            expect.objectContaining({
              id: skipped.body.id,
              eligibleStartOn: "2026-06-01",
              eligibleEndOn: "2026-06-02",
              sequence: 1,
              status: "skipped",
              estimatedMinutes: 60,
              assignedUserId: household.memberId
            })
          ]);
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces untouched future timed occurrences when a schedule changes to flexible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    try {
      const { app, links } = createScheduleTestApp();
      const household = await prepareHousehold(app, links);
      const created = await request(app)
        .post(`/api/households/${household.householdId}/tasks`)
        .set(auth("owner@example.com"))
        .send({
          task: { title: "Mode switch cleanup", type: "chore", libraryState: "saved", source: "manual" },
          schedules: [{
            planningMode: "timed",
            recurrence: { frequency: "daily", interval: 1 },
            localStartTime: "15:00",
            localEndTime: "15:30",
            startsOn: "2026-06-01",
            assignment: { mode: "fixed", memberUserIds: [household.memberId] }
          }]
        })
        .expect(201);
      const scheduleId = created.body.schedules[0].id as string;

      await request(app)
        .put(`/api/households/${household.householdId}/schedules/${scheduleId}`)
        .set(auth("owner@example.com"))
        .send({
          planningMode: "flexible",
          recurrence: { frequency: "daily", interval: 1 },
          startsOn: "2026-06-01",
          estimatedMinutes: 20,
          flexibleWindowRule: "each_selected_day",
          assignment: { mode: "fixed", memberUserIds: [household.ownerId] }
        })
        .expect(200);

      await request(app)
        .get(`/api/households/${household.householdId}/occurrences`)
        .query({
          startAt: "2026-06-01T00:00:00.000Z",
          endAt: "2026-06-03T23:59:59.999Z",
          startOn: "2026-06-01",
          endOn: "2026-06-03"
        })
        .set(auth("owner@example.com"))
        .expect(200)
        .expect((response) => {
          const modeSwitchRows = response.body.filter((occurrence: { scheduleId: string }) => occurrence.scheduleId === scheduleId);
          expect(modeSwitchRows.map((occurrence: {
            planningMode: string;
            eligibleStartOn: string;
            plannedStartAt?: string;
            estimatedMinutes: number;
            assignedUserId: string;
          }) => ({
            planningMode: occurrence.planningMode,
            eligibleStartOn: occurrence.eligibleStartOn,
            plannedStartAt: occurrence.plannedStartAt,
            estimatedMinutes: occurrence.estimatedMinutes,
            assignedUserId: occurrence.assignedUserId
          }))).toEqual([
            {
              planningMode: "flexible",
              eligibleStartOn: "2026-06-01",
              plannedStartAt: undefined,
              estimatedMinutes: 20,
              assignedUserId: household.ownerId
            },
            {
              planningMode: "flexible",
              eligibleStartOn: "2026-06-02",
              plannedStartAt: undefined,
              estimatedMinutes: 20,
              assignedUserId: household.ownerId
            },
            {
              planningMode: "flexible",
              eligibleStartOn: "2026-06-03",
              plannedStartAt: undefined,
              estimatedMinutes: 20,
              assignedUserId: household.ownerId
            }
          ]);
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records occurrence exceptions and regenerates only untouched future occurrences", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-25T12:00:00.000Z"));

    try {
      const { app, links } = createScheduleTestApp();
      const household = await prepareHousehold(app, links);
      const schedule = await request(app)
        .post(`/api/households/${household.householdId}/tasks/${household.taskId}/schedules`)
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
      .post(`/api/households/${household.householdId}/tasks/${household.taskId}/schedules`)
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


