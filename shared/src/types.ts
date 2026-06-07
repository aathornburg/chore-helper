/*
  These shared TypeScript types are like Angular model interfaces. They
  define the contract between frontend components, services, and backend
  APIs in a way that is enforced by the compiler.
*/
export type HomeType = "house" | "apartment" | "condo" | "townhouse" | "other";

export type HouseholdProfile = {
  homeType: HomeType;
  hasPets: boolean;
  hasOutdoorSpace: boolean;
  notes?: string;
};

export type CoverageLevel = "none" | "partial" | "most" | "all";
export type PetImpact = "none" | "low" | "medium" | "high";
export type RoomOverride<T> = T | "inherit";

export type FlooringSurface =
  | "hardwood"
  | "tile"
  | "carpet"
  | "rugs"
  | "vinyl"
  | "laminate"
  | "concrete"
  | "mats"
  | "mixed"
  | "other";

export type FloorLevelType = "upstairs" | "main" | "basement" | "other";

export type HouseholdRoom = {
  id: string;
  floorId: string;
  name: string;
  flooring: FlooringSurface[];
  petImpact: RoomOverride<PetImpact>;
  robotVacuumCoverage: RoomOverride<CoverageLevel>;
  robotMopCoverage: RoomOverride<CoverageLevel>;
  notes?: string;
};

export type HouseholdFloor = {
  id: string;
  householdId: string;
  name: string;
  levelType: FloorLevelType;
  flooring: FlooringSurface[];
  petImpact: PetImpact;
  robotVacuumCoverage: CoverageLevel;
  robotMopCoverage: CoverageLevel;
  notes?: string;
  rooms: HouseholdRoom[];
};

export type HouseholdStructure = {
  householdId: string;
  floors: HouseholdFloor[];
};

export type Household = {
  id: string;
  name: string;
  timeZone: string;
  profile?: HouseholdProfile;
};

export type AppUserProfile = {
  id: string;
  clerkUserId: string;
  primaryEmail?: string;
  displayName?: string;
};

export type HouseholdMemberSummary = {
  householdId: string;
  userId: string;
  clerkUserId: string;
  primaryEmail?: string;
  displayName?: string;
  role: "owner" | "member";
};

export type HouseholdInvitationStatus = "pending" | "accepted" | "cancelled" | "expired";

export type HouseholdInvitation = {
  id: string;
  householdId: string;
  recipientEmail: string;
  role: "member";
  status: HouseholdInvitationStatus;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
  cancelledAt?: string;
  createdAt: string;
};

export type RecurrenceFrequency = "one_time" | "daily" | "weekly" | "monthly" | "yearly";

export type ChoreScheduleRecurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
  weekDays?: number[];
  monthlyPattern?: "day_of_month" | "weekday_of_month";
  monthlyDay?: number;
  monthlyWeek?: number;
  monthlyWeekday?: number;
};

export type ChoreScheduleAssignment = {
  mode: "fixed" | "rotation";
  memberUserIds: string[];
};

export type SchedulePlanningMode = "timed" | "flexible";
export type FlexibleWindowRule = "once_within_selected_days" | "each_selected_day";

export type ChoreScheduleBase = {
  id: string;
  householdId: string;
  choreId: string;
  planningMode: SchedulePlanningMode;
  recurrence: ChoreScheduleRecurrence;
  startsOn: string;
  endsOn?: string;
  assignment: ChoreScheduleAssignment;
  archivedAt?: string;
};

export type TimedChoreSchedule = ChoreScheduleBase & {
  planningMode: "timed";
  localStartTime: string;
  localEndTime: string;
};

export type FlexibleChoreSchedule = ChoreScheduleBase & {
  planningMode: "flexible";
  estimatedMinutes: number;
  flexibleWindowRule: FlexibleWindowRule;
};

export type ChoreSchedule = TimedChoreSchedule | FlexibleChoreSchedule;

export type OccurrenceExceptionType = "none" | "rescheduled" | "resized" | "reassigned" | "skipped";

export type ChoreOccurrence = {
  id: string;
  householdId: string;
  choreId: string;
  scheduleId: string;
  sequence: number;
  planningMode: SchedulePlanningMode;
  plannedStartAt?: string;
  plannedEndAt?: string;
  estimatedMinutes: number;
  eligibleStartOn: string;
  eligibleEndOn: string;
  assignedUserId: string;
  exceptionType: OccurrenceExceptionType;
  status: "planned" | "completed" | "skipped";
  completedAt?: string;
  completedByUserId?: string;
};

export type Chore = {
  id: string;
  householdId: string;
  householdName?: string;
  title: string;
  source: "manual" | "google-calendar";
  instructions?: string;
  tags?: string[];
  archivedAt?: string;
};

export type ChoreDefinitionInput = Omit<Chore, "id" | "householdId" | "householdName" | "archivedAt">;
export type ScheduleInput =
  | Omit<TimedChoreSchedule, "id" | "householdId" | "choreId" | "archivedAt">
  | Omit<FlexibleChoreSchedule, "id" | "householdId" | "choreId" | "archivedAt">;
