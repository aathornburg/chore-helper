import type {
  CalendarConnectionSummary,
  CalendarConnectionStatus,
  CalendarImportPolicy,
  CalendarImportQueueDecisionInput,
  CalendarImportQueueItem,
  CalendarPreferences,
  CleanlyCalendarEvent,
  Chore,
  ChoreCompletionCheckIn,
  ChoreDefinitionInput,
  ChoreOccurrence,
  ChoreSchedule,
  Household,
  HouseholdFloor,
  HouseholdInvitation,
  HouseholdMemberSummary,
  HouseholdProfile,
  HouseholdStructure,
  Recommendation,
  RecommendationDecision,
  ScheduleInput,
  ScheduledChore,
  ExternalCalendarSummary
} from "@chore-helper/shared";

export type StoreResult<T> = T | Promise<T>;

export type ChoreListOptions = {
  includeArchived?: boolean;
  archivedOnly?: boolean;
};

export type ChoreUpdate = ChoreDefinitionInput;
export type ChoreScheduleUpdate = ScheduleInput;
export type OccurrenceUpdate = Required<Pick<ChoreOccurrence, "plannedStartAt" | "plannedEndAt" | "assignedUserId">>;

export type OccurrenceRange = {
  startAt: string;
  endAt: string;
  startOn: string;
  endOn: string;
  assignedUserId?: string;
};
export type OccurrenceClearFutureCutoff =
  { fromAt: string; fromOn: string };

export type CompletionCheckInCreate = Omit<ChoreCompletionCheckIn, "id" | "createdAt" | "updatedAt">;

export type NewScheduledChore = {
  householdId: string;
  chore: ChoreDefinitionInput;
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
};

export type HouseholdMemberMutationResult =
  | { outcome: "updated"; membership: HouseholdMembership }
  | { outcome: "not_found" }
  | { outcome: "last_owner" };

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
  removeMember(householdId: string, userId: string): StoreResult<HouseholdMemberMutationResult>;
  createInvitation(invitation: NewHouseholdInvitation): StoreResult<HouseholdInvitation>;
  listInvitations(householdId: string): StoreResult<HouseholdInvitation[]>;
  cancelInvitation(householdId: string, invitationId: string, cancelledAt: string): StoreResult<HouseholdInvitation | undefined>;
  findInvitationByTokenDigest(tokenDigest: string): StoreResult<StoredHouseholdInvitation | undefined>;
  acceptInvitation(invitationId: string, userId: string, acceptedAt: string): StoreResult<HouseholdInvitation | undefined>;
  listHouseholdsForUser(userId: string): StoreResult<Household[]>;
  createHouseholdForUser(name: string, userId: string): StoreResult<Household>;
  createHousehold(name: string): StoreResult<Household>;
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
  createChoreWithSchedules(input: NewScheduledChore): StoreResult<ScheduledChore>;
  updateChore(householdId: string, choreId: string, chore: ChoreUpdate): StoreResult<Chore | undefined>;
  archiveChore(householdId: string, choreId: string): StoreResult<Chore | undefined>;
  restoreChore(householdId: string, choreId: string): StoreResult<Chore | undefined>;
  listChores(householdId: string, options?: ChoreListOptions): StoreResult<Chore[]>;
  listAllChores(options?: ChoreListOptions): StoreResult<Chore[]>;
  createSchedule(schedule: ScheduleInput & { householdId: string; choreId: string }): StoreResult<ChoreSchedule>;
  listSchedules(householdId: string, choreId?: string): StoreResult<ChoreSchedule[]>;
  updateSchedule(
    householdId: string,
    scheduleId: string,
    update: ChoreScheduleUpdate
  ): StoreResult<ChoreSchedule | undefined>;
  archiveSchedule(householdId: string, scheduleId: string): StoreResult<ChoreSchedule | undefined>;
  materializeScheduleOccurrences(
    householdId: string,
    scheduleId: string,
    occurrences: ChoreOccurrence[]
  ): StoreResult<ChoreOccurrence[]>;
  listOccurrences(
    householdId: string,
    range: OccurrenceRange
  ): StoreResult<ChoreOccurrence[]>;
  getOccurrence(householdId: string, occurrenceId: string): StoreResult<ChoreOccurrence | undefined>;
  completeOccurrence(
    householdId: string,
    occurrenceId: string,
    completedByUserId: string,
    completedAt: string
  ): StoreResult<ChoreOccurrence | undefined>;
  recordCompletionCheckIn(input: CompletionCheckInCreate): StoreResult<ChoreCompletionCheckIn>;
  getCompletionCheckInForOccurrence(
    householdId: string,
    occurrenceId: string
  ): StoreResult<ChoreCompletionCheckIn | undefined>;
  updateOccurrenceException(
    householdId: string,
    occurrenceId: string,
    update: OccurrenceUpdate
  ): StoreResult<ChoreOccurrence | undefined>;
  skipOccurrence(householdId: string, occurrenceId: string): StoreResult<ChoreOccurrence | undefined>;
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
  createCalendarImportQueueItem(input: Omit<CalendarImportQueueItem, "id" | "createdAt" | "queueStatus">): StoreResult<CalendarImportQueueItem>;
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

