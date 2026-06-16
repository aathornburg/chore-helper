import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AppNotification,
  CalendarConnectionStatus,
  CalendarContentMode,
  CalendarDetailLevel,
  CalendarExportMode,
  CalendarImportQueueItem,
  CalendarProvider,
  CalendarQueueStatus,
  CalendarSyncMode,
  CleanlyCalendarEvent,
  CleanlyCalendarEventType,
  ImportScope,
  Task,
  TaskDefinitionInput,
  TaskInboxItem,
  TaskInboxItemKind,
  TaskLibraryPermission,
  TaskCompletionCheckIn,
  TaskOccurrence,
  TaskSchedule,
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
import type { AppUser, CalendarConnectionSecretInput, CompletionCheckInCreate, ExternalCalendarInput, HouseholdStore, OccurrenceClearFutureCutoff } from "./inMemoryStore.js";

function serializeOptionalList<T>(values: T[]) {
  return JSON.stringify(values);
}

function deserializeOptionalList<T>(value: string) {
  return JSON.parse(value) as T[];
}

function deserializeStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
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

function toTask(task: {
  id: string;
  householdId: string;
  household?: { name: string } | null;
  title: string;
  type: string;
  libraryState: string;
  source: string;
  instructions?: string | null;
  tags?: string;
  archivedAt?: Date | null;
}): Task {
  const tags = task.tags ? deserializeOptionalList<string>(task.tags) : [];
  return {
    id: task.id,
    householdId: task.householdId,
    householdName: task.household?.name,
    title: task.title,
    type: task.type as Task["type"],
    libraryState: task.libraryState as Task["libraryState"],
    source: task.source as Task["source"],
    ...(task.instructions ? { instructions: task.instructions } : {}),
    ...(tags.length ? { tags } : {}),
    archivedAt: serializeDate(task.archivedAt)
  };
}

function memberDisplayName(member: { user: { displayName: string | null; primaryEmail: string | null; clerkUserId: string } }) {
  return member.user.displayName ?? member.user.primaryEmail ?? member.user.clerkUserId;
}

function toCalendarImportQueueItem(item: {
  id: string;
  householdId: string;
  submittedByUserId: string;
  submittedByUser: { displayName: string | null; primaryEmail: string | null; clerkUserId: string };
  sourceExternalCalendarId: string | null;
  providerEventId: string | null;
  proposedType: string;
  detailLevel: string;
  title: string;
  privacyTitle: string;
  startsAt: Date;
  endsAt: Date;
  queueStatus: string;
  linkedTaskId: string | null;
  taskLinkStatus: string;
  taskMatchReason: string | null;
  importScope: string;
  createdCleanlyEventId: string | null;
  createdAt: Date;
}): CalendarImportQueueItem {
  return {
    id: item.id,
    householdId: item.householdId,
    submittedByUserId: item.submittedByUserId,
    submittedByName: item.submittedByUser.displayName ?? item.submittedByUser.primaryEmail ?? item.submittedByUser.clerkUserId,
    ...(item.sourceExternalCalendarId ? { sourceExternalCalendarId: item.sourceExternalCalendarId } : {}),
    ...(item.providerEventId ? { providerEventId: item.providerEventId } : {}),
    proposedType: item.proposedType as CleanlyCalendarEventType,
    detailLevel: item.detailLevel as CalendarDetailLevel,
    title: item.title,
    privacyTitle: item.privacyTitle,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    queueStatus: item.queueStatus as CalendarQueueStatus,
    linkedTaskId: item.linkedTaskId ?? undefined,
    taskLinkStatus: item.taskLinkStatus as CalendarImportQueueItem["taskLinkStatus"],
    taskMatchReason: item.taskMatchReason ?? undefined,
    importScope: item.importScope as CalendarImportQueueItem["importScope"],
    ...(item.createdCleanlyEventId ? { createdCleanlyEventId: item.createdCleanlyEventId } : {}),
    createdAt: item.createdAt.toISOString()
  };
}

