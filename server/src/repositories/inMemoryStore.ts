import type {
  CalendarConnectionSummary,
  CalendarConnectionStatus,
  CalendarImportPolicy,
  CalendarImportQueueDecisionInput,
  CalendarImportQueueItem,
  CalendarPreferences,
  CleanlyCalendarEvent,
  ImportScope,
  Task,
  TaskInboxItem,
  TaskInboxItemKind,
  TaskLibraryPermission,
  TaskCompletionCheckIn,
  TaskDefinitionInput,
  OccurrenceTaskDetailsInput,
  TaskOccurrence,
  TaskSchedule,
  CreateTaskInput,
  Household,
  HouseholdFloor,
  HouseholdInvitation,
  HouseholdMemberSummary,
  HouseholdProfile,
  HouseholdStructure,
  AppNotification,
  Recommendation,
  RecommendationDecision,
  ScheduleInput,
  ScheduledTask,
  ExternalCalendarSummary
} from "@chore-helper/shared";

export type StoreResult<T> = T | Promise<T>;

export type CalendarImportQueueCreateInput =
  Omit<CalendarImportQueueItem, "id" | "createdAt" | "queueStatus" | "taskLinkStatus" | "importScope"> &
  Partial<Pick<CalendarImportQueueItem, "taskLinkStatus" | "importScope">>;

export type TaskListOptions = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
};

export type TaskUpdate = TaskDefinitionInput;
export type TaskScheduleUpdate = ScheduleInput;
export type OccurrenceUpdate = Required<Pick<TaskOccurrence, "plannedStartAt" | "plannedEndAt" | "assignedUserId">>;

export type OccurrenceRange = {
  startAt: string;
  endAt: string;
  startOn: string;
  endOn: string;
  assignedUserId?: string;
};
export type OccurrenceClearFutureCutoff =
  { fromAt: string; fromOn: string };

export type CompletionCheckInCreate = Omit<TaskCompletionCheckIn, "id" | "createdAt" | "updatedAt">;

export type NewScheduledTask = {
  householdId: string;
  task: TaskDefinitionInput;
  schedules: ScheduleInput[];
};

export type RecommendationDecisionUpdate = {
  decision: Exclude<RecommendationDecision, "applied">;
};

export type ApplyRecommendationResult = {
  applied: Recommendation[];
  declined: Recommendation[];
  requiresScheduleDraftDesign: boolean;
};

export type AppUser = {
  id: string;
  clerkUserId: string;
  primaryEmail?: string;
  displayName?: string;
};

export type CalendarConnectionSecretInput = Omit<CalendarConnectionSummary, "id" | "status"> & {
  status?: CalendarConnectionSummary["status"];
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
};

export type CalendarConnectionSecrets = CalendarConnectionSummary & {
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
};

export type ExternalCalendarInput = Omit<ExternalCalendarSummary, "id" | "connectionId" | "isSelectedForImport" | "isSelectedForExport"> & {
  isSelectedForImport?: boolean;
  isSelectedForExport?: boolean;
};

export type CalendarEventRange = {
  startAt: string;
  endAt: string;
};

export type HouseholdMembership = {
  householdId: string;
  userId: string;
  role: "owner" | "member";
  taskLibraryPermission: TaskLibraryPermission;
};

export type HouseholdMemberMutationResult =
  | { outcome: "updated"; membership: HouseholdMembership }
  | { outcome: "not_found" }
  | { outcome: "last_owner" };

export type TaskLibraryPermissionUpdate = {
  taskLibraryPermission: TaskLibraryPermission;
};

export type NewHouseholdInvitation = {
  householdId: string;
  recipientEmail: string;
  tokenDigest: string;
  invitedByUserId: string;
  expiresAt: string;
};

export type StoredHouseholdInvitation = HouseholdInvitation & {
  tokenDigest: string;
};

