import type { PrismaClient } from "@prisma/client";
import type {
  Chore,
  ChoreCompletionCheckIn,
  ChoreOccurrence,
  ChoreSchedule,
  Household,
  HouseholdFloor,
  HouseholdInvitation,
  HouseholdMemberSummary,
  HouseholdProfile,
  HouseholdRoom,
  Recommendation,
  RecommendationConfidence,
  RecommendationDecision
} from "@chore-helper/shared";
import type { AppUser, CompletionCheckInCreate, HouseholdStore, OccurrenceClearFutureCutoff } from "./inMemoryStore.js";

function serializeOptionalList<T>(values: T[]) {
  return JSON.stringify(values);
}

function deserializeOptionalList<T>(value: string) {
  return JSON.parse(value) as T[];
}

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : undefined;
}

function toHousehold(
  household: {
    id: string;
    name: string;
    timeZone: string;
    profile?: {
      homeType: string;
      hasPets: boolean;
      hasOutdoorSpace: boolean;
      notes: string | null;
    } | null;
  }
): Household {
  const profile = household.profile
    ? {
        homeType: household.profile.homeType as HouseholdProfile["homeType"],
        hasPets: household.profile.hasPets,
        hasOutdoorSpace: household.profile.hasOutdoorSpace,
        notes: household.profile.notes ?? undefined
      }
    : undefined;

  return {
    id: household.id,
    name: household.name,
    timeZone: household.timeZone,
    ...(profile ? { profile } : {})
  };
}

function toAppUser(user: { id: string; clerkUserId: string; primaryEmail?: string | null; displayName?: string | null }): AppUser {
  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    primaryEmail: user.primaryEmail ?? undefined,
    displayName: user.displayName ?? undefined
  };
}

function toInvitation(invitation: {
  id: string;
  householdId: string;
  recipientEmail: string;
  role: string;
  invitedByUserId: string;
  expiresAt: Date;
  acceptedAt?: Date | null;
  acceptedByUserId?: string | null;
  cancelledAt?: Date | null;
  createdAt: Date;
}): HouseholdInvitation {
  const status: HouseholdInvitation["status"] = invitation.cancelledAt
    ? "cancelled"
    : invitation.acceptedAt
      ? "accepted"
      : invitation.expiresAt.getTime() <= Date.now()
        ? "expired"
        : "pending";

  return {
    id: invitation.id,
    householdId: invitation.householdId,
    recipientEmail: invitation.recipientEmail,
    role: invitation.role as "member",
    status,
    invitedByUserId: invitation.invitedByUserId,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: serializeDate(invitation.acceptedAt),
    acceptedByUserId: invitation.acceptedByUserId ?? undefined,
    cancelledAt: serializeDate(invitation.cancelledAt),
    createdAt: invitation.createdAt.toISOString()
  };
}

function toHouseholdRoom(room: {
  id: string;
  name: string;
  flooring: string;
  petImpact: string;
  robotVacuumCoverage: string;
  robotMopCoverage: string;
  notes?: string | null;
}, floorId: string): HouseholdRoom {
  return {
    id: room.id,
    floorId,
    name: room.name,
    flooring: deserializeOptionalList(room.flooring),
    petImpact: room.petImpact as HouseholdRoom["petImpact"],
    robotVacuumCoverage: room.robotVacuumCoverage as HouseholdRoom["robotVacuumCoverage"],
    robotMopCoverage: room.robotMopCoverage as HouseholdRoom["robotMopCoverage"],
    notes: room.notes ?? undefined
  };
}

function toHouseholdFloor(floor: {
  id: string;
  householdId: string;
  name: string;
  levelType: string;
  flooring: string;
  petImpact: string;
  robotVacuumCoverage: string;
  robotMopCoverage: string;
  notes?: string | null;
  rooms: Array<{
    id: string;
    name: string;
    flooring: string;
    petImpact: string;
    robotVacuumCoverage: string;
    robotMopCoverage: string;
    notes?: string | null;
  }>;
}): HouseholdFloor {
  return {
    id: floor.id,
    householdId: floor.householdId,
    name: floor.name,
    levelType: floor.levelType as HouseholdFloor["levelType"],
    flooring: deserializeOptionalList(floor.flooring),
    petImpact: floor.petImpact as HouseholdFloor["petImpact"],
    robotVacuumCoverage: floor.robotVacuumCoverage as HouseholdFloor["robotVacuumCoverage"],
    robotMopCoverage: floor.robotMopCoverage as HouseholdFloor["robotMopCoverage"],
    notes: floor.notes ?? undefined,
    rooms: floor.rooms.map((room) => toHouseholdRoom(room, floor.id))
  };
}