export type CreateScheduledChoreInput = {
  chore: ChoreDefinitionInput;
  schedules: ScheduleInput[];
};
export type ScheduledChore = {
  chore: Chore;
  schedules: ChoreSchedule[];
};

export type CompletionCheckInInput = {
  completedOnTime?: boolean;
  durationAccurate?: boolean;
  keepAssignee?: boolean;
  rebaseFutureOccurrences?: boolean;
};

export type ChoreCompletionCheckIn = {
  id: string;
  householdId: string;
  occurrenceId: string;
  completedByUserId: string;
  completedAt: string;
  completedOnTime: boolean;
  durationAccurate: boolean;
  keepAssignee: boolean;
  rebaseFutureOccurrences: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChoreReviewState = "unreviewed" | "recommendation-pending" | "reviewed";

export type RecommendationConfidence = "low" | "medium" | "high";
export type RecommendationDecision = "pending" | "accepted" | "declined" | "applied";

export type Recommendation = {
  id: string;
  householdId: string;
  affectedChoreId?: string;
  title: string;
  rationale: string;
  confidence: RecommendationConfidence;
  status: "pending" | "accepted" | "skipped";
  decision?: RecommendationDecision;
  proposedCadence?: string;
  proposedEstimatedMinutes?: number;
  staleAt?: string;
};

export type ChoreAppData = Chore & {
  recommendations: Recommendation[];
};

export type HouseholdAppData = Household & {
  structure: HouseholdStructure;
  chores: ChoreAppData[];
  recommendations: Recommendation[];
};

export type CalendarProvider = "google";
export type CalendarConnectionStatus = "connected" | "expired" | "revoked" | "error";
export type CalendarSyncMode = "off" | "manual" | "auto";
export type CalendarExportMode = "off" | "review" | "auto";
export type CalendarContentMode = "chores" | "commitments" | "both";
export type CalendarDetailLevel = "busy_only" | "full_details";
export type CleanlyCalendarEventType = "chore" | "commitment";
export type CalendarQueueStatus = "pending" | "approved" | "rejected" | "auto_added" | "needs_member";
export type CalendarExportQueueStatus = "pending" | "approved" | "rejected" | "exported";
export type AppNotificationType = "calendar_import_queue_review";

export type CalendarConnectionSummary = {
  id: string;
  provider: CalendarProvider;
  providerAccountEmail: string;
  status: CalendarConnectionStatus;
  scopes: string[];
  tokenExpiresAt?: string;
  lastSyncedAt?: string;
};

export type ExternalCalendarSummary = {
  id: string;
  connectionId: string;
  providerCalendarId: string;
  name: string;
  color?: string;
  timezone?: string;
  accessRole?: string;
  isSelectedForImport: boolean;
  isSelectedForExport: boolean;
};

export type CalendarImportPolicy = {
  householdId: string;
  memberId: string;
  memberName: string;
  memberEmail?: string;
  importQueueMode: CalendarSyncMode;
  importContentMode: CalendarContentMode;
};

export type CalendarPreferences = {
  householdId: string;
  defaultDetailLevel: CalendarDetailLevel;
  selectedSourceCalendarIds: string[];
  exportMode: CalendarExportMode;
  exportContentMode: CalendarContentMode;
  destinationExternalCalendarId?: string;
};

export type CalendarImportQueueItem = {
  id: string;
  householdId: string;
  submittedByUserId: string;
  submittedByName: string;
  sourceExternalCalendarId?: string;
  providerEventId?: string;
  proposedType: CleanlyCalendarEventType;
  detailLevel: CalendarDetailLevel;
  title: string;
  privacyTitle: string;
  startsAt: string;
  endsAt: string;
  queueStatus: CalendarQueueStatus;
  createdCleanlyEventId?: string;
  createdAt: string;
};

export type CalendarImportQueueDecisionInput = {
  decision: "approve" | "reject";
  proposedType?: CleanlyCalendarEventType;
};

export type AppNotification = {
  id: string;
  recipientUserId: string;
  type: AppNotificationType;
  householdId?: string;
  householdName?: string;
  title: string;
  body: string;
  targetPath: string;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppNotificationList = {
  unreadTaskCount: number;
  notifications: AppNotification[];
};

export type CalendarImportCandidate = {
  id: string;
  sourceExternalCalendarId: string;
  providerEventId: string;
  title: string;
  privacyTitle: string;
  startsAt: string;
  endsAt: string;
  proposedType: CleanlyCalendarEventType;
  detailLevel: CalendarDetailLevel;
};

export type CleanlyCalendarEvent = {
  id: string;
  householdId: string;
  createdByUserId: string;
  type: CleanlyCalendarEventType;
  title: string;
  privacyTitle: string;
  detailLevel: CalendarDetailLevel;
  startsAt: string;
  endsAt: string;
  timezone: string;
  source: "manual" | "google";
  status: "active" | "cancelled";
};