export type HouseholdStore = {
  upsertUserByClerkId(
    clerkUserId: string,
    profile?: { primaryEmail?: string; displayName?: string }
  ): StoreResult<AppUser>;
  getUserByClerkId(clerkUserId: string): StoreResult<AppUser | undefined>;
  userHasHouseholdAccess(userId: string, householdId: string): StoreResult<boolean>;
  getMembership(userId: string, householdId: string): StoreResult<HouseholdMembership | undefined>;
  listHouseholdMembers(householdId: string): StoreResult<HouseholdMemberSummary[]>;
  updateMemberRole(
    householdId: string,
    userId: string,
    role: HouseholdMembership["role"]
  ): StoreResult<HouseholdMemberMutationResult>;
  updateTaskLibraryPermission(
    householdId: string,
    userId: string,
    update: TaskLibraryPermissionUpdate
  ): StoreResult<HouseholdMemberSummary | undefined>;
  removeMember(householdId: string, userId: string): StoreResult<HouseholdMemberMutationResult>;
  createInvitation(invitation: NewHouseholdInvitation): StoreResult<HouseholdInvitation>;
  listInvitations(householdId: string): StoreResult<HouseholdInvitation[]>;
  cancelInvitation(householdId: string, invitationId: string, cancelledAt: string): StoreResult<HouseholdInvitation | undefined>;
  findInvitationByTokenDigest(tokenDigest: string): StoreResult<StoredHouseholdInvitation | undefined>;
  acceptInvitation(invitationId: string, userId: string, acceptedAt: string): StoreResult<HouseholdInvitation | undefined>;
  listHouseholdsForUser(userId: string): StoreResult<Household[]>;
  createHouseholdForUser(name: string, userId: string): StoreResult<Household>;
  createHousehold(name: string): StoreResult<Household>;
  deleteHousehold(householdId: string): StoreResult<boolean>;
  listHouseholds(): StoreResult<Household[]>;
  updateProfile(
    householdId: string,
    update: { name: string; profile: HouseholdProfile }
  ): StoreResult<Household | undefined>;
  updateHouseholdSettings(
    householdId: string,
    update: { timeZone: string }
  ): StoreResult<Household | undefined>;
  getHousehold(householdId: string): StoreResult<Household | undefined>;
  getHouseholdStructure(householdId: string): StoreResult<HouseholdStructure | undefined>;
  saveHouseholdStructure(
    householdId: string,
    floors: HouseholdFloor[]
  ): StoreResult<HouseholdStructure | undefined>;
  createTask(householdId: string, task: CreateTaskInput): StoreResult<Task>;
  createTaskWithSchedules(input: NewScheduledTask): StoreResult<ScheduledTask>;
  updateTask(householdId: string, taskId: string, task: TaskUpdate): StoreResult<Task | undefined>;
  archiveTask(householdId: string, taskId: string): StoreResult<Task | undefined>;
  restoreTask(householdId: string, taskId: string): StoreResult<Task | undefined>;
  listTasks(householdId: string, options?: TaskListOptions): StoreResult<Task[]>;
  listAllTasks(options?: TaskListOptions): StoreResult<Task[]>;
  createSchedule(schedule: ScheduleInput & { householdId: string; taskId: string }): StoreResult<TaskSchedule>;
  listSchedules(householdId: string, taskId?: string): StoreResult<TaskSchedule[]>;
  updateSchedule(
    householdId: string,
    scheduleId: string,
    update: TaskScheduleUpdate
  ): StoreResult<TaskSchedule | undefined>;
  archiveSchedule(householdId: string, scheduleId: string): StoreResult<TaskSchedule | undefined>;
  materializeScheduleOccurrences(
    householdId: string,
    scheduleId: string,
    occurrences: TaskOccurrence[]
  ): StoreResult<TaskOccurrence[]>;
  listOccurrences(
    householdId: string,
    range: OccurrenceRange
  ): StoreResult<TaskOccurrence[]>;
  getOccurrence(householdId: string, occurrenceId: string): StoreResult<TaskOccurrence | undefined>;
  completeOccurrence(
    householdId: string,
    occurrenceId: string,
    completedByUserId: string,
    completedAt: string
  ): StoreResult<TaskOccurrence | undefined>;
  recordCompletionCheckIn(input: CompletionCheckInCreate): StoreResult<TaskCompletionCheckIn>;
  getCompletionCheckInForOccurrence(
    householdId: string,
    occurrenceId: string
  ): StoreResult<TaskCompletionCheckIn | undefined>;
  updateOccurrenceException(
    householdId: string,
    occurrenceId: string,
    update: OccurrenceUpdate
  ): StoreResult<TaskOccurrence | undefined>;
  updateOccurrenceTaskDetails(
    householdId: string,
    occurrenceId: string,
    update: OccurrenceTaskDetailsInput
  ): StoreResult<TaskOccurrence | undefined>;
  saveOccurrenceTaskToLibrary(householdId: string, occurrenceId: string): StoreResult<TaskOccurrence | undefined>;
  syncOccurrenceDetailsToTask(householdId: string, occurrenceId: string): StoreResult<TaskOccurrence | undefined>;
  resetOccurrenceTaskOverrides(householdId: string, occurrenceId: string): StoreResult<TaskOccurrence | undefined>;
  skipOccurrence(householdId: string, occurrenceId: string): StoreResult<TaskOccurrence | undefined>;
  clearFutureUntouchedOccurrences(householdId: string, scheduleId: string, cutoff: OccurrenceClearFutureCutoff): StoreResult<void>;
  saveRecommendations(
    householdId: string,
    recommendations: Recommendation[]
  ): StoreResult<Recommendation[]>;
  markRecommendationsStale(householdId: string): StoreResult<void>;
  listRecommendations(householdId: string): StoreResult<Recommendation[]>;
  listAllRecommendations(): StoreResult<Recommendation[]>;
  updateRecommendationDecision(
    householdId: string,
    recommendationId: string,
    update: RecommendationDecisionUpdate
  ): StoreResult<Recommendation | undefined>;
  applyRecommendationDecisions(householdId: string): StoreResult<ApplyRecommendationResult>;
  listCalendarImportPolicies(householdId: string): StoreResult<CalendarImportPolicy[]>;
  updateCalendarImportPolicy(
    householdId: string,
    memberId: string,
    update: Pick<CalendarImportPolicy, "importQueueMode" | "importContentMode">
  ): StoreResult<CalendarImportPolicy>;
  listCalendarConnections(userId: string): StoreResult<CalendarConnectionSummary[]>;
  upsertCalendarConnection(
    userId: string,
    input: CalendarConnectionSecretInput
  ): StoreResult<CalendarConnectionSummary>;
  updateCalendarConnectionTokens(
    userId: string,
    connectionId: string,
    update: Pick<CalendarConnectionSecretInput, "accessTokenEncrypted" | "refreshTokenEncrypted" | "tokenExpiresAt" | "scopes"> & {
      status?: CalendarConnectionStatus;
    }
  ): StoreResult<CalendarConnectionSummary | undefined>;
  updateCalendarConnectionStatus(userId: string, connectionId: string, status: CalendarConnectionStatus): StoreResult<CalendarConnectionSummary | undefined>;
  deleteCalendarConnection(userId: string, connectionId: string): StoreResult<boolean>;
  getCalendarConnectionSecrets(userId: string, connectionId: string): StoreResult<CalendarConnectionSecrets | undefined>;
  listExternalCalendars(userId: string): StoreResult<ExternalCalendarSummary[]>;
  upsertExternalCalendars(userId: string, connectionId: string, calendars: ExternalCalendarInput[]): StoreResult<ExternalCalendarSummary[]>;
  getCalendarPreferences(userId: string, householdId: string): StoreResult<CalendarPreferences>;
  updateCalendarPreferences(userId: string, householdId: string, update: CalendarPreferences): StoreResult<CalendarPreferences>;
  listCalendarImportQueue(householdId: string): StoreResult<CalendarImportQueueItem[]>;
  createCalendarImportQueueItem(input: CalendarImportQueueCreateInput): StoreResult<CalendarImportQueueItem>;
  listTaskInboxItems(householdId: string): StoreResult<{ items: TaskInboxItem[] }>;
  linkTaskInboxItem(
    householdId: string,
    kind: TaskInboxItemKind,
    itemId: string,
    taskId: string,
    scope: ImportScope
  ): StoreResult<CalendarImportQueueItem | Task | undefined>;
  saveTaskInboxItem(
    householdId: string,
    kind: TaskInboxItemKind,
    itemId: string,
    task: TaskDefinitionInput,
    scope: ImportScope
  ): StoreResult<CalendarImportQueueItem | Task | undefined>;
  keepTaskInboxItemOneTime(
    householdId: string,
    kind: TaskInboxItemKind,
    itemId: string
  ): StoreResult<CalendarImportQueueItem | Task | undefined>;
  upsertCalendarImportQueueReviewNotifications(householdId: string): StoreResult<AppNotification[]>;
  listNotificationsForUser(userId: string): StoreResult<AppNotification[]>;
  markNotificationsRead(userId: string, notificationIds: string[]): StoreResult<AppNotification[]>;
  decideCalendarImportQueueItem(
    householdId: string,
    queueItemId: string,
    ownerUserId: string,
    input: CalendarImportQueueDecisionInput
  ): StoreResult<CalendarImportQueueItem>;
  listCleanlyCalendarEvents(householdId: string, range?: CalendarEventRange): StoreResult<CleanlyCalendarEvent[]>;
  getCleanlyCalendarEvent(householdId: string, eventId: string): StoreResult<CleanlyCalendarEvent | undefined>;
  createExternalCalendarEventLink(input: {
    cleanlyCalendarEventId: string;
    connectionId: string;
    externalCalendarId: string;
    providerEventId: string;
    direction: "export";
  }): StoreResult<void>;
  hasExternalCalendarEventLink(cleanlyCalendarEventId: string, externalCalendarId: string): StoreResult<boolean>;
};