function toChore(chore: {
  id: string;
  householdId: string;
  household?: { name: string } | null;
  title: string;
  source: string;
  instructions?: string | null;
  tags?: string;
  archivedAt?: Date | null;
}): Chore {
  const tags = chore.tags ? deserializeOptionalList<string>(chore.tags) : [];
  return {
    id: chore.id,
    householdId: chore.householdId,
    householdName: chore.household?.name,
    title: chore.title,
    source: chore.source as Chore["source"],
    ...(chore.instructions ? { instructions: chore.instructions } : {}),
    ...(tags.length ? { tags } : {}),
    archivedAt: serializeDate(chore.archivedAt)
  };
}

function toSchedule(schedule: {
  id: string;
  householdId: string;
  choreId: string;
  planningMode: string;
  frequency: string;
  interval: number;
  weekDays: string;
  monthlyPattern?: string | null;
  monthlyDay?: number | null;
  monthlyWeek?: number | null;
  monthlyWeekday?: number | null;
  localStartTime?: string | null;
  localEndTime?: string | null;
  estimatedMinutes?: number | null;
  flexibleWindowRule?: string | null;
  startsOn: string;
  endsOn?: string | null;
  assignmentMode: string;
  archivedAt?: Date | null;
  assignees: Array<{ userId: string; position: number }>;
}): ChoreSchedule {
  const weekDays = deserializeOptionalList<number>(schedule.weekDays);
  const base = {
    id: schedule.id,
    householdId: schedule.householdId,
    choreId: schedule.choreId,
    recurrence: {
      frequency: schedule.frequency as ChoreSchedule["recurrence"]["frequency"],
      interval: schedule.interval,
      ...(weekDays.length ? { weekDays } : {}),
      ...(schedule.monthlyPattern ? { monthlyPattern: schedule.monthlyPattern as ChoreSchedule["recurrence"]["monthlyPattern"] } : {}),
      ...(schedule.monthlyDay ? { monthlyDay: schedule.monthlyDay } : {}),
      ...(schedule.monthlyWeek ? { monthlyWeek: schedule.monthlyWeek } : {}),
      ...(schedule.monthlyWeekday !== null && schedule.monthlyWeekday !== undefined ? { monthlyWeekday: schedule.monthlyWeekday } : {})
    },
    startsOn: schedule.startsOn,
    ...(schedule.endsOn ? { endsOn: schedule.endsOn } : {}),
    assignment: {
      mode: schedule.assignmentMode as ChoreSchedule["assignment"]["mode"],
      memberUserIds: schedule.assignees
        .sort((first, second) => first.position - second.position)
        .map((assignee) => assignee.userId)
    },
    archivedAt: serializeDate(schedule.archivedAt)
  };

  return schedule.planningMode === "timed"
    ? {
        ...base,
        planningMode: "timed",
        localStartTime: schedule.localStartTime!,
        localEndTime: schedule.localEndTime!
      }
    : {
        ...base,
        planningMode: "flexible",
        estimatedMinutes: schedule.estimatedMinutes!,
        flexibleWindowRule: schedule.flexibleWindowRule as "once_within_selected_days" | "each_selected_day"
      };
}

function toOccurrence(occurrence: {
  id: string;
  householdId: string;
  choreId: string;
  scheduleId: string;
  sequence: number;
  planningMode: string;
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  estimatedMinutes: number;
  eligibleStartOn: string;
  eligibleEndOn: string;
  assignedUserId: string;
  exceptionType: string;
  status: string;
  completedAt?: Date | null;
  completedByUserId?: string | null;
}): ChoreOccurrence {
  return {
    id: occurrence.id,
    householdId: occurrence.householdId,
    choreId: occurrence.choreId,
    scheduleId: occurrence.scheduleId,
    sequence: occurrence.sequence,
    planningMode: occurrence.planningMode as ChoreOccurrence["planningMode"],
    plannedStartAt: serializeDate(occurrence.plannedStartAt),
    plannedEndAt: serializeDate(occurrence.plannedEndAt),
    estimatedMinutes: occurrence.estimatedMinutes,
    eligibleStartOn: occurrence.eligibleStartOn,
    eligibleEndOn: occurrence.eligibleEndOn,
    assignedUserId: occurrence.assignedUserId,
    exceptionType: occurrence.exceptionType as ChoreOccurrence["exceptionType"],
    status: occurrence.status as ChoreOccurrence["status"],
    completedAt: serializeDate(occurrence.completedAt),
    completedByUserId: occurrence.completedByUserId ?? undefined
  };
}