function toSchedule(schedule: {
  id: string;
  householdId: string;
  taskId: string;
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
}): TaskSchedule {
  const weekDays = deserializeOptionalList<number>(schedule.weekDays);
  const base = {
    id: schedule.id,
    householdId: schedule.householdId,
    taskId: schedule.taskId,
    recurrence: {
      frequency: schedule.frequency as TaskSchedule["recurrence"]["frequency"],
      interval: schedule.interval,
      ...(weekDays.length ? { weekDays } : {}),
      ...(schedule.monthlyPattern ? { monthlyPattern: schedule.monthlyPattern as TaskSchedule["recurrence"]["monthlyPattern"] } : {}),
      ...(schedule.monthlyDay ? { monthlyDay: schedule.monthlyDay } : {}),
      ...(schedule.monthlyWeek ? { monthlyWeek: schedule.monthlyWeek } : {}),
      ...(schedule.monthlyWeekday !== null && schedule.monthlyWeekday !== undefined ? { monthlyWeekday: schedule.monthlyWeekday } : {})
    },
    startsOn: schedule.startsOn,
    ...(schedule.endsOn ? { endsOn: schedule.endsOn } : {}),
    assignment: {
      mode: schedule.assignmentMode as TaskSchedule["assignment"]["mode"],
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
  taskId: string;
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
  customTitle?: string | null;
  customType?: string | null;
  customInstructions?: string | null;
  customTags?: string | null;
  hasTaskOverrides?: boolean;
}): TaskOccurrence {
  return {
    id: occurrence.id,
    householdId: occurrence.householdId,
    taskId: occurrence.taskId,
    scheduleId: occurrence.scheduleId,
    sequence: occurrence.sequence,
    planningMode: occurrence.planningMode as TaskOccurrence["planningMode"],
    plannedStartAt: serializeDate(occurrence.plannedStartAt),
    plannedEndAt: serializeDate(occurrence.plannedEndAt),
    estimatedMinutes: occurrence.estimatedMinutes,
    eligibleStartOn: occurrence.eligibleStartOn,
    eligibleEndOn: occurrence.eligibleEndOn,
    assignedUserId: occurrence.assignedUserId,
    exceptionType: occurrence.exceptionType as TaskOccurrence["exceptionType"],
    status: occurrence.status as TaskOccurrence["status"],
    completedAt: serializeDate(occurrence.completedAt),
    completedByUserId: occurrence.completedByUserId ?? undefined,
    customTitle: occurrence.customTitle ?? undefined,
    customType: occurrence.customType as TaskOccurrence["customType"] | undefined,
    customInstructions: occurrence.customInstructions ?? undefined,
    customTags: deserializeStringList(occurrence.customTags),
    hasTaskOverrides: occurrence.hasTaskOverrides ?? false
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
}): TaskCompletionCheckIn {
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
  const occurrence = await prisma.taskOccurrence.findFirst({
    where: {
      id: input.occurrenceId,
      householdId: input.householdId,
      completedByUserId: input.completedByUserId,
      status: "completed"
    },
    select: {
      taskId: true,
      scheduleId: true
    }
  });
  if (!occurrence) return undefined;

  return occurrence;
}

function toRecommendation(recommendation: {
  id: string;
  householdId: string;
  affectedTaskId?: string | null;
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
    affectedTaskId: recommendation.affectedTaskId ?? undefined,
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

function toAppNotification(notification: {
  id: string;
  recipientUserId: string;
  type: string;
  householdId?: string | null;
  household?: { name: string } | null;
  title: string;
  body: string;
  targetPath: string;
  metadataJson: unknown;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AppNotification {
  const metadata = notification.metadataJson && typeof notification.metadataJson === "object" && !Array.isArray(notification.metadataJson)
    ? notification.metadataJson as Record<string, unknown>
    : {};

  return {
    id: notification.id,
    recipientUserId: notification.recipientUserId,
    type: notification.type as AppNotification["type"],
    householdId: notification.householdId ?? undefined,
    householdName: notification.household?.name,
    title: notification.title,
    body: notification.body,
    targetPath: notification.targetPath,
    metadata,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString()
  };
}

function calendarImportReviewNotificationKey(userId: string, householdId: string) {
  return `calendar_import_queue_review:${userId}:${householdId}`;
}

function importReviewNotificationCopy(householdName: string, pendingCount: number) {
  const eventLabel = pendingCount === 1 ? "event is" : "events are";
  return {
    title: "Calendar imports need review",
    body: `${pendingCount} ${eventLabel} waiting in ${householdName}.`,
    targetPath: "/calendar?reviewImports=1"
  };
}

function normalizeTaskTitle(title: string) {
  return title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function taskInboxStatusFromLinkStatus(status: CalendarImportQueueItem["taskLinkStatus"]): TaskInboxItem["status"] {
  if (status === "linked") return "linked";
  if (status === "saved") return "saved";
  if (status === "one_time") return "kept_one_time";
  return "needs_review";
}

function suggestedTaskForTitle(tasks: Task[], title: string) {
  const normalizedTitle = normalizeTaskTitle(title);
  return tasks.find((task) =>
    task.libraryState === "saved" &&
    !task.archivedAt &&
    normalizeTaskTitle(task.title) === normalizedTitle
  );
}

function toPendingImportInboxItem(item: CalendarImportQueueItem, savedTasks: Task[]): TaskInboxItem {
  const suggestedTask = suggestedTaskForTitle(savedTasks, item.title);
  return {
    id: item.id,
    kind: "import_queue",
    householdId: item.householdId,
    status: taskInboxStatusFromLinkStatus(item.taskLinkStatus),
    title: item.title,
    proposedType: item.proposedType,
    source: "google-calendar",
    importQueueItemId: item.id,
    badge: suggestedTask ? "Suggested link" : "Pending import",
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    ...(suggestedTask ? {
      suggestedTaskId: suggestedTask.id,
      suggestedReason: "Matched by title"
    } : {})
  };
}

function toOneTimeTaskInboxItem(
  task: Task,
  schedules: Array<{ planningMode: string; startsOn: string; localStartTime?: string | null; localEndTime?: string | null }>,
  savedTasks: Task[]
): TaskInboxItem {
  const suggestedTask = suggestedTaskForTitle(savedTasks, task.title);
  const schedule = schedules.find((candidate) => candidate.planningMode === "timed");
  return {
    id: task.id,
    kind: "task",
    householdId: task.householdId,
    status: "needs_review",
    title: task.title,
    proposedType: task.type,
    source: task.source,
    taskId: task.id,
    badge: suggestedTask ? "Suggested link" : "Scheduled",
    ...(schedule?.localStartTime && schedule.localEndTime ? {
      startsAt: `${schedule.startsOn}T${schedule.localStartTime}:00`,
      endsAt: `${schedule.startsOn}T${schedule.localEndTime}:00`
    } : {}),
    ...(suggestedTask ? {
      suggestedTaskId: suggestedTask.id,
      suggestedReason: "Matched by title"
    } : {})
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
        role: membership.role as "owner" | "member",
        taskLibraryPermission: membership.role === "owner"
          ? "manage"
          : (membership.taskLibraryPermission as TaskLibraryPermission)
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
        role: membership.role as "owner" | "member",
        taskLibraryPermission: membership.role === "owner"
          ? "manage"
          : (membership.taskLibraryPermission as TaskLibraryPermission)
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
            role: updated.role as "owner" | "member",
            taskLibraryPermission: updated.role === "owner"
              ? "manage"
              : (updated.taskLibraryPermission as TaskLibraryPermission)
          }
        };
      }, { isolationLevel: "Serializable" });
    },

    async updateTaskLibraryPermission(householdId, userId, update) {
      const existing = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId } }
      });
      if (!existing) return undefined;

      const saved = await prisma.householdMember.update({
        where: { householdId_userId: { householdId, userId } },
        data: { taskLibraryPermission: update.taskLibraryPermission },
        include: { user: true }
      });

      return {
        householdId: saved.householdId,
        userId: saved.userId,
        clerkUserId: saved.user.clerkUserId,
        primaryEmail: saved.user.primaryEmail ?? undefined,
        displayName: saved.user.displayName ?? undefined,
        role: saved.role as "owner" | "member",
        taskLibraryPermission: saved.role === "owner"
          ? "manage"
          : (saved.taskLibraryPermission as TaskLibraryPermission)
      };
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
            role: removed.role as "owner" | "member",
            taskLibraryPermission: removed.role === "owner"
              ? "manage"
              : (removed.taskLibraryPermission as TaskLibraryPermission)
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
                role: "owner",
                taskLibraryPermission: "manage"
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

    async deleteHousehold(householdId) {
      try {
        await prisma.household.delete({ where: { id: householdId } });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return false;
        }
        throw error;
      }
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

    async createTask(householdId, task) {
      const created = await prisma.$transaction(async (tx) => {
        const nextTask = await tx.task.create({
          data: {
            id: crypto.randomUUID(),
            householdId,
            title: task.title,
            type: task.type,
            libraryState: task.libraryState,
            source: task.source,
            instructions: task.instructions,
            tags: serializeOptionalList(task.tags ?? [])
          }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextTask;
      });

      return toTask(created);
    },

    async createTaskWithSchedules({ householdId, task, schedules }) {
      const created = await prisma.$transaction(async (tx) => {
        const nextTask = await tx.task.create({
          data: {
            id: crypto.randomUUID(),
            householdId,
            title: task.title,
            type: task.type,
            libraryState: task.libraryState,
            source: task.source,
            instructions: task.instructions,
            tags: serializeOptionalList(task.tags ?? []),
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
        return nextTask;
      });

      return {
        task: toTask(created),
        schedules: created.schedules.map(toSchedule)
      };
    },

    async updateTask(householdId, taskId, task) {
      const existing = await prisma.task.findFirst({
        where: { id: taskId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextTask = await tx.task.update({
          where: { id: taskId },
          data: {
            title: task.title,
            type: task.type,
            libraryState: task.libraryState,
            source: task.source,
            instructions: task.instructions,
            tags: serializeOptionalList(task.tags ?? [])
          }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextTask;
      });

      return toTask(updated);
    },

    async archiveTask(householdId, taskId) {
      const existing = await prisma.task.findFirst({
        where: { id: taskId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const archivedAt = new Date();
        const nextTask = await tx.task.update({
          where: { id: taskId },
          data: { archivedAt }
        });
        await tx.taskSchedule.updateMany({
          where: { householdId, taskId, archivedAt: null },
          data: { archivedAt }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextTask;
      });

      return toTask(updated);
    },

    async restoreTask(householdId, taskId) {
      const existing = await prisma.task.findFirst({
        where: { id: taskId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const nextTask = await tx.task.update({
          where: { id: taskId },
          data: { archivedAt: null }
        });
        await tx.recommendation.updateMany({
          where: { householdId, staleAt: null },
          data: { staleAt: new Date() }
        });
        return nextTask;
      });

      return toTask(updated);
    },

    async listTasks(householdId, options = {}) {
      const tasks = await prisma.task.findMany({
        where: options.archivedOnly
          ? { householdId, archivedAt: { not: null } }
          : options.includeArchived
            ? { householdId }
            : { householdId, archivedAt: null },
        orderBy: { createdAt: "asc" }
      });

      return tasks.map(toTask);
    },

    async listAllTasks(options = {}) {
      const tasks = await prisma.task.findMany({
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

      return tasks.map(toTask);
    },

    async createSchedule(schedule) {
      const created = await prisma.taskSchedule.create({
        data: {
          householdId: schedule.householdId,
          taskId: schedule.taskId,
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

    async listSchedules(householdId, taskId) {
      const schedules = await prisma.taskSchedule.findMany({
        where: {
          householdId,
          archivedAt: null,
          ...(taskId ? { taskId } : {})
        },
        include: { assignees: true },
        orderBy: { createdAt: "asc" }
      });

      return schedules.map(toSchedule);
    },

    async updateSchedule(householdId, scheduleId, update) {
      const existing = await prisma.taskSchedule.findFirst({
        where: { id: scheduleId, householdId, archivedAt: null }
      });
      if (!existing) return undefined;

      const updated = await prisma.taskSchedule.update({
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
      const existing = await prisma.taskSchedule.findFirst({
        where: { id: scheduleId, householdId, archivedAt: null }
      });
      if (!existing) return undefined;

      const updated = await prisma.taskSchedule.update({
        where: { id: scheduleId },
        data: { archivedAt: new Date() },
        include: { assignees: true }
      });

      return toSchedule(updated);
    },

    async materializeScheduleOccurrences(householdId, scheduleId, occurrences) {
      const storedOccurrences = await Promise.all(
        occurrences.map((occurrence) =>
          prisma.taskOccurrence.upsert({
            where: {
              id: occurrence.id
            },
            update: {},
            create: {
              id: occurrence.id,
              householdId,
              taskId: occurrence.taskId,
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
      const occurrences = await prisma.taskOccurrence.findMany({
        where: {
          householdId,
          schedule: {
            archivedAt: null
          },
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
      const occurrence = await prisma.taskOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });

      return occurrence ? toOccurrence(occurrence) : undefined;
    },

    async completeOccurrence(householdId, occurrenceId, completedByUserId, completedAt) {
      const updated = await prisma.taskOccurrence.updateMany({
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

      const occurrence = await prisma.taskOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });
      return occurrence ? toOccurrence(occurrence) : undefined;
    },

    async recordCompletionCheckIn(input) {
      const occurrence = await completionCheckInRelations(prisma, input);
      if (!occurrence) {
        throw new Error("Cannot record a check-in for an incomplete occurrence");
      }

      const checkIn = await prisma.taskCompletionCheckIn.upsert({
        where: {
          householdId_occurrenceId: {
            householdId: input.householdId,
            occurrenceId: input.occurrenceId
          }
        },
        create: {
          householdId: input.householdId,
          taskId: occurrence.taskId,
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
      const checkIn = await prisma.taskCompletionCheckIn.findUnique({
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
      const existing = await prisma.taskOccurrence.findFirst({
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
      const updated = await prisma.taskOccurrence.update({
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

    async updateOccurrenceTaskDetails(householdId, occurrenceId, update) {
      const existing = await prisma.taskOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.taskOccurrence.update({
        where: { id: occurrenceId },
        data: {
          customTitle: update.title,
          customType: update.type,
          customInstructions: update.instructions ?? null,
          customTags: serializeOptionalList(update.tags ?? []),
          hasTaskOverrides: true
        }
      });

      return toOccurrence(updated);
    },

    async saveOccurrenceTaskToLibrary(householdId, occurrenceId) {
      const existing = await prisma.taskOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });
      if (!existing) return undefined;

      const taskUpdate = await prisma.task.updateMany({
        where: { id: existing.taskId, householdId },
        data: { libraryState: "saved" }
      });
      if (taskUpdate.count === 0) return undefined;

      const updated = await prisma.taskOccurrence.update({
        where: { id: occurrenceId },
        data: { hasTaskOverrides: false }
      });

      return toOccurrence(updated);
    },

    async syncOccurrenceDetailsToTask(householdId, occurrenceId) {
      const existing = await prisma.taskOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });
      if (!existing) return undefined;

      const taskUpdate = await prisma.task.updateMany({
        where: { id: existing.taskId, householdId },
        data: {
          ...(existing.customTitle ? { title: existing.customTitle } : {}),
          ...(existing.customType ? { type: existing.customType } : {}),
          instructions: existing.customInstructions,
          tags: existing.customTags ?? "[]"
        }
      });
      if (taskUpdate.count === 0) return undefined;

      const updated = await prisma.taskOccurrence.update({
        where: { id: occurrenceId },
        data: {
          customTitle: null,
          customType: null,
          customInstructions: null,
          customTags: "[]",
          hasTaskOverrides: false
        }
      });

      return toOccurrence(updated);
    },

    async resetOccurrenceTaskOverrides(householdId, occurrenceId) {
      const existing = await prisma.taskOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.taskOccurrence.update({
        where: { id: occurrenceId },
        data: {
          customTitle: null,
          customType: null,
          customInstructions: null,
          customTags: "[]",
          hasTaskOverrides: false
        }
      });

      return toOccurrence(updated);
    },

    async skipOccurrence(householdId, occurrenceId) {
      const existing = await prisma.taskOccurrence.findFirst({
        where: { id: occurrenceId, householdId }
      });
      if (!existing) return undefined;

      const updated = await prisma.taskOccurrence.update({
        where: { id: occurrenceId },
        data: { exceptionType: "skipped", status: "skipped" }
      });

      return toOccurrence(updated);
    },

    async clearFutureUntouchedOccurrences(householdId, scheduleId, cutoff: OccurrenceClearFutureCutoff) {
      await prisma.taskOccurrence.deleteMany({
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
            affectedTaskId: recommendation.affectedTaskId,
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

    async listCalendarImportPolicies(householdId) {
      const members = await prisma.householdMember.findMany({
        where: { householdId },
        include: { user: true },
        orderBy: { createdAt: "asc" }
      });
      const policies = await prisma.calendarImportPolicy.findMany({ where: { householdId } });
      const policyByMember = new Map(policies.map((policy) => [policy.memberId, policy]));

      return members.map((member) => {
        const policy = policyByMember.get(member.userId);
        return {
          householdId,
          memberId: member.userId,
          memberName: memberDisplayName(member),
          ...(member.user.primaryEmail ? { memberEmail: member.user.primaryEmail } : {}),
          importQueueMode: (policy?.importQueueMode ?? "manual") as CalendarSyncMode,
          importContentMode: (policy?.importContentMode ?? "both") as CalendarContentMode
        };
      });
    },

    async updateCalendarImportPolicy(householdId, memberId, update) {
      const member = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId: memberId } },
        include: { user: true }
      });
      if (!member) throw new Error("Household member not found");

      const policy = await prisma.calendarImportPolicy.upsert({
        where: { householdId_memberId: { householdId, memberId } },
        update,
        create: { householdId, memberId, ...update }
      });

      return {
        householdId,
        memberId,
        memberName: memberDisplayName(member),
        ...(member.user.primaryEmail ? { memberEmail: member.user.primaryEmail } : {}),
        importQueueMode: policy.importQueueMode as CalendarSyncMode,
        importContentMode: policy.importContentMode as CalendarContentMode
      };
    },

    async listCalendarConnections(userId) {
      const connections = await prisma.calendarConnection.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" }
      });

      return connections.map((connection) => ({
        id: connection.id,
        provider: connection.provider as CalendarProvider,
        providerAccountEmail: connection.providerAccountEmail,
        status: connection.status as CalendarConnectionStatus,
        scopes: deserializeStringList(connection.scopes),
        tokenExpiresAt: serializeDate(connection.tokenExpiresAt),
        lastSyncedAt: serializeDate(connection.lastSyncedAt)
      }));
    },

    async upsertCalendarConnection(userId, input) {
      const existing = await prisma.calendarConnection.findFirst({
        where: {
          userId,
          provider: input.provider,
          providerAccountEmail: input.providerAccountEmail
        }
      });
      const connection = existing
        ? await prisma.calendarConnection.update({
            where: { id: existing.id },
            data: {
              status: input.status ?? "connected",
              scopes: JSON.stringify(input.scopes),
              accessTokenEncrypted: input.accessTokenEncrypted,
              refreshTokenEncrypted: input.refreshTokenEncrypted,
              tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : null,
              lastSyncedAt: input.lastSyncedAt ? new Date(input.lastSyncedAt) : new Date()
            }
          })
        : await prisma.calendarConnection.create({
            data: {
              userId,
              provider: input.provider,
              providerAccountEmail: input.providerAccountEmail,
              status: input.status ?? "connected",
              scopes: JSON.stringify(input.scopes),
              accessTokenEncrypted: input.accessTokenEncrypted,
              refreshTokenEncrypted: input.refreshTokenEncrypted,
              tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : null,
              lastSyncedAt: input.lastSyncedAt ? new Date(input.lastSyncedAt) : new Date()
            }
          });

      return {
        id: connection.id,
        provider: connection.provider as CalendarProvider,
        providerAccountEmail: connection.providerAccountEmail,
        status: connection.status as CalendarConnectionStatus,
        scopes: deserializeStringList(connection.scopes),
        tokenExpiresAt: serializeDate(connection.tokenExpiresAt),
        lastSyncedAt: serializeDate(connection.lastSyncedAt)
      };
    },

    async updateCalendarConnectionTokens(userId, connectionId, update) {
      const existing = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
      if (!existing) return undefined;
      const connection = await prisma.calendarConnection.update({
        where: { id: connectionId },
        data: {
          ...(update.status ? { status: update.status } : {}),
          ...(update.scopes ? { scopes: JSON.stringify(update.scopes) } : {}),
          ...(update.tokenExpiresAt ? { tokenExpiresAt: new Date(update.tokenExpiresAt) } : {}),
          ...(update.accessTokenEncrypted ? { accessTokenEncrypted: update.accessTokenEncrypted } : {}),
          ...(update.refreshTokenEncrypted ? { refreshTokenEncrypted: update.refreshTokenEncrypted } : {})
        }
      });
      return {
        id: connection.id,
        provider: connection.provider as CalendarProvider,
        providerAccountEmail: connection.providerAccountEmail,
        status: connection.status as CalendarConnectionStatus,
        scopes: deserializeStringList(connection.scopes),
        tokenExpiresAt: serializeDate(connection.tokenExpiresAt),
        lastSyncedAt: serializeDate(connection.lastSyncedAt)
      };
    },

    async updateCalendarConnectionStatus(userId, connectionId, status) {
      const existing = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
      if (!existing) return undefined;
      const connection = await prisma.calendarConnection.update({
        where: { id: connectionId },
        data: { status }
      });
      return {
        id: connection.id,
        provider: connection.provider as CalendarProvider,
        providerAccountEmail: connection.providerAccountEmail,
        status: connection.status as CalendarConnectionStatus,
        scopes: deserializeStringList(connection.scopes),
        tokenExpiresAt: serializeDate(connection.tokenExpiresAt),
        lastSyncedAt: serializeDate(connection.lastSyncedAt)
      };
    },

    async deleteCalendarConnection(userId, connectionId) {
      const existing = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
      if (!existing) return false;
      await prisma.calendarConnection.delete({ where: { id: connectionId } });
      return true;
    },

    async getCalendarConnectionSecrets(userId, connectionId) {
      const connection = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
      if (!connection) return undefined;
      return {
        id: connection.id,
        provider: connection.provider as CalendarProvider,
        providerAccountEmail: connection.providerAccountEmail,
        status: connection.status as CalendarConnectionStatus,
        scopes: deserializeStringList(connection.scopes),
        tokenExpiresAt: serializeDate(connection.tokenExpiresAt),
        lastSyncedAt: serializeDate(connection.lastSyncedAt),
        ...(connection.accessTokenEncrypted ? { accessTokenEncrypted: connection.accessTokenEncrypted } : {}),
        ...(connection.refreshTokenEncrypted ? { refreshTokenEncrypted: connection.refreshTokenEncrypted } : {})
      };
    },

    async listExternalCalendars(userId) {
      const calendars = await prisma.externalCalendar.findMany({
        where: { connection: { userId } },
        orderBy: { name: "asc" }
      });

      return calendars.map((calendar) => ({
        id: calendar.id,
        connectionId: calendar.connectionId,
        providerCalendarId: calendar.providerCalendarId,
        name: calendar.name,
        ...(calendar.color ? { color: calendar.color } : {}),
        ...(calendar.timezone ? { timezone: calendar.timezone } : {}),
        ...(calendar.accessRole ? { accessRole: calendar.accessRole } : {}),
        isSelectedForImport: calendar.isSelectedForImport,
        isSelectedForExport: calendar.isSelectedForExport
      }));
    },

    async upsertExternalCalendars(userId, connectionId, calendars) {
      const connection = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
      if (!connection) return [];
      const upserted = await Promise.all(calendars.map((calendar: ExternalCalendarInput) =>
        prisma.externalCalendar.upsert({
          where: {
            connectionId_providerCalendarId: {
              connectionId,
              providerCalendarId: calendar.providerCalendarId
            }
          },
          update: {
            name: calendar.name,
            color: calendar.color,
            timezone: calendar.timezone,
            accessRole: calendar.accessRole,
            isSelectedForImport: calendar.isSelectedForImport,
            isSelectedForExport: calendar.isSelectedForExport
          },
          create: {
            connectionId,
            providerCalendarId: calendar.providerCalendarId,
            name: calendar.name,
            color: calendar.color,
            timezone: calendar.timezone,
            accessRole: calendar.accessRole,
            isSelectedForImport: calendar.isSelectedForImport ?? false,
            isSelectedForExport: calendar.isSelectedForExport ?? false
          }
        })
      ));
      return upserted.map((calendar) => ({
        id: calendar.id,
        connectionId: calendar.connectionId,
        providerCalendarId: calendar.providerCalendarId,
        name: calendar.name,
        ...(calendar.color ? { color: calendar.color } : {}),
        ...(calendar.timezone ? { timezone: calendar.timezone } : {}),
        ...(calendar.accessRole ? { accessRole: calendar.accessRole } : {}),
        isSelectedForImport: calendar.isSelectedForImport,
        isSelectedForExport: calendar.isSelectedForExport
      }));
    },

    async getCalendarPreferences(userId, householdId) {
      const [sharing, exportPreference] = await Promise.all([
        prisma.calendarSharingPreference.findUnique({ where: { userId_householdId: { userId, householdId } } }),
        prisma.calendarExportPreference.findUnique({ where: { userId_householdId: { userId, householdId } } })
      ]);

      return {
        householdId,
        defaultDetailLevel: (sharing?.defaultDetailLevel ?? "busy_only") as CalendarDetailLevel,
        selectedSourceCalendarIds: deserializeStringList(sharing?.selectedSourceCalendarIds),
        exportMode: (exportPreference?.exportMode ?? "off") as CalendarExportMode,
        exportContentMode: (exportPreference?.exportContentMode ?? "chores") as CalendarContentMode,
        ...(exportPreference?.destinationExternalCalendarId
          ? { destinationExternalCalendarId: exportPreference.destinationExternalCalendarId }
          : {})
      };
    },

    async updateCalendarPreferences(userId, householdId, update) {
      await prisma.calendarSharingPreference.upsert({
        where: { userId_householdId: { userId, householdId } },
        update: {
          defaultDetailLevel: update.defaultDetailLevel,
          selectedSourceCalendarIds: serializeOptionalList(update.selectedSourceCalendarIds)
        },
        create: {
          userId,
          householdId,
          defaultDetailLevel: update.defaultDetailLevel,
          selectedSourceCalendarIds: serializeOptionalList(update.selectedSourceCalendarIds)
        }
      });
      await prisma.calendarExportPreference.upsert({
        where: { userId_householdId: { userId, householdId } },
        update: {
          exportMode: update.exportMode,
          exportContentMode: update.exportContentMode,
          destinationExternalCalendarId: update.destinationExternalCalendarId
        },
        create: {
          userId,
          householdId,
          exportMode: update.exportMode,
          exportContentMode: update.exportContentMode,
          destinationExternalCalendarId: update.destinationExternalCalendarId
        }
      });

      return this.getCalendarPreferences(userId, householdId);
    },

    async listCalendarImportQueue(householdId) {
      const items = await prisma.calendarImportQueueItem.findMany({
        where: { householdId },
        include: { submittedByUser: true },
        orderBy: { createdAt: "asc" }
      });
      return items.map(toCalendarImportQueueItem);
    },

    async createCalendarImportQueueItem(input) {
      const item = await prisma.calendarImportQueueItem.create({
        data: {
          householdId: input.householdId,
          submittedByUserId: input.submittedByUserId,
          sourceExternalCalendarId: input.sourceExternalCalendarId,
          providerEventId: input.providerEventId,
          proposedType: input.proposedType,
          detailLevel: input.detailLevel,
          title: input.title,
          privacyTitle: input.privacyTitle,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          timezone: "UTC",
          queueStatus: "pending",
          taskLinkStatus: input.taskLinkStatus ?? "unreviewed",
          importScope: input.importScope ?? "single"
        },
        include: { submittedByUser: true }
      });

      return toCalendarImportQueueItem(item);
    },

    async listTaskInboxItems(householdId) {
      const [queueItems, oneTimeTasks, savedTasks] = await Promise.all([
        prisma.calendarImportQueueItem.findMany({
          where: { householdId, queueStatus: "pending" },
          include: { submittedByUser: true },
          orderBy: { createdAt: "asc" }
        }),
        prisma.task.findMany({
          where: { householdId, libraryState: "one_time", archivedAt: null },
          include: { schedules: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } } },
          orderBy: { createdAt: "asc" }
        }),
        prisma.task.findMany({
          where: { householdId, libraryState: "saved", archivedAt: null },
          orderBy: { createdAt: "asc" }
        })
      ]);
      const saved = savedTasks.map(toTask);

      return {
        items: [
          ...queueItems.map((item) => toPendingImportInboxItem(toCalendarImportQueueItem(item), saved)),
          ...oneTimeTasks.map((task) => toOneTimeTaskInboxItem(toTask(task), task.schedules, saved))
        ]
      };
    },

    async linkTaskInboxItem(
      householdId: string,
      kind: TaskInboxItemKind,
      itemId: string,
      taskId: string,
      scope: ImportScope
    ) {
      const linkedTask = await prisma.task.findFirst({
        where: { id: taskId, householdId, libraryState: "saved", archivedAt: null }
      });
      if (!linkedTask) return undefined;

      if (kind === "import_queue") {
        const item = await prisma.calendarImportQueueItem.findFirst({
          where: { id: itemId, householdId, queueStatus: "pending" }
        });
        if (!item) return undefined;

        const updated = await prisma.calendarImportQueueItem.update({
          where: { id: itemId },
          data: {
            linkedTaskId: linkedTask.id,
            taskLinkStatus: "linked",
            taskMatchReason: "Linked from Task inbox",
            importScope: scope
          },
          include: { submittedByUser: true }
        });
        return toCalendarImportQueueItem(updated);
      }

      if (kind === "task") {
        const task = await prisma.task.findFirst({
          where: { id: itemId, householdId, libraryState: "one_time", archivedAt: null }
        });
        return task ? toTask(task) : undefined;
      }

      return undefined;
    },

    async saveTaskInboxItem(
      householdId: string,
      kind: TaskInboxItemKind,
      itemId: string,
      task: TaskDefinitionInput,
      scope: ImportScope
    ) {
      if (kind === "import_queue") {
        const item = await prisma.calendarImportQueueItem.findFirst({
          where: { id: itemId, householdId, queueStatus: "pending" }
        });
        if (!item) return undefined;

        const updated = await prisma.$transaction(async (tx) => {
          const createdTask = await tx.task.create({
            data: {
              id: crypto.randomUUID(),
              householdId,
              title: task.title,
              type: task.type,
              libraryState: "saved",
              source: task.source,
              instructions: task.instructions,
              tags: serializeOptionalList(task.tags ?? [])
            }
          });
          await tx.recommendation.updateMany({
            where: { householdId, staleAt: null },
            data: { staleAt: new Date() }
          });
          return tx.calendarImportQueueItem.update({
            where: { id: itemId },
            data: {
              linkedTaskId: createdTask.id,
              taskLinkStatus: "saved",
              taskMatchReason: "Saved from Task inbox",
              importScope: scope
            },
            include: { submittedByUser: true }
          });
        });
        return toCalendarImportQueueItem(updated);
      }

      if (kind === "task") {
        const existing = await prisma.task.findFirst({
          where: { id: itemId, householdId, libraryState: "one_time", archivedAt: null }
        });
        if (!existing) return undefined;

        const updated = await prisma.$transaction(async (tx) => {
          const nextTask = await tx.task.update({
            where: { id: itemId },
            data: {
              title: task.title,
              type: task.type,
              libraryState: "saved",
              source: task.source,
              instructions: task.instructions,
              tags: serializeOptionalList(task.tags ?? [])
            }
          });
          await tx.recommendation.updateMany({
            where: { householdId, staleAt: null },
            data: { staleAt: new Date() }
          });
          return nextTask;
        });
        return toTask(updated);
      }

      return undefined;
    },

    async keepTaskInboxItemOneTime(householdId, kind, itemId) {
      if (kind === "import_queue") {
        const item = await prisma.calendarImportQueueItem.findFirst({
          where: { id: itemId, householdId, queueStatus: "pending" }
        });
        if (!item) return undefined;

        const updated = await prisma.calendarImportQueueItem.update({
          where: { id: itemId },
          data: {
            taskLinkStatus: "one_time",
            taskMatchReason: "Kept one-time from Task inbox"
          },
          include: { submittedByUser: true }
        });
        return toCalendarImportQueueItem(updated);
      }

      if (kind === "task") {
        const task = await prisma.task.findFirst({
          where: { id: itemId, householdId, libraryState: "one_time", archivedAt: null }
        });
        return task ? toTask(task) : undefined;
      }

      return undefined;
    },

    async upsertCalendarImportQueueReviewNotifications(householdId) {
      const [household, pendingCount, owners] = await Promise.all([
        prisma.household.findUnique({ where: { id: householdId } }),
        prisma.calendarImportQueueItem.count({ where: { householdId, queueStatus: "pending" } }),
        prisma.householdMember.findMany({ where: { householdId, role: "owner" } })
      ]);
      if (!household || pendingCount <= 0) return [];
      const copy = importReviewNotificationCopy(household.name, pendingCount);
      const notifications = await Promise.all(owners.map((owner) =>
        prisma.appNotification.upsert({
          where: { dedupeKey: calendarImportReviewNotificationKey(owner.userId, householdId) },
          update: {
            ...copy,
            metadataJson: { householdId, pendingCount },
            readAt: null
          },
          create: {
            recipientUserId: owner.userId,
            type: "calendar_import_queue_review",
            householdId,
            ...copy,
            metadataJson: { householdId, pendingCount },
            dedupeKey: calendarImportReviewNotificationKey(owner.userId, householdId)
          },
          include: { household: true }
        })
      ));
      return notifications.map(toAppNotification);
    },

    async listNotificationsForUser(userId) {
      const notifications = await prisma.appNotification.findMany({
        where: { recipientUserId: userId },
        include: { household: true },
        orderBy: { updatedAt: "desc" }
      });
      const pendingCounts = new Map<string, number>();
      const visible: AppNotification[] = [];
      for (const notification of notifications) {
        if (notification.type === "calendar_import_queue_review" && notification.householdId) {
          const cached = pendingCounts.get(notification.householdId);
          const pendingCount = cached ?? await prisma.calendarImportQueueItem.count({
            where: { householdId: notification.householdId, queueStatus: "pending" }
          });
          pendingCounts.set(notification.householdId, pendingCount);
          if (pendingCount <= 0) continue;
          const householdName = notification.household?.name ?? "Home";
          const copy = importReviewNotificationCopy(householdName, pendingCount);
          visible.push({
            ...toAppNotification(notification),
            householdName,
            ...copy,
            metadata: {
              ...(toAppNotification(notification).metadata),
              householdId: notification.householdId,
              pendingCount
            }
          });
          continue;
        }
        visible.push(toAppNotification(notification));
      }
      return visible;
    },

    async markNotificationsRead(userId, notificationIds) {
      if (!notificationIds.length) return [];
      await prisma.appNotification.updateMany({
        where: {
          recipientUserId: userId,
          id: { in: notificationIds }
        },
        data: { readAt: new Date() }
      });
      const notifications = await prisma.appNotification.findMany({
        where: {
          recipientUserId: userId,
          id: { in: notificationIds }
        },
        include: { household: true },
        orderBy: { updatedAt: "desc" }
      });
      return notifications.map(toAppNotification);
    },

    async decideCalendarImportQueueItem(householdId, queueItemId, ownerUserId, input) {
      const item = await prisma.calendarImportQueueItem.findFirst({
        where: { id: queueItemId, householdId },
        include: { submittedByUser: true }
      });
      if (!item) throw new Error("Calendar import queue item not found");
      if (item.queueStatus !== "pending") return toCalendarImportQueueItem(item);

      const cleanlyEvent = input.decision === "approve"
        ? await prisma.cleanlyCalendarEvent.create({
            data: {
              householdId,
              createdByUserId: item.submittedByUserId,
              type: input.proposedType ?? item.proposedType,
              title: item.title,
              privacyTitle: item.privacyTitle,
              detailLevel: item.detailLevel,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              timezone: item.timezone,
              source: "google",
              status: "active"
            }
          })
        : undefined;

      const updated = await prisma.calendarImportQueueItem.update({
        where: { id: queueItemId },
        data: {
          proposedType: input.proposedType ?? item.proposedType,
          linkedTaskId: input.linkedTaskId ?? item.linkedTaskId,
          taskLinkStatus: input.taskLinkStatus ?? item.taskLinkStatus,
          taskMatchReason: input.taskMatchReason ?? item.taskMatchReason,
          importScope: input.importScope ?? item.importScope,
          queueStatus: input.decision === "approve" ? "approved" : "rejected",
          ownerDecisionByUserId: ownerUserId,
          ownerDecisionAt: new Date(),
          createdCleanlyEventId: cleanlyEvent?.id
        },
        include: { submittedByUser: true }
      });

      return toCalendarImportQueueItem(updated);
    },

    async listCleanlyCalendarEvents(householdId, range) {
      const events = await prisma.cleanlyCalendarEvent.findMany({
        where: {
          householdId,
          ...(range ? {
            startsAt: { lt: new Date(range.endAt) },
            endsAt: { gt: new Date(range.startAt) }
          } : {})
        },
        orderBy: { startsAt: "asc" }
      });
      return events.map((event): CleanlyCalendarEvent => ({
        id: event.id,
        householdId: event.householdId,
        createdByUserId: event.createdByUserId,
        type: event.type as CleanlyCalendarEventType,
        title: event.title,
        privacyTitle: event.privacyTitle,
        detailLevel: event.detailLevel as CalendarDetailLevel,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        timezone: event.timezone,
        source: event.source as CleanlyCalendarEvent["source"],
        status: event.status as CleanlyCalendarEvent["status"]
      }));
    },

    async getCleanlyCalendarEvent(householdId, eventId) {
      const event = await prisma.cleanlyCalendarEvent.findFirst({ where: { id: eventId, householdId } });
      if (!event) return undefined;
      return {
        id: event.id,
        householdId: event.householdId,
        createdByUserId: event.createdByUserId,
        type: event.type as CleanlyCalendarEventType,
        title: event.title,
        privacyTitle: event.privacyTitle,
        detailLevel: event.detailLevel as CalendarDetailLevel,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        timezone: event.timezone,
        source: event.source as CleanlyCalendarEvent["source"],
        status: event.status as CleanlyCalendarEvent["status"]
      };
    },

    async createExternalCalendarEventLink(input) {
      await prisma.externalCalendarEventLink.create({
        data: {
          cleanlyCalendarEventId: input.cleanlyCalendarEventId,
          connectionId: input.connectionId,
          externalCalendarId: input.externalCalendarId,
          providerEventId: input.providerEventId,
          direction: input.direction
        }
      });
    },

    async hasExternalCalendarEventLink(cleanlyCalendarEventId, externalCalendarId) {
      const existing = await prisma.externalCalendarEventLink.findFirst({
        where: { cleanlyCalendarEventId, externalCalendarId }
      });
      return Boolean(existing);
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