function normalizeRecommendation(recommendation: Recommendation): Recommendation {
  return {
    ...recommendation,
    decision: recommendation.decision ?? "pending"
  };
}

function normalizeInvitation(invitation: StoredHouseholdInvitation): StoredHouseholdInvitation {
  if (invitation.status !== "pending" || Date.parse(invitation.expiresAt) > Date.now()) {
    return invitation;
  }

  return {
    ...invitation,
    status: "expired"
  };
}

function compareOptionalPlannedStart(first?: string, second?: string) {
  if (first && second) return first.localeCompare(second);
  if (first) return -1;
  if (second) return 1;
  return 0;
}

function compareOccurrences(first: TaskOccurrence, second: TaskOccurrence) {
  return first.eligibleStartOn.localeCompare(second.eligibleStartOn) ||
    compareOptionalPlannedStart(first.plannedStartAt, second.plannedStartAt) ||
    first.sequence - second.sequence ||
    first.id.localeCompare(second.id);
}

export function createInMemoryStore(): HouseholdStore {
  const users = new Map<string, AppUser>();
  const memberships = new Map<string, HouseholdMembership>();
  const households = new Map<string, Household>();
  const householdFloors = new Map<string, HouseholdFloor[]>();
  const invitations = new Map<string, StoredHouseholdInvitation>();
  const tasks = new Map<string, Task[]>();
  const schedules = new Map<string, TaskSchedule>();
  const occurrences = new Map<string, TaskOccurrence>();
  const completionCheckIns = new Map<string, TaskCompletionCheckIn>();
  const recommendations = new Map<string, Recommendation[]>();
  const calendarImportPolicies = new Map<string, CalendarImportPolicy>();
  const calendarPreferences = new Map<string, CalendarPreferences>();
  const calendarImportQueueItems = new Map<string, CalendarImportQueueItem>();
  const notifications = new Map<string, AppNotification>();
  const cleanlyCalendarEvents = new Map<string, CleanlyCalendarEvent>();
  const externalCalendarEventLinks = new Set<string>();
  const calendarConnections = new Map<string, CalendarConnectionSecrets[]>();
  const externalCalendars = new Map<string, ExternalCalendarSummary[]>();

  function calendarPolicyKey(householdId: string, memberId: string) {
    return `${householdId}:${memberId}`;
  }

  function calendarPreferenceKey(userId: string, householdId: string) {
    return `${userId}:${householdId}`;
  }

  function calendarImportReviewNotificationKey(userId: string, householdId: string) {
    return `calendar_import_queue_review:${userId}:${householdId}`;
  }

  function pendingImportQueueCount(householdId: string) {
    return Array.from(calendarImportQueueItems.values()).filter(
      (item) => item.householdId === householdId && item.queueStatus === "pending"
    ).length;
  }

  function importReviewNotificationCopy(householdName: string, pendingCount: number) {
    const eventLabel = pendingCount === 1 ? "event is" : "events are";
    return {
      title: "Calendar imports need review",
      body: `${pendingCount} ${eventLabel} waiting in ${householdName}.`,
      targetPath: "/calendar?reviewImports=1"
    };
  }

  function refreshNotificationPendingCount(notification: AppNotification) {
    if (notification.type !== "calendar_import_queue_review" || !notification.householdId) {
      return notification;
    }
    const pendingCount = pendingImportQueueCount(notification.householdId);
    if (pendingCount <= 0) return undefined;
    const householdName = households.get(notification.householdId)?.name ?? notification.householdName ?? "Home";
    const copy = importReviewNotificationCopy(householdName, pendingCount);
    return {
      ...notification,
      householdName,
      ...copy,
      metadata: {
        ...notification.metadata,
        householdId: notification.householdId,
        pendingCount
      }
    };
  }

  function defaultCalendarPreference(householdId: string): CalendarPreferences {
    return {
      householdId,
      defaultDetailLevel: "busy_only",
      selectedSourceCalendarIds: [],
      exportMode: "off",
      exportContentMode: "chores"
    };
  }

  function memberDisplay(member: HouseholdMemberSummary) {
    return member.displayName ?? member.primaryEmail ?? member.clerkUserId;
  }

  function markStale(householdId: string) {
    const now = new Date().toISOString();
    recommendations.set(
      householdId,
      (recommendations.get(householdId) ?? []).map((recommendation) => ({
        ...recommendation,
        staleAt: recommendation.staleAt ?? now
      }))
    );
  }

  function replaceTask(householdId: string, taskId: string, update: (task: Task) => Task) {
    const householdTasks = tasks.get(householdId) ?? [];
    const existing = householdTasks.find((task) => task.id === taskId);
    if (!existing) return undefined;

    const updated = update(existing);
    tasks.set(
      householdId,
      householdTasks.map((task) => (task.id === taskId ? updated : task))
    );
    markStale(householdId);
    return updated;
  }

  function normalizeTaskTitle(title: string) {
    return title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  }

  function findSuggestedTask(householdId: string, title: string) {
    const normalizedTitle = normalizeTaskTitle(title);
    return (tasks.get(householdId) ?? []).find((task) =>
      task.libraryState === "saved" &&
      !task.archivedAt &&
      normalizeTaskTitle(task.title) === normalizedTitle
    );
  }

  function inboxStatusFromLinkStatus(status: CalendarImportQueueItem["taskLinkStatus"]): TaskInboxItem["status"] {
    if (status === "linked") return "linked";
    if (status === "saved") return "saved";
    if (status === "one_time") return "kept_one_time";
    return "needs_review";
  }

  function toPendingImportInboxItem(item: CalendarImportQueueItem): TaskInboxItem {
    const suggestedTask = findSuggestedTask(item.householdId, item.title);
    return {
      id: item.id,
      kind: "import_queue",
      householdId: item.householdId,
      status: inboxStatusFromLinkStatus(item.taskLinkStatus),
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

  function toOneTimeTaskInboxItem(task: Task): TaskInboxItem {
    const suggestedTask = findSuggestedTask(task.householdId, task.title);
    const schedule = Array.from(schedules.values()).find((candidate) =>
      candidate.householdId === task.householdId &&
      candidate.taskId === task.id &&
      !candidate.archivedAt
    );
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
      ...(schedule?.planningMode === "timed" ? {
        startsAt: `${schedule.startsOn}T${schedule.localStartTime}:00`,
        endsAt: `${schedule.startsOn}T${schedule.localEndTime}:00`
      } : {}),
      ...(suggestedTask ? {
        suggestedTaskId: suggestedTask.id,
        suggestedReason: "Matched by title"
      } : {})
    };
  }

  return {
    upsertUserByClerkId(clerkUserId, profile = {}) {
      const existing = Array.from(users.values()).find((user) => user.clerkUserId === clerkUserId);
      if (existing) {
        const updated = { ...existing, ...profile };
        users.set(updated.id, updated);
        return updated;
      }

      const user = { id: crypto.randomUUID(), clerkUserId, ...profile };
      users.set(user.id, user);
      return user;
    },

    getUserByClerkId(clerkUserId) {
      return Array.from(users.values()).find((user) => user.clerkUserId === clerkUserId);
    },

    userHasHouseholdAccess(userId, householdId) {
      return memberships.has(`${householdId}:${userId}`);
    },

    getMembership(userId, householdId) {
      return memberships.get(`${householdId}:${userId}`);
    },

    listHouseholdMembers(householdId) {
      return Array.from(memberships.values())
        .filter((membership) => membership.householdId === householdId)
        .flatMap((membership) => {
          const user = users.get(membership.userId);
          if (!user) return [];

          return [{
            ...membership,
            clerkUserId: user.clerkUserId,
            taskLibraryPermission: membership.role === "owner" ? "manage" : membership.taskLibraryPermission,
            ...(user.primaryEmail ? { primaryEmail: user.primaryEmail } : {}),
            ...(user.displayName ? { displayName: user.displayName } : {})
          } satisfies HouseholdMemberSummary];
        });
    },

    updateMemberRole(householdId, userId, role) {
      const key = `${householdId}:${userId}`;
      const membership = memberships.get(key);
      if (!membership) return { outcome: "not_found" };

      if (membership.role === "owner" && role === "member") {
        const ownerCount = Array.from(memberships.values()).filter(
          (candidate) => candidate.householdId === householdId && candidate.role === "owner"
        ).length;
        if (ownerCount <= 1) return { outcome: "last_owner" };
      }

      const updated = { ...membership, role };
      memberships.set(key, updated);
      return { outcome: "updated", membership: updated };
    },

    updateTaskLibraryPermission(householdId, userId, update) {
      const key = `${householdId}:${userId}`;
      const membership = memberships.get(key);
      if (!membership) return undefined;

      const updated = { ...membership, taskLibraryPermission: update.taskLibraryPermission };
      memberships.set(key, updated);
      const user = users.get(userId);
      if (!user) return undefined;

      return {
        ...updated,
        clerkUserId: user.clerkUserId,
        taskLibraryPermission: updated.role === "owner" ? "manage" : updated.taskLibraryPermission,
        ...(user.primaryEmail ? { primaryEmail: user.primaryEmail } : {}),
        ...(user.displayName ? { displayName: user.displayName } : {})
      };
    },

    removeMember(householdId, userId) {
      const key = `${householdId}:${userId}`;
      const membership = memberships.get(key);
      if (!membership) return { outcome: "not_found" };

      if (membership.role === "owner") {
        const ownerCount = Array.from(memberships.values()).filter(
          (candidate) => candidate.householdId === householdId && candidate.role === "owner"
        ).length;
        if (ownerCount <= 1) return { outcome: "last_owner" };
      }

      memberships.delete(key);
      return { outcome: "updated", membership };
    },

    createInvitation(invitation) {
      const created: StoredHouseholdInvitation = {
        id: crypto.randomUUID(),
        householdId: invitation.householdId,
        recipientEmail: invitation.recipientEmail,
        role: "member",
        status: "pending",
        invitedByUserId: invitation.invitedByUserId,
        expiresAt: invitation.expiresAt,
        createdAt: new Date().toISOString(),
        tokenDigest: invitation.tokenDigest
      };
      invitations.set(created.id, created);
      const { tokenDigest: _tokenDigest, ...publicInvitation } = created;
      return publicInvitation;
    },

    listInvitations(householdId) {
      return Array.from(invitations.values())
        .filter((invitation) => invitation.householdId === householdId)
        .map((invitation) => normalizeInvitation(invitation))
        .map(({ tokenDigest: _tokenDigest, ...invitation }) => invitation);
    },

    cancelInvitation(householdId, invitationId, cancelledAt) {
      const stored = invitations.get(invitationId);
      const invitation = stored ? normalizeInvitation(stored) : undefined;
      if (!invitation || invitation.householdId !== householdId || invitation.status !== "pending") {
        return undefined;
      }

      const updated: StoredHouseholdInvitation = {
        ...invitation,
        status: "cancelled",
        cancelledAt
      };
      invitations.set(invitationId, updated);
      const { tokenDigest: _tokenDigest, ...publicInvitation } = updated;
      return publicInvitation;
    },

    findInvitationByTokenDigest(tokenDigest) {
      const invitation = Array.from(invitations.values()).find((stored) => stored.tokenDigest === tokenDigest);
      return invitation ? normalizeInvitation(invitation) : undefined;
    },

    acceptInvitation(invitationId, userId, acceptedAt) {
      const stored = invitations.get(invitationId);
      const invitation = stored ? normalizeInvitation(stored) : undefined;
      if (!invitation || invitation.status !== "pending") return undefined;

      const updated: StoredHouseholdInvitation = {
        ...invitation,
        status: "accepted",
        acceptedAt,
        acceptedByUserId: userId
      };
      invitations.set(invitationId, updated);
      memberships.set(`${updated.householdId}:${userId}`, {
        householdId: updated.householdId,
        userId,
        role: "member",
        taskLibraryPermission: "view"
      });
      const { tokenDigest: _tokenDigest, ...publicInvitation } = updated;
      return publicInvitation;
    },

    listHouseholdsForUser(userId) {
      return Array.from(memberships.values())
        .filter((membership) => membership.userId === userId)
        .map((membership) => households.get(membership.householdId))
        .filter((household): household is Household => Boolean(household));
    },

    createHouseholdForUser(name, userId) {
      const household = { id: crypto.randomUUID(), name, timeZone: "America/New_York" };
      households.set(household.id, household);
      memberships.set(`${household.id}:${userId}`, {
        householdId: household.id,
        userId,
        role: "owner",
        taskLibraryPermission: "manage"
      });
      return household;
    },

    createHousehold(name) {
      const household = { id: crypto.randomUUID(), name, timeZone: "America/New_York" };
      households.set(household.id, household);
      return household;
    },

    deleteHousehold(householdId) {
      if (!households.has(householdId)) return false;

      households.delete(householdId);
      householdFloors.delete(householdId);
      tasks.delete(householdId);
      recommendations.delete(householdId);

      for (const [key, membership] of memberships.entries()) {
        if (membership.householdId === householdId) memberships.delete(key);
      }
      for (const [invitationId, invitation] of invitations.entries()) {
        if (invitation.householdId === householdId) invitations.delete(invitationId);
      }
      for (const [scheduleId, schedule] of schedules.entries()) {
        if (schedule.householdId === householdId) schedules.delete(scheduleId);
      }
      for (const [occurrenceId, occurrence] of occurrences.entries()) {
        if (occurrence.householdId === householdId) occurrences.delete(occurrenceId);
      }
      for (const [checkInId, checkIn] of completionCheckIns.entries()) {
        if (checkIn.householdId === householdId) completionCheckIns.delete(checkInId);
      }
      for (const [key, policy] of calendarImportPolicies.entries()) {
        if (policy.householdId === householdId) calendarImportPolicies.delete(key);
      }
      for (const [key, preferences] of calendarPreferences.entries()) {
        if (preferences.householdId === householdId) calendarPreferences.delete(key);
      }
      for (const [itemId, item] of calendarImportQueueItems.entries()) {
        if (item.householdId === householdId) calendarImportQueueItems.delete(itemId);
      }
      for (const [notificationId, notification] of notifications.entries()) {
        if (notification.householdId === householdId) notifications.delete(notificationId);
      }

      const deletedEventIds = new Set<string>();
      for (const [eventId, event] of cleanlyCalendarEvents.entries()) {
        if (event.householdId === householdId) {
          cleanlyCalendarEvents.delete(eventId);
          deletedEventIds.add(eventId);
        }
      }
      for (const link of externalCalendarEventLinks) {
        const [cleanlyCalendarEventId] = link.split(":");
        if (deletedEventIds.has(cleanlyCalendarEventId)) externalCalendarEventLinks.delete(link);
      }

      return true;
    },

    listHouseholds() {
      return Array.from(households.values());
    },

    updateProfile(householdId, update) {
      const household = households.get(householdId);
      if (!household) return undefined;

      const updated = { ...household, name: update.name, profile: update.profile };
      households.set(householdId, updated);
      return updated;
    },

    updateHouseholdSettings(householdId, update) {
      const household = households.get(householdId);
      if (!household) return undefined;

      const updated = { ...household, timeZone: update.timeZone };
      households.set(householdId, updated);
      return updated;
    },

    getHousehold(householdId) {
      return households.get(householdId);
    },

    getHouseholdStructure(householdId) {
      if (!households.has(householdId)) return undefined;
      return {
        householdId,
        floors: householdFloors.get(householdId) ?? []
      };
    },

    saveHouseholdStructure(householdId, floors) {
      if (!households.has(householdId)) return undefined;

      const normalized = floors.map((floor) => ({
        ...floor,
        householdId,
        rooms: floor.rooms.map((room) => ({
          ...room,
          floorId: floor.id
        }))
      }));
      householdFloors.set(householdId, normalized);

      return {
        householdId,
        floors: normalized
      };
    },

    createTask(householdId, task) {
      const createdTask: Task = { ...task, householdId, id: crypto.randomUUID() };
      tasks.set(householdId, [...(tasks.get(householdId) ?? []), createdTask]);
      markStale(householdId);
      return createdTask;
    },

    createTaskWithSchedules({ householdId, task, schedules: inputs }) {
      const createdTask: Task = { ...task, householdId, id: crypto.randomUUID() };
      const createdSchedules: TaskSchedule[] = inputs.map((schedule) => ({
        ...schedule,
        householdId,
        taskId: createdTask.id,
        id: crypto.randomUUID()
      }));
      tasks.set(householdId, [...(tasks.get(householdId) ?? []), createdTask]);
      createdSchedules.forEach((schedule) => schedules.set(schedule.id, schedule));
      markStale(householdId);
      return { task: createdTask, schedules: createdSchedules };
    },

    updateTask(householdId, taskId, task) {
      return replaceTask(householdId, taskId, (existing) => ({
        ...existing,
        ...task
      }));
    },

    archiveTask(householdId, taskId) {
      const archived = replaceTask(householdId, taskId, (existing) => ({
        ...existing,
        archivedAt: new Date().toISOString()
      }));
      if (!archived?.archivedAt) return archived;
      for (const [scheduleId, schedule] of schedules.entries()) {
        if (schedule.householdId === householdId && schedule.taskId === taskId && !schedule.archivedAt) {
          schedules.set(scheduleId, { ...schedule, archivedAt: archived.archivedAt });
        }
      }
      return archived;
    },

    restoreTask(householdId, taskId) {
      return replaceTask(householdId, taskId, (existing) => {
        const { archivedAt: _archivedAt, ...restored } = existing;
        return restored;
      });
    },

    listTasks(householdId, options = {}) {
      const householdTasks = tasks.get(householdId) ?? [];
      if (options.archivedOnly) return householdTasks.filter((task) => task.archivedAt);
      if (options.includeArchived) return householdTasks;
      return householdTasks.filter((task) => !task.archivedAt);
    },

    listAllTasks(options = {}) {
      const allTasks = Array.from(tasks.values())
        .flat()
        .map((task) => ({
          ...task,
          householdName: households.get(task.householdId)?.name
        }));
      if (options.archivedOnly) return allTasks.filter((task) => task.archivedAt);
      if (options.includeArchived) return allTasks;
      return allTasks.filter((task) => !task.archivedAt);
    },

    createSchedule(schedule) {
      const created = { ...schedule, id: crypto.randomUUID() };
      schedules.set(created.id, created);
      return created;
    },

    listSchedules(householdId, taskId) {
      return Array.from(schedules.values()).filter(
        (schedule) =>
          schedule.householdId === householdId &&
          (!taskId || schedule.taskId === taskId) &&
          !schedule.archivedAt
      );
    },

    updateSchedule(householdId, scheduleId, update) {
      const schedule = schedules.get(scheduleId);
      if (!schedule || schedule.householdId !== householdId || schedule.archivedAt) {
        return undefined;
      }

      const updated = { ...schedule, ...update };
      schedules.set(scheduleId, updated);
      return updated;
    },

    archiveSchedule(householdId, scheduleId) {
      const schedule = schedules.get(scheduleId);
      if (!schedule || schedule.householdId !== householdId || schedule.archivedAt) {
        return undefined;
      }

      const updated = { ...schedule, archivedAt: new Date().toISOString() };
      schedules.set(scheduleId, updated);
      return updated;
    },

    materializeScheduleOccurrences(householdId, scheduleId, nextOccurrences) {
      return nextOccurrences.map((occurrence) => {
        const key = occurrence.id;
        const existing = occurrences.get(key);
        if (existing) return existing;

        if (occurrence.householdId !== householdId || occurrence.scheduleId !== scheduleId) {
          return occurrence;
        }

        occurrences.set(key, occurrence);
        return occurrence;
      });
    },

    listOccurrences(householdId, range) {
      return Array.from(occurrences.values())
        .filter((occurrence) => {
          const inRange = occurrence.planningMode === "timed"
            ? Boolean(
                occurrence.plannedStartAt &&
                occurrence.plannedStartAt >= range.startAt &&
                occurrence.plannedStartAt <= range.endAt
              )
            : occurrence.eligibleEndOn >= range.startOn && occurrence.eligibleStartOn <= range.endOn;

          return (
            occurrence.householdId === householdId &&
            inRange &&
            !schedules.get(occurrence.scheduleId)?.archivedAt &&
            (!range.assignedUserId || occurrence.assignedUserId === range.assignedUserId)
          );
        })
        .sort(compareOccurrences);
    },

    getOccurrence(householdId, occurrenceId) {
      return Array.from(occurrences.values()).find(
        (candidate) => candidate.id === occurrenceId && candidate.householdId === householdId
      );
    },

    completeOccurrence(householdId, occurrenceId, completedByUserId, completedAt) {
      const occurrence = Array.from(occurrences.values()).find(
        (candidate) =>
          candidate.id === occurrenceId &&
          candidate.householdId === householdId &&
          candidate.assignedUserId === completedByUserId &&
          candidate.status === "planned"
      );
      if (!occurrence) return undefined;

      const updated: TaskOccurrence = {
        ...occurrence,
        status: "completed",
        completedAt,
        completedByUserId
      };
      occurrences.set(occurrence.id, updated);
      return updated;
    },

    recordCompletionCheckIn(input) {
      const existing = completionCheckIns.get(`${input.householdId}:${input.occurrenceId}`);
      const now = new Date().toISOString();
      const checkIn: TaskCompletionCheckIn = {
        id: existing?.id ?? crypto.randomUUID(),
        ...input,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      completionCheckIns.set(`${input.householdId}:${input.occurrenceId}`, checkIn);
      return checkIn;
    },

    getCompletionCheckInForOccurrence(householdId, occurrenceId) {
      return completionCheckIns.get(`${householdId}:${occurrenceId}`);
    },

    updateOccurrenceException(householdId, occurrenceId, update) {
      const occurrence = Array.from(occurrences.values()).find(
        (candidate) => candidate.id === occurrenceId && candidate.householdId === householdId
      );
      if (!occurrence) return undefined;

      const exceptionType: TaskOccurrence["exceptionType"] =
        update.plannedStartAt !== occurrence.plannedStartAt
          ? "rescheduled"
          : update.plannedEndAt !== occurrence.plannedEndAt
            ? "resized"
            : update.assignedUserId !== occurrence.assignedUserId
              ? "reassigned"
              : occurrence.exceptionType;
      const updated = { ...occurrence, ...update, exceptionType };
      occurrences.set(occurrence.id, updated);
      return updated;
    },

    updateOccurrenceTaskDetails(householdId, occurrenceId, update) {
      const occurrence = Array.from(occurrences.values()).find(
        (candidate) => candidate.id === occurrenceId && candidate.householdId === householdId
      );
      if (!occurrence) return undefined;

      const updated: TaskOccurrence = {
        ...occurrence,
        customTitle: update.title,
        customType: update.type,
        customInstructions: update.instructions,
        customTags: update.tags ?? [],
        hasTaskOverrides: true
      };
      occurrences.set(occurrence.id, updated);
      return updated;
    },

    saveOccurrenceTaskToLibrary(householdId, occurrenceId) {
      const occurrence = Array.from(occurrences.values()).find(
        (candidate) => candidate.id === occurrenceId && candidate.householdId === householdId
      );
      if (!occurrence) return undefined;

      const task = replaceTask(householdId, occurrence.taskId, (existing) => ({
        ...existing,
        libraryState: "saved"
      }));
      if (!task) return undefined;

      const updated: TaskOccurrence = {
        ...occurrence,
        hasTaskOverrides: false
      };
      occurrences.set(occurrence.id, updated);
      return updated;
    },

    syncOccurrenceDetailsToTask(householdId, occurrenceId) {
      const occurrence = Array.from(occurrences.values()).find(
        (candidate) => candidate.id === occurrenceId && candidate.householdId === householdId
      );
      if (!occurrence) return undefined;

      const task = replaceTask(householdId, occurrence.taskId, (existing) => ({
        ...existing,
        title: occurrence.customTitle ?? existing.title,
        type: occurrence.customType ?? existing.type,
        instructions: occurrence.customInstructions,
        tags: occurrence.customTags ?? existing.tags
      }));
      if (!task) return undefined;

      const updated: TaskOccurrence = {
        ...occurrence,
        customTitle: undefined,
        customType: undefined,
        customInstructions: undefined,
        customTags: undefined,
        hasTaskOverrides: false
      };
      occurrences.set(occurrence.id, updated);
      return updated;
    },

    resetOccurrenceTaskOverrides(householdId, occurrenceId) {
      const occurrence = Array.from(occurrences.values()).find(
        (candidate) => candidate.id === occurrenceId && candidate.householdId === householdId
      );
      if (!occurrence) return undefined;

      const updated: TaskOccurrence = {
        ...occurrence,
        customTitle: undefined,
        customType: undefined,
        customInstructions: undefined,
        customTags: undefined,
        hasTaskOverrides: false
      };
      occurrences.set(occurrence.id, updated);
      return updated;
    },

    skipOccurrence(householdId, occurrenceId) {
      const occurrence = Array.from(occurrences.values()).find(
        (candidate) => candidate.id === occurrenceId && candidate.householdId === householdId
      );
      if (!occurrence) return undefined;

      const updated: TaskOccurrence = { ...occurrence, exceptionType: "skipped", status: "skipped" };
      occurrences.set(occurrence.id, updated);
      return updated;
    },

    clearFutureUntouchedOccurrences(householdId, scheduleId, cutoff) {
      for (const [key, occurrence] of occurrences.entries()) {
        const isFutureUntouchedTimed =
          occurrence.planningMode === "timed" &&
          Boolean(occurrence.plannedStartAt && occurrence.plannedStartAt >= cutoff.fromAt);
        const isFutureUntouchedFlexible =
          occurrence.planningMode === "flexible" &&
          occurrence.eligibleEndOn >= cutoff.fromOn;

        if (
          occurrence.householdId === householdId &&
          occurrence.scheduleId === scheduleId &&
          occurrence.exceptionType === "none" &&
          occurrence.status === "planned" &&
          (isFutureUntouchedTimed || isFutureUntouchedFlexible)
        ) {
          occurrences.delete(key);
        }
      }
    },

    saveRecommendations(householdId, nextRecommendations) {
      const normalized = nextRecommendations.map(normalizeRecommendation);
      recommendations.set(householdId, normalized);
      return normalized;
    },

    markRecommendationsStale(householdId) {
      markStale(householdId);
    },

    listRecommendations(householdId) {
      return recommendations.get(householdId) ?? [];
    },

    listAllRecommendations() {
      return Array.from(recommendations.values()).flat();
    },

    updateRecommendationDecision(householdId, recommendationId, update) {
      const householdRecommendations = recommendations.get(householdId) ?? [];
      const existing = householdRecommendations.find((recommendation) => recommendation.id === recommendationId);
      if (!existing) return undefined;

      const updated = { ...existing, decision: update.decision };
      recommendations.set(
        householdId,
        householdRecommendations.map((recommendation) =>
          recommendation.id === recommendationId ? updated : recommendation
        )
      );
      return updated;
    },

    async listCalendarImportPolicies(householdId) {
      const members = await this.listHouseholdMembers(householdId);
      return members.map((member) => {
        const existing = calendarImportPolicies.get(calendarPolicyKey(householdId, member.userId));
        if (existing) return existing;
        return {
          householdId,
          memberId: member.userId,
          memberName: memberDisplay(member),
          ...(member.primaryEmail ? { memberEmail: member.primaryEmail } : {}),
          importQueueMode: "manual",
          importContentMode: "both"
        };
      });
    },

    async updateCalendarImportPolicy(householdId, memberId, update) {
      const members = await this.listHouseholdMembers(householdId);
      const member = members.find((item) => item.userId === memberId);
      if (!member) throw new Error("Household member not found");
      const policy: CalendarImportPolicy = {
        householdId,
        memberId,
        memberName: memberDisplay(member),
        ...(member.primaryEmail ? { memberEmail: member.primaryEmail } : {}),
        importQueueMode: update.importQueueMode,
        importContentMode: update.importContentMode
      };
      calendarImportPolicies.set(calendarPolicyKey(householdId, memberId), policy);
      return policy;
    },

    listCalendarConnections(userId) {
      return (calendarConnections.get(userId) ?? []).map(({ accessTokenEncrypted, refreshTokenEncrypted, ...connection }) => connection);
    },

    upsertCalendarConnection(userId, input) {
      const existing = (calendarConnections.get(userId) ?? []).find((connection) =>
        connection.provider === input.provider && connection.providerAccountEmail === input.providerAccountEmail
      );
      const connection: CalendarConnectionSecrets = {
        ...input,
        id: existing?.id ?? crypto.randomUUID(),
        status: input.status ?? "connected"
      };
      calendarConnections.set(userId, [
        ...(calendarConnections.get(userId) ?? []).filter((item) => item.id !== connection.id),
        connection
      ]);
      const { accessTokenEncrypted, refreshTokenEncrypted, ...summary } = connection;
      return summary;
    },

    updateCalendarConnectionTokens(userId, connectionId, update) {
      const connections = calendarConnections.get(userId) ?? [];
      const existing = connections.find((connection) => connection.id === connectionId);
      if (!existing) return undefined;
      const updated: CalendarConnectionSecrets = {
        ...existing,
        scopes: update.scopes ?? existing.scopes,
        status: update.status ?? existing.status,
        ...(update.tokenExpiresAt ? { tokenExpiresAt: update.tokenExpiresAt } : {}),
        ...(update.accessTokenEncrypted ? { accessTokenEncrypted: update.accessTokenEncrypted } : {}),
        ...(update.refreshTokenEncrypted ? { refreshTokenEncrypted: update.refreshTokenEncrypted } : {})
      };
      calendarConnections.set(userId, connections.map((connection) => connection.id === connectionId ? updated : connection));
      const { accessTokenEncrypted, refreshTokenEncrypted, ...summary } = updated;
      return summary;
    },

    updateCalendarConnectionStatus(userId, connectionId, status) {
      const connections = calendarConnections.get(userId) ?? [];
      const existing = connections.find((connection) => connection.id === connectionId);
      if (!existing) return undefined;
      const updated = { ...existing, status };
      calendarConnections.set(userId, connections.map((connection) => connection.id === connectionId ? updated : connection));
      const { accessTokenEncrypted, refreshTokenEncrypted, ...summary } = updated;
      return summary;
    },

    deleteCalendarConnection(userId, connectionId) {
      const connections = calendarConnections.get(userId) ?? [];
      const existing = connections.find((connection) => connection.id === connectionId);
      if (!existing) return false;
      calendarConnections.set(userId, connections.filter((connection) => connection.id !== connectionId));
      externalCalendars.set(userId, (externalCalendars.get(userId) ?? []).filter((calendar) => calendar.connectionId !== connectionId));
      return true;
    },

    getCalendarConnectionSecrets(userId, connectionId) {
      return (calendarConnections.get(userId) ?? []).find((connection) => connection.id === connectionId);
    },

    listExternalCalendars(userId) {
      return externalCalendars.get(userId) ?? [];
    },

    upsertExternalCalendars(userId, connectionId, calendars) {
      const existing = externalCalendars.get(userId) ?? [];
      const upserted = calendars.map((calendar) => {
        const existingCalendar = existing.find((item) =>
          item.connectionId === connectionId && item.providerCalendarId === calendar.providerCalendarId
        );
        return {
          ...calendar,
          id: existingCalendar?.id ?? crypto.randomUUID(),
          connectionId,
          isSelectedForImport: calendar.isSelectedForImport ?? existingCalendar?.isSelectedForImport ?? false,
          isSelectedForExport: calendar.isSelectedForExport ?? existingCalendar?.isSelectedForExport ?? false
        };
      });
      externalCalendars.set(userId, [
        ...existing.filter((calendar) =>
          calendar.connectionId !== connectionId ||
          !upserted.some((item) => item.providerCalendarId === calendar.providerCalendarId)
        ),
        ...upserted
      ]);
      return upserted;
    },

    getCalendarPreferences(userId, householdId) {
      return calendarPreferences.get(calendarPreferenceKey(userId, householdId)) ?? defaultCalendarPreference(householdId);
    },

    updateCalendarPreferences(userId, householdId, update) {
      const preference: CalendarPreferences = {
        ...update,
        householdId
      };
      calendarPreferences.set(calendarPreferenceKey(userId, householdId), preference);
      return preference;
    },

    listCalendarImportQueue(householdId) {
      return Array.from(calendarImportQueueItems.values())
        .filter((item) => item.householdId === householdId)
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
    },

    createCalendarImportQueueItem(input) {
      const item: CalendarImportQueueItem = {
        ...input,
        id: crypto.randomUUID(),
        queueStatus: "pending",
        taskLinkStatus: input.taskLinkStatus ?? "unreviewed",
        importScope: input.importScope ?? "single",
        createdAt: new Date().toISOString()
      };
      calendarImportQueueItems.set(item.id, item);
      return item;
    },

    listTaskInboxItems(householdId) {
      const pendingImports = Array.from(calendarImportQueueItems.values())
        .filter((item) => item.householdId === householdId && item.queueStatus === "pending")
        .map(toPendingImportInboxItem);
      const oneTimeTasks = (tasks.get(householdId) ?? [])
        .filter((task) => task.libraryState === "one_time" && !task.archivedAt)
        .map(toOneTimeTaskInboxItem);

      return {
        items: [...pendingImports, ...oneTimeTasks]
      };
    },

    linkTaskInboxItem(householdId, kind, itemId, taskId, scope) {
      const linkedTask = (tasks.get(householdId) ?? []).find((task) =>
        task.id === taskId &&
        task.householdId === householdId &&
        task.libraryState === "saved" &&
        !task.archivedAt
      );
      if (!linkedTask) return undefined;

      if (kind === "import_queue") {
        const item = calendarImportQueueItems.get(itemId);
        if (!item || item.householdId !== householdId || item.queueStatus !== "pending") return undefined;
        const updated: CalendarImportQueueItem = {
          ...item,
          linkedTaskId: linkedTask.id,
          taskLinkStatus: "linked",
          taskMatchReason: "Linked from Task inbox",
          importScope: scope
        };
        calendarImportQueueItems.set(item.id, updated);
        return updated;
      }

      if (kind === "task") {
        return replaceTask(householdId, itemId, (task) => ({
          ...task,
          libraryState: "one_time"
        }));
      }

      return undefined;
    },

    saveTaskInboxItem(householdId, kind, itemId, task, scope) {
      if (kind === "import_queue") {
        const item = calendarImportQueueItems.get(itemId);
        if (!item || item.householdId !== householdId || item.queueStatus !== "pending") return undefined;
        const createdTask: Task = {
          ...task,
          householdId,
          id: crypto.randomUUID(),
          libraryState: "saved"
        };
        tasks.set(householdId, [...(tasks.get(householdId) ?? []), createdTask]);
        const updated: CalendarImportQueueItem = {
          ...item,
          linkedTaskId: createdTask.id,
          taskLinkStatus: "saved",
          taskMatchReason: "Saved from Task inbox",
          importScope: scope
        };
        calendarImportQueueItems.set(item.id, updated);
        markStale(householdId);
        return updated;
      }

      if (kind === "task") {
        return replaceTask(householdId, itemId, (existing) => ({
          ...existing,
          ...task,
          libraryState: "saved"
        }));
      }

      return undefined;
    },

    keepTaskInboxItemOneTime(householdId, kind, itemId) {
      if (kind === "import_queue") {
        const item = calendarImportQueueItems.get(itemId);
        if (!item || item.householdId !== householdId || item.queueStatus !== "pending") return undefined;
        const updated: CalendarImportQueueItem = {
          ...item,
          taskLinkStatus: "one_time",
          taskMatchReason: "Kept one-time from Task inbox"
        };
        calendarImportQueueItems.set(item.id, updated);
        return updated;
      }

      if (kind === "task") {
        return replaceTask(householdId, itemId, (task) => ({
          ...task,
          libraryState: "one_time"
        }));
      }

      return undefined;
    },

    async upsertCalendarImportQueueReviewNotifications(householdId) {
      const pendingCount = pendingImportQueueCount(householdId);
      if (pendingCount <= 0) return [];
      const household = households.get(householdId);
      if (!household) return [];
      const owners = (await this.listHouseholdMembers(householdId)).filter((member) => member.role === "owner");
      const now = new Date().toISOString();
      return owners.map((owner) => {
        const key = calendarImportReviewNotificationKey(owner.userId, householdId);
        const existing = notifications.get(key);
        const copy = importReviewNotificationCopy(household.name, pendingCount);
        const notification: AppNotification = {
          id: existing?.id ?? crypto.randomUUID(),
          recipientUserId: owner.userId,
          type: "calendar_import_queue_review",
          householdId,
          householdName: household.name,
          ...copy,
          metadata: {
            householdId,
            pendingCount
          },
          readAt: null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        };
        notifications.set(key, notification);
        return notification;
      });
    },

    listNotificationsForUser(userId) {
      return Array.from(notifications.values())
        .filter((notification) => notification.recipientUserId === userId)
        .flatMap((notification) => {
          const refreshed = refreshNotificationPendingCount(notification);
          return refreshed ? [refreshed] : [];
        })
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
    },

    markNotificationsRead(userId, notificationIds) {
      const requestedIds = new Set(notificationIds);
      const now = new Date().toISOString();
      const updated: AppNotification[] = [];
      for (const [key, notification] of notifications.entries()) {
        if (notification.recipientUserId !== userId || !requestedIds.has(notification.id)) continue;
        const next = {
          ...notification,
          readAt: notification.readAt ?? now,
          updatedAt: now
        };
        notifications.set(key, next);
        const refreshed = refreshNotificationPendingCount(next);
        if (refreshed) updated.push(refreshed);
      }
      return updated;
    },

    decideCalendarImportQueueItem(householdId, queueItemId, _ownerUserId, input) {
      const item = calendarImportQueueItems.get(queueItemId);
      if (!item || item.householdId !== householdId) throw new Error("Calendar import queue item not found");
      if (item.queueStatus !== "pending") return item;
      const cleanlyEventId = `cleanly-event-${queueItemId}`;
      if (input.decision === "approve") {
        cleanlyCalendarEvents.set(cleanlyEventId, {
          id: cleanlyEventId,
          householdId,
          createdByUserId: item.submittedByUserId,
          type: input.proposedType ?? item.proposedType,
          title: item.title,
          privacyTitle: item.privacyTitle,
          detailLevel: item.detailLevel,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          timezone: "UTC",
          source: "google",
          status: "active"
        });
      }
      const updated: CalendarImportQueueItem = {
        ...item,
        proposedType: input.proposedType ?? item.proposedType,
        linkedTaskId: input.linkedTaskId ?? item.linkedTaskId,
        taskLinkStatus: input.taskLinkStatus ?? item.taskLinkStatus,
        taskMatchReason: input.taskMatchReason ?? item.taskMatchReason,
        importScope: input.importScope ?? item.importScope,
        queueStatus: input.decision === "approve" ? "approved" : "rejected",
        ...(input.decision === "approve" ? { createdCleanlyEventId: cleanlyEventId } : {})
      };
      calendarImportQueueItems.set(queueItemId, updated);
      return updated;
    },

    listCleanlyCalendarEvents(householdId, range) {
      return Array.from(cleanlyCalendarEvents.values())
        .filter((event) => event.householdId === householdId)
        .filter((event) => !range || (event.startsAt < range.endAt && event.endsAt > range.startAt))
        .sort((first, second) => first.startsAt.localeCompare(second.startsAt));
    },

    getCleanlyCalendarEvent(householdId, eventId) {
      const event = cleanlyCalendarEvents.get(eventId);
      return event?.householdId === householdId ? event : undefined;
    },

    createExternalCalendarEventLink(input) {
      externalCalendarEventLinks.add(`${input.cleanlyCalendarEventId}:${input.externalCalendarId}:${input.direction}:${input.providerEventId}`);
    },

    hasExternalCalendarEventLink(cleanlyCalendarEventId, externalCalendarId) {
      return Array.from(externalCalendarEventLinks).some((link) => link.startsWith(`${cleanlyCalendarEventId}:${externalCalendarId}:`));
    },

    applyRecommendationDecisions(householdId) {
      const householdRecommendations = recommendations.get(householdId) ?? [];
      const declined: Recommendation[] = [];
      const accepted = householdRecommendations.filter(
        (recommendation) => !recommendation.staleAt && recommendation.decision === "accepted"
      );
      householdRecommendations.forEach((recommendation) => {
        if (recommendation.staleAt) return recommendation;
        if (recommendation.decision === "declined") {
          declined.push(recommendation);
        }
      });
      return {
        applied: [],
        declined,
        requiresScheduleDraftDesign: accepted.length > 0
      };
    }
  };
}