function toCompletionCheckIn(checkIn: {
  id: string;
  householdId: string;
  occurrenceId: string;
  completedByUserId: string;
  completedAt: Date;
  completedOnTime: boolean;
  durationAccurate: boolean;
  keepAssignee: boolean;
  rebaseFutureOccurrences: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ChoreCompletionCheckIn {
  return {
    id: checkIn.id,
    householdId: checkIn.householdId,
    occurrenceId: checkIn.occurrenceId,
    completedByUserId: checkIn.completedByUserId,
    completedAt: checkIn.completedAt.toISOString(),
    completedOnTime: checkIn.completedOnTime,
    durationAccurate: checkIn.durationAccurate,
    keepAssignee: checkIn.keepAssignee,
    rebaseFutureOccurrences: checkIn.rebaseFutureOccurrences,
    createdAt: checkIn.createdAt.toISOString(),
    updatedAt: checkIn.updatedAt.toISOString()
  };
}

async function completionCheckInRelations(
  prisma: PrismaClient,
  input: CompletionCheckInCreate
) {
  const occurrence = await prisma.choreOccurrence.findFirst({
    where: {
      id: input.occurrenceId,
      householdId: input.householdId,
      completedByUserId: input.completedByUserId,
      status: "completed"
    },
    select: {
      choreId: true,
      scheduleId: true
    }
  });
  if (!occurrence) return undefined;

  return occurrence;
}

function toRecommendation(recommendation: {
  id: string;
  householdId: string;
  affectedChoreId?: string | null;
  title: string;
  rationale: string;
  confidence: string;
  status: string;
  decision?: string | null;
  proposedCadence?: string | null;
  proposedEstimatedMinutes?: number | null;
  staleAt?: Date | null;
}): Recommendation {
  return {
    id: recommendation.id,
    householdId: recommendation.householdId,
    affectedChoreId: recommendation.affectedChoreId ?? undefined,
    title: recommendation.title,
    rationale: recommendation.rationale,
    confidence: recommendation.confidence as RecommendationConfidence,
    status: recommendation.status as Recommendation["status"],
    decision: (recommendation.decision ?? "pending") as RecommendationDecision,
    proposedCadence: recommendation.proposedCadence ?? undefined,
    proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes ?? undefined,
    staleAt: serializeDate(recommendation.staleAt)
  };
}

export function createPrismaStore(prisma: PrismaClient): HouseholdStore {
  return {
    async upsertUserByClerkId(clerkUserId, profile = {}) {
      const user = await prisma.user.upsert({
        where: { clerkUserId },
        create: { clerkUserId, ...profile },
        update: profile
      });

      return toAppUser(user);
    },

    async getUserByClerkId(clerkUserId) {
      const user = await prisma.user.findUnique({
        where: { clerkUserId }
      });

      return user ? toAppUser(user) : undefined;
    },

    async userHasHouseholdAccess(userId, householdId) {
      const membershipCount = await prisma.householdMember.count({
        where: {
          userId,
          householdId
        }
      });

      return membershipCount > 0;
    },

    async getMembership(userId, householdId) {
      const membership = await prisma.householdMember.findUnique({
        where: {
          householdId_userId: {
            householdId,
            userId
          }
        }
      });

      return membership
        ? {
            householdId: membership.householdId,
            userId: membership.userId,
            role: membership.role as "owner" | "member"
          }
        : undefined;
    },

    async listHouseholdMembers(householdId) {
      const memberships = await prisma.householdMember.findMany({
        where: { householdId },
        include: { user: true },
        orderBy: { createdAt: "asc" }
      });

      return memberships.map((membership): HouseholdMemberSummary => ({
        householdId: membership.householdId,
        userId: membership.userId,
        clerkUserId: membership.user.clerkUserId,
        primaryEmail: membership.user.primaryEmail ?? undefined,
        displayName: membership.user.displayName ?? undefined,
        role: membership.role as "owner" | "member"
      }));
    },

    async updateMemberRole(householdId, userId, role) {
      return prisma.$transaction(async (tx) => {
        const membership = await tx.householdMember.findUnique({
          where: { householdId_userId: { householdId, userId } }
        });
        if (!membership) return { outcome: "not_found" as const };

        if (membership.role === "owner" && role === "member") {
          const ownerCount = await tx.householdMember.count({
            where: { householdId, role: "owner" }
          });
          if (ownerCount <= 1) return { outcome: "last_owner" as const };
        }

        const updated = await tx.householdMember.update({
          where: { householdId_userId: { householdId, userId } },
          data: { role }
        });

        return {
          outcome: "updated" as const,
          membership: {
            householdId: updated.householdId,
            userId: updated.userId,
            role: updated.role as "owner" | "member"
          }
        };
      }, { isolationLevel: "Serializable" });
    },

    async removeMember(householdId, userId) {
      return prisma.$transaction(async (tx) => {
        const membership = await tx.householdMember.findUnique({
          where: { householdId_userId: { householdId, userId } }
        });
        if (!membership) return { outcome: "not_found" as const };

        if (membership.role === "owner") {
          const ownerCount = await tx.householdMember.count({
            where: { householdId, role: "owner" }
          });
          if (ownerCount <= 1) return { outcome: "last_owner" as const };
        }

        const removed = await tx.householdMember.delete({
          where: { householdId_userId: { householdId, userId } }
        });

        return {
          outcome: "updated" as const,
          membership: {
            householdId: removed.householdId,
            userId: removed.userId,
            role: removed.role as "owner" | "member"
          }
        };
      }, { isolationLevel: "Serializable" });
    },

    async createInvitation(invitation) {
      const created = await prisma.householdInvitation.create({
        data: {
          householdId: invitation.householdId,
          recipientEmail: invitation.recipientEmail,
          tokenDigest: invitation.tokenDigest,
          invitedByUserId: invitation.invitedByUserId,
          expiresAt: new Date(invitation.expiresAt)
        }
      });

      return toInvitation(created);
    },

    async listInvitations(householdId) {
      const invitations = await prisma.householdInvitation.findMany({
        where: { householdId },
        orderBy: { createdAt: "desc" }
      });

      return invitations.map(toInvitation);
    },

    async cancelInvitation(householdId, invitationId, cancelledAt) {
      const invitation = await prisma.householdInvitation.findFirst({
        where: { id: invitationId, householdId }
      });
      if (!invitation || invitation.acceptedAt || invitation.cancelledAt) return undefined;

      const updated = await prisma.householdInvitation.update({
        where: { id: invitationId },
        data: { cancelledAt: new Date(cancelledAt) }
      });

      return toInvitation(updated);
    },

    async findInvitationByTokenDigest(tokenDigest) {
      const invitation = await prisma.householdInvitation.findUnique({
        where: { tokenDigest }
      });
      if (!invitation) return undefined;

      return {
        ...toInvitation(invitation),
        tokenDigest: invitation.tokenDigest
      };
    },

    async acceptInvitation(invitationId, userId, acceptedAt) {
      const invitation = await prisma.householdInvitation.findUnique({
        where: { id: invitationId }
      });
      if (!invitation || invitation.acceptedAt || invitation.cancelledAt) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextInvitation = await tx.householdInvitation.update({
          where: { id: invitationId },
          data: {
            acceptedAt: new Date(acceptedAt),
            acceptedByUserId: userId
          }
        });
        await tx.householdMember.upsert({
          where: { householdId_userId: { householdId: invitation.householdId, userId } },
          create: { householdId: invitation.householdId, userId, role: "member" },
          update: {}
        });
        return nextInvitation;
      });

      return toInvitation(updated);
    },

    async listHouseholdsForUser(userId) {
      const households = await prisma.household.findMany({
        where: {
          members: {
            some: { userId }
          }
        },
        include: { profile: true },
        orderBy: { createdAt: "asc" }
      });

      return households.map(toHousehold);
    },

    async createHouseholdForUser(name, userId) {
      const household = await prisma.$transaction(async (tx) => {
        return tx.household.create({
          data: {
            id: crypto.randomUUID(),
            name,
            members: {
              create: {
                userId,
                role: "owner"
              }
            }
          },
          include: { profile: true }
        });
      });

      return toHousehold(household);
    },

    async createHousehold(name) {
      const household = await prisma.household.create({
        data: {
          id: crypto.randomUUID(),
          name
        },
        include: { profile: true }
      });

      return toHousehold(household);
    },

    async listHouseholds() {
      const households = await prisma.household.findMany({
        include: { profile: true },
        orderBy: { createdAt: "asc" }
      });

      return households.map(toHousehold);
    },

    async updateProfile(householdId, update) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      const updated = await prisma.household.update({
        where: { id: householdId },
        data: {
          name: update.name,
          profile: {
            upsert: {
              create: {
                homeType: update.profile.homeType,
                hasPets: update.profile.hasPets,
                hasOutdoorSpace: update.profile.hasOutdoorSpace,
                notes: update.profile.notes
              },
              update: {
                homeType: update.profile.homeType,
                hasPets: update.profile.hasPets,
                hasOutdoorSpace: update.profile.hasOutdoorSpace,
                notes: update.profile.notes
              }
            }
          }
        },
        include: { profile: true }
      });

      return toHousehold(updated);
    },

    async updateHouseholdSettings(householdId, update) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      const updated = await prisma.household.update({
        where: { id: householdId },
        data: { timeZone: update.timeZone },
        include: { profile: true }
      });

      return toHousehold(updated);
    },

    async getHousehold(householdId) {
      const household = await prisma.household.findUnique({
        where: { id: householdId },
        include: { profile: true }
      });

      return household ? toHousehold(household) : undefined;
    },

    async getHouseholdStructure(householdId) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      const floors = await prisma.householdFloor.findMany({
        where: { householdId },
        include: { rooms: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" }
      });

      return {
        householdId,
        floors: floors.map(toHouseholdFloor)
      };
    },

    async saveHouseholdStructure(householdId, floors) {
      const household = await prisma.household.findUnique({
        where: { id: householdId }
      });
      if (!household) return undefined;

      await prisma.$transaction(async (tx) => {
        await tx.householdFloor.deleteMany({ where: { householdId } });

        for (const [floorIndex, floor] of floors.entries()) {
          await tx.householdFloor.create({
            data: {
              id: floor.id,
              householdId,
              name: floor.name,
              levelType: floor.levelType,
              flooring: serializeOptionalList(floor.flooring),
              petImpact: floor.petImpact,
              robotVacuumCoverage: floor.robotVacuumCoverage,
              robotMopCoverage: floor.robotMopCoverage,
              notes: floor.notes,
              sortOrder: floorIndex,
              rooms: {
                create: floor.rooms.map((room, roomIndex) => ({
                  id: room.id,
                  name: room.name,
                  flooring: serializeOptionalList(room.flooring),
                  petImpact: room.petImpact,
                  robotVacuumCoverage: room.robotVacuumCoverage,
                  robotMopCoverage: room.robotMopCoverage,
                  notes: room.notes,
                  sortOrder: roomIndex
                }))
              }
            }
          });
        }
      });

      return this.getHouseholdStructure(householdId);
    },

    async createChoreWithSchedules({ householdId, chore, schedules }) {
      const created = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.create({
          data: {
            id: crypto.randomUUID(),
            householdId,
            title: chore.title,
            source: chore.source,
            instructions: chore.instructions,
            tags: serializeOptionalList(chore.tags ?? []),
            schedules: {
              create: schedules.map((schedule) => ({
                household: { connect: { id: householdId } },
                planningMode: schedule.planningMode,
                frequency: schedule.recurrence.frequency,
                interval: schedule.recurrence.interval,
                weekDays: serializeOptionalList(schedule.recurrence.weekDays ?? []),
                monthlyPattern: schedule.recurrence.monthlyPattern,
                monthlyDay: schedule.recurrence.monthlyDay,
                monthlyWeek: schedule.recurrence.monthlyWeek,
                monthlyWeekday: schedule.recurrence.monthlyWeekday,
                localStartTime: schedule.planningMode === "timed" ? schedule.localStartTime : null,
                localEndTime: schedule.planningMode === "timed" ? schedule.localEndTime : null,
                estimatedMinutes: schedule.planningMode === "flexible" ? schedule.estimatedMinutes : null,
                flexibleWindowRule: schedule.planningMode === "flexible" ? schedule.flexibleWindowRule : null,
                startsOn: schedule.startsOn,
                endsOn: schedule.endsOn,
                assignmentMode: schedule.assignment.mode,
                assignees: {
                  create: schedule.assignment.memberUserIds.map((userId, position) => ({ userId, position }))
                }
              }))
            }
          },
          include: { schedules: { include: { assignees: true } } }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return {
        chore: toChore(created),
        schedules: created.schedules.map(toSchedule)
      };
    },

    async updateChore(householdId, choreId, chore) {
      const existing = await prisma.chore.findFirst({
        where: { id: choreId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.update({
          where: { id: choreId },
          data: {
            title: chore.title,
            source: chore.source,
            instructions: chore.instructions,
            tags: serializeOptionalList(chore.tags ?? [])
          }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(updated);
    },

    async archiveChore(householdId, choreId) {
      const existing = await prisma.chore.findFirst({
        where: { id: choreId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.update({
          where: { id: choreId },
          data: { archivedAt: new Date() }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(updated);
    },

    async restoreChore(householdId, choreId) {
      const existing = await prisma.chore.findFirst({
        where: { id: choreId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextChore = await tx.chore.update({
          where: { id: choreId },
          data: { archivedAt: null }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextChore;
      });

      return toChore(updated);
    },

    async listChores(householdId, options = {}) {
      const chores = await prisma.chore.findMany({
        where: options.archivedOnly
          ? { householdId, archivedAt: { not: null } }
          : options.includeArchived
            ? { householdId }
            : { householdId, archivedAt: null },
        orderBy: { createdAt: "asc" }
      });

      return chores.map(toChore);
    },

    async listAllChores(options = {}) {
      const chores = await prisma.chore.findMany({
        where: options.archivedOnly
          ? { archivedAt: { not: null } }
          : options.includeArchived
            ? {}
            : { archivedAt: null },
        include: {
          household: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: "asc" }
      });

      return chores.map(toChore);
    },

    async createSchedule(schedule) {
      const created = await prisma.choreSchedule.create({
        data: {
          householdId: schedule.householdId,
          choreId: schedule.choreId,
          planningMode: schedule.planningMode,
          frequency: schedule.recurrence.frequency,
          interval: schedule.recurrence.interval,
          weekDays: serializeOptionalList(schedule.recurrence.weekDays ?? []),
          monthlyPattern: schedule.recurrence.monthlyPattern,
          monthlyDay: schedule.recurrence.monthlyDay,
          monthlyWeek: schedule.recurrence.monthlyWeek,
          monthlyWeekday: schedule.recurrence.monthlyWeekday,
          localStartTime: schedule.planningMode === "timed" ? schedule.localStartTime : null,
          localEndTime: schedule.planningMode === "timed" ? schedule.localEndTime : null,
          estimatedMinutes: schedule.planningMode === "flexible" ? schedule.estimatedMinutes : null,
          flexibleWindowRule: schedule.planningMode === "flexible" ? schedule.flexibleWindowRule : null,
          startsOn: schedule.startsOn,
          endsOn: schedule.endsOn,
          assignmentMode: schedule.assignment.mode,
          assignees: {
            create: schedule.assignment.memberUserIds.map((userId, position) => ({ userId, position }))
          }
        },
        include: { assignees: true }
      });

      return toSchedule(created);
    },

    async listSchedules(householdId, choreId) {
      const schedules = await prisma.choreSchedule.findMany({
        where: {
          householdId,
          archivedAt: null,
          ...(choreId ? { choreId } : {})
        },
        include: { assignees: true },
        orderBy: { createdAt: "asc" }
      });

      return schedules.map(toSchedule);
    },

    async updateSchedule(householdId, scheduleId, update) {
      const existing = await prisma.choreSchedule.findFirst({
        where: { id: scheduleId, householdId, archivedAt: null }
      });
      if (!existing) return undefined;

      const updated = await prisma.choreSchedule.update({
        where: { id: scheduleId },
        data: {
          planningMode: update.planningMode,
          frequency: update.recurrence.frequency,
          interval: update.recurrence.interval,
          weekDays: serializeOptionalList(update.recurrence.weekDays ?? []),
          monthlyPattern: update.recurrence.monthlyPattern,
          monthlyDay: update.recurrence.monthlyDay,
          monthlyWeek: update.recurrence.monthlyWeek,
          monthlyWeekday: update.recurrence.monthlyWeekday,
          localStartTime: update.planningMode === "timed" ? update.localStartTime : null,
          localEndTime: update.planningMode === "timed" ? update.localEndTime : null,
          estimatedMinutes: update.planningMode === "flexible" ? update.estimatedMinutes : null,
          flexibleWindowRule: update.planningMode === "flexible" ? update.flexibleWindowRule : null,
          startsOn: update.startsOn,
          endsOn: update.endsOn,
          assignmentMode: update.assignment.mode,
          assignees: {
            deleteMany: {},
            create: update.assignment.memberUserIds.map((userId, position) => ({ userId, position }))
          }
        },
        include: { assignees: true }
      });

      return toSchedule(updated);
    },

    async archiveSchedule(householdId, scheduleId) {
      const existing = await prisma.choreSchedule.findFirst({
        where: { id: scheduleId, householdId, archivedAt: null }
      });
      if (!existing) return undefined;

      const updated = await prisma.choreSchedule.update({
        where: { id: scheduleId },
        data: { archivedAt: new Date() },
        include: { assignees: true }
      });

      return toSchedule(updated);
    },

    async materializeScheduleOccurrences(householdId, scheduleId, occurrences) {
      const storedOccurrences = await Promise.all(
        occurrences.map((occurrence) =>
          prisma.choreOccurrence.upsert({
            where: {
              id: occurrence.id
            },
            update: {},
            create: {
              id: occurrence.id,
              householdId,
              choreId: occurrence.choreId,
              scheduleId,
              sequence: occurrence.sequence,
              planningMode: occurrence.planningMode,
              plannedStartAt: occurrence.plannedStartAt ? new Date(occurrence.plannedStartAt) : null,
              plannedEndAt: occurrence.plannedEndAt ? new Date(occurrence.plannedEndAt) : null,
              estimatedMinutes: occurrence.estimatedMinutes,
              eligibleStartOn: occurrence.eligibleStartOn,
              eligibleEndOn: occurrence.eligibleEndOn,
              assignedUserId: occurrence.assignedUserId,
              exceptionType: occurrence.exceptionType,
              status: occurrence.status,
              completedAt: occurrence.completedAt ? new Date(occurrence.completedAt) : null,
              completedByUserId: occurrence.completedByUserId
            }
          })
        )
      );

      return storedOccurrences.map(toOccurrence);
    },

    async listOccurrences(householdId, range) {
      const occurrences = await prisma.choreOccurrence.findMany({
        where: {
          householdId,
          OR: [
            {
              planningMode: "timed",
              plannedStartAt: {
                gte: new Date(range.startAt),
                lte: new Date(range.endAt)
              }
            },
            {
              planningMode: "flexible",
              eligibleEndOn: { gte: range.startOn },
              eligibleStartOn: { lte: range.endOn }
            }
          ],
          ...(range.assignedUserId ? { assignedUserId: range.assignedUserId } : {})
        },
        orderBy: [
          { eligibleStartOn: "asc" },
          { plannedStartAt: { sort: "asc", nulls: "last" } },
          { sequence: "asc" },
          { id: "asc" }
        ]
      });

      return occurrences.map(toOccurrence);
    },

    async getOccurrence(householdId, occurrenceId) {
      const occurrence = await prisma.choreOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });

      return occurrence ? toOccurrence(occurrence) : undefined;
    },

    async completeOccurrence(householdId, occurrenceId, completedByUserId, completedAt) {
      const updated = await prisma.choreOccurrence.updateMany({
        where: {
          id: occurrenceId,
          householdId,
          assignedUserId: completedByUserId,
          status: "planned"
        },
        data: {
          status: "completed",
          completedAt: new Date(completedAt),
          completedByUserId
        }
      });
      if (updated.count === 0) return undefined;

      const occurrence = await prisma.choreOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });
      return occurrence ? toOccurrence(occurrence) : undefined;
    },

    async recordCompletionCheckIn(input) {
      const occurrence = await completionCheckInRelations(prisma, input);
      if (!occurrence) {
        throw new Error("Cannot record a check-in for an incomplete occurrence");
      }

      const checkIn = await prisma.choreCompletionCheckIn.upsert({
        where: {
          householdId_occurrenceId: {
            householdId: input.householdId,
            occurrenceId: input.occurrenceId
          }
        },
        create: {
          householdId: input.householdId,
          choreId: occurrence.choreId,
          scheduleId: occurrence.scheduleId,
          occurrenceId: input.occurrenceId,
          completedByUserId: input.completedByUserId,
          completedAt: new Date(input.completedAt),
          completedOnTime: input.completedOnTime,
          durationAccurate: input.durationAccurate,
          keepAssignee: input.keepAssignee,
          rebaseFutureOccurrences: input.rebaseFutureOccurrences
        },
        update: {
          completedByUserId: input.completedByUserId,
          completedAt: new Date(input.completedAt),
          completedOnTime: input.completedOnTime,
          durationAccurate: input.durationAccurate,
          keepAssignee: input.keepAssignee,
          rebaseFutureOccurrences: input.rebaseFutureOccurrences
        }
      });

      return toCompletionCheckIn(checkIn);
    },

    async getCompletionCheckInForOccurrence(householdId, occurrenceId) {
      const checkIn = await prisma.choreCompletionCheckIn.findUnique({
        where: {
          householdId_occurrenceId: {
            householdId,
            occurrenceId
          }
        }
      });

      return checkIn ? toCompletionCheckIn(checkIn) : undefined;
    },

    async updateOccurrenceException(householdId, occurrenceId, update) {
      const existing = await prisma.choreOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });
      if (!existing) return undefined;

      const exceptionType =
        update.plannedStartAt !== existing.plannedStartAt?.toISOString()
          ? "rescheduled"
          : update.plannedEndAt !== existing.plannedEndAt?.toISOString()
            ? "resized"
            : update.assignedUserId !== existing.assignedUserId
              ? "reassigned"
              : existing.exceptionType;
      const updated = await prisma.choreOccurrence.update({
        where: { id: occurrenceId },
        data: {
          plannedStartAt: new Date(update.plannedStartAt),
          plannedEndAt: new Date(update.plannedEndAt),
          assignedUserId: update.assignedUserId,
          exceptionType
        }
      });

      return toOccurrence(updated);
    },

    async skipOccurrence(householdId, occurrenceId) {
      const existing = await prisma.choreOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.choreOccurrence.update({
        where: { id: occurrenceId },
        data: { exceptionType: "skipped", status: "skipped" }
      });

      return toOccurrence(updated);
    },

    async clearFutureUntouchedOccurrences(householdId, scheduleId, cutoff: OccurrenceClearFutureCutoff) {
      await prisma.choreOccurrence.deleteMany({
        where: {
          householdId,
          scheduleId,
          exceptionType: "none",
          status: "planned",
          OR: [
            {
              planningMode: "timed",
              plannedStartAt: { gte: new Date(cutoff.fromAt) }
            },
            {
              planningMode: "flexible",
              eligibleEndOn: { gte: cutoff.fromOn }
            }
          ]
        }
      });
    },

    async saveRecommendations(householdId, recommendations) {
      await prisma.$transaction([
        prisma.recommendation.deleteMany({ where: { householdId } }),
        prisma.recommendation.createMany({
          data: recommendations.map((recommendation) => ({
            id: recommendation.id,
            householdId,
            title: recommendation.title,
            rationale: recommendation.rationale,
            confidence: recommendation.confidence,
            status: recommendation.status,
            affectedChoreId: recommendation.affectedChoreId,
            decision: recommendation.decision ?? "pending",
            proposedCadence: recommendation.proposedCadence,
            proposedEstimatedMinutes: recommendation.proposedEstimatedMinutes,
            staleAt: recommendation.staleAt ? new Date(recommendation.staleAt) : null
          }))
        })
      ]);

      return recommendations.map((recommendation) => ({
        ...recommendation,
        decision: recommendation.decision ?? "pending"
      }));
    },

    async markRecommendationsStale(householdId) {
      await prisma.recommendation.updateMany({
        where: { householdId, staleAt: null },
        data: { staleAt: new Date() }
      });
    },

    async listRecommendations(householdId) {
      const recommendations = await prisma.recommendation.findMany({
        where: { householdId },
        orderBy: { createdAt: "asc" }
      });

      return recommendations.map(toRecommendation);
    },

    async listAllRecommendations() {
      const recommendations = await prisma.recommendation.findMany({
        orderBy: { createdAt: "asc" }
      });

      return recommendations.map(toRecommendation);
    },

    async updateRecommendationDecision(householdId, recommendationId, update) {
      const existing = await prisma.recommendation.findFirst({
        where: { id: recommendationId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.recommendation.update({
        where: { id: recommendationId },
        data: { decision: update.decision }
      });

      return toRecommendation(updated);
    },

    async applyRecommendationDecisions(householdId) {
      return prisma.$transaction(async (tx) => {
        const accepted = await tx.recommendation.findMany({
          where: {
            householdId,
            staleAt: null,
            decision: "accepted"
          },
          orderBy: { createdAt: "asc" }
        });
        const declined = await tx.recommendation.findMany({
          where: {
            householdId,
            staleAt: null,
            decision: "declined"
          },
          orderBy: { createdAt: "asc" }
        });
        return {
          applied: [],
          declined: declined.map(toRecommendation),
          requiresScheduleDraftDesign: accepted.length > 0
        };
      });
    }
  };
}