function compareOccurrences(first: ChoreOccurrence, second: ChoreOccurrence) {
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
  const chores = new Map<string, Chore[]>();
  const schedules = new Map<string, ChoreSchedule>();
  const occurrences = new Map<string, ChoreOccurrence>();
  const completionCheckIns = new Map<string, ChoreCompletionCheckIn>();
  const recommendations = new Map<string, Recommendation[]>();
  const calendarImportPolicies = new Map<string, CalendarImportPolicy>();
  const calendarPreferences = new Map<string, CalendarPreferences>();
  const calendarImportQueueItems = new Map<string, CalendarImportQueueItem>();
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

  function replaceChore(householdId: string, choreId: string, update: (chore: Chore) => Chore) {
    const householdChores = chores.get(householdId) ?? [];
    const existing = householdChores.find((chore) => chore.id === choreId);
    if (!existing) return undefined;

    const updated = update(existing);
    chores.set(
      householdId,
      householdChores.map((chore) => (chore.id === choreId ? updated : chore))
    );
    markStale(householdId);
    return updated;
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
        role: "member"
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
        role: "owner"
      });
      return household;
    },

    createHousehold(name) {
      const household = { id: crypto.randomUUID(), name, timeZone: "America/New_York" };
      households.set(household.id, household);
      return household;
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

    createChoreWithSchedules({ householdId, chore, schedules: inputs }) {
      const createdChore: Chore = { ...chore, householdId, id: crypto.randomUUID() };
      const createdSchedules: ChoreSchedule[] = inputs.map((schedule) => ({
        ...schedule,
        householdId,
        choreId: createdChore.id,
        id: crypto.randomUUID()
      }));
      chores.set(householdId, [...(chores.get(householdId) ?? []), createdChore]);
      createdSchedules.forEach((schedule) => schedules.set(schedule.id, schedule));
      markStale(householdId);
      return { chore: createdChore, schedules: createdSchedules };
    },

    updateChore(householdId, choreId, chore) {
      return replaceChore(householdId, choreId, (existing) => ({
        ...existing,
        ...chore
      }));
    },

    archiveChore(householdId, choreId) {
      return replaceChore(householdId, choreId, (existing) => ({
        ...existing,
        archivedAt: new Date().toISOString()
      }));
    },

    restoreChore(householdId, choreId) {
      return replaceChore(householdId, choreId, (existing) => {
        const { archivedAt: _archivedAt, ...restored } = existing;
        return restored;
      });
    },

    listChores(householdId, options = {}) {
      const householdChores = chores.get(householdId) ?? [];
      if (options.archivedOnly) return householdChores.filter((chore) => chore.archivedAt);
      if (options.includeArchived) return householdChores;
      return householdChores.filter((chore) => !chore.archivedAt);
    },

    listAllChores(options = {}) {
      const allChores = Array.from(chores.values())
        .flat()
        .map((chore) => ({
          ...chore,
          householdName: households.get(chore.householdId)?.name
        }));
      if (options.archivedOnly) return allChores.filter((chore) => chore.archivedAt);
      if (options.includeArchived) return allChores;
      return allChores.filter((chore) => !chore.archivedAt);
    },

    createSchedule(schedule) {
      const created = { ...schedule, id: crypto.randomUUID() };
      schedules.set(created.id, created);
      return created;
    },

    listSchedules(householdId, choreId) {
      return Array.from(schedules.values()).filter(
        (schedule) =>
          schedule.householdId === householdId &&
          (!choreId || schedule.choreId === choreId) &&
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

      const updated: ChoreOccurrence = {
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
      const checkIn: ChoreCompletionCheckIn = {
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

      const exceptionType: ChoreOccurrence["exceptionType"] =
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

    skipOccurrence(householdId, occurrenceId) {
      const occurrence = Array.from(occurrences.values()).find(
        (candidate) => candidate.id === occurrenceId && candidate.householdId === householdId
      );
      if (!occurrence) return undefined;

      const updated: ChoreOccurrence = { ...occurrence, exceptionType: "skipped", status: "skipped" };
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
        createdAt: new Date().toISOString()
      };
      calendarImportQueueItems.set(item.id, item);
      return item;
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
