-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "primaryEmail" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "householdId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "readAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "choreLibraryPermission" TEXT NOT NULL DEFAULT 'view',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdProfile" (
    "householdId" TEXT NOT NULL,
    "homeType" TEXT NOT NULL,
    "hasPets" BOOLEAN NOT NULL,
    "hasOutdoorSpace" BOOLEAN NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdProfile_pkey" PRIMARY KEY ("householdId")
);

-- CreateTable
CREATE TABLE "HouseholdInvitation" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "tokenDigest" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdFloor" (
    "dbId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "levelType" TEXT NOT NULL,
    "flooring" TEXT NOT NULL,
    "petImpact" TEXT NOT NULL,
    "robotVacuumCoverage" TEXT NOT NULL,
    "robotMopCoverage" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdFloor_pkey" PRIMARY KEY ("dbId")
);

-- CreateTable
CREATE TABLE "HouseholdRoom" (
    "dbId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "floorDbId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flooring" TEXT NOT NULL,
    "petImpact" TEXT NOT NULL,
    "robotVacuumCoverage" TEXT NOT NULL,
    "robotMopCoverage" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdRoom_pkey" PRIMARY KEY ("dbId")
);

-- CreateTable
CREATE TABLE "Chore" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "instructions" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreSchedule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "planningMode" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "weekDays" TEXT NOT NULL DEFAULT '[]',
    "monthlyPattern" TEXT,
    "monthlyDay" INTEGER,
    "monthlyWeek" INTEGER,
    "monthlyWeekday" INTEGER,
    "localStartTime" TEXT,
    "localEndTime" TEXT,
    "estimatedMinutes" INTEGER,
    "flexibleWindowRule" TEXT,
    "startsOn" TEXT NOT NULL,
    "endsOn" TEXT,
    "assignmentMode" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoreSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreScheduleAssignee" (
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ChoreScheduleAssignee_pkey" PRIMARY KEY ("scheduleId","userId")
);

-- CreateTable
CREATE TABLE "ChoreOccurrence" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "planningMode" TEXT NOT NULL,
    "plannedStartAt" TIMESTAMP(3),
    "plannedEndAt" TIMESTAMP(3),
    "estimatedMinutes" INTEGER NOT NULL,
    "eligibleStartOn" TEXT NOT NULL,
    "eligibleEndOn" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "exceptionType" TEXT NOT NULL DEFAULT 'none',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoreOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoreCompletionCheckIn" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "completedByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "completedOnTime" BOOLEAN NOT NULL,
    "durationAccurate" BOOLEAN NOT NULL,
    "keepAssignee" BOOLEAN NOT NULL,
    "rebaseFutureOccurrences" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoreCompletionCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "affectedChoreId" TEXT,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "proposedCadence" TEXT,
    "proposedEstimatedMinutes" INTEGER,
    "staleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalCalendar" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerCalendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "timezone" TEXT,
    "accessRole" TEXT,
    "isSelectedForImport" BOOLEAN NOT NULL DEFAULT false,
    "isSelectedForExport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarImportPolicy" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "importQueueMode" TEXT NOT NULL DEFAULT 'manual',
    "importContentMode" TEXT NOT NULL DEFAULT 'both',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarImportPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSharingPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "defaultDetailLevel" TEXT NOT NULL DEFAULT 'busy_only',
    "selectedSourceCalendarIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSharingPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarExportPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "exportMode" TEXT NOT NULL DEFAULT 'off',
    "exportContentMode" TEXT NOT NULL DEFAULT 'chores',
    "destinationExternalCalendarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarExportPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanlyCalendarEvent" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "privacyTitle" TEXT NOT NULL,
    "detailLevel" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleanlyCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarImportQueueItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "sourceConnectionId" TEXT,
    "sourceExternalCalendarId" TEXT,
    "providerEventId" TEXT,
    "proposedType" TEXT NOT NULL,
    "detailLevel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "privacyTitle" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "allowedPayloadJson" TEXT NOT NULL DEFAULT '{}',
    "queueStatus" TEXT NOT NULL DEFAULT 'pending',
    "ownerDecisionByUserId" TEXT,
    "ownerDecisionAt" TIMESTAMP(3),
    "createdCleanlyEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarImportQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarExportQueueItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "cleanlyCalendarEventId" TEXT NOT NULL,
    "destinationExternalCalendarId" TEXT,
    "queueStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarExportQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalCalendarEventLink" (
    "id" TEXT NOT NULL,
    "cleanlyCalendarEventId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalCalendarId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCalendarEventLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_primaryEmail_key" ON "User"("primaryEmail");

-- CreateIndex
CREATE UNIQUE INDEX "AppNotification_dedupeKey_key" ON "AppNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "AppNotification_recipientUserId_readAt_updatedAt_idx" ON "AppNotification"("recipientUserId", "readAt", "updatedAt");

-- CreateIndex
CREATE INDEX "AppNotification_householdId_type_idx" ON "AppNotification"("householdId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_householdId_userId_key" ON "HouseholdMember"("householdId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdInvitation_tokenDigest_key" ON "HouseholdInvitation"("tokenDigest");

-- CreateIndex
CREATE INDEX "HouseholdInvitation_householdId_recipientEmail_idx" ON "HouseholdInvitation"("householdId", "recipientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdFloor_householdId_id_key" ON "HouseholdFloor"("householdId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdRoom_floorDbId_id_key" ON "HouseholdRoom"("floorDbId", "id");

-- CreateIndex
CREATE INDEX "ChoreSchedule_householdId_choreId_idx" ON "ChoreSchedule"("householdId", "choreId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreScheduleAssignee_scheduleId_position_key" ON "ChoreScheduleAssignee"("scheduleId", "position");

-- CreateIndex
CREATE INDEX "ChoreOccurrence_scheduleId_sequence_idx" ON "ChoreOccurrence"("scheduleId", "sequence");

-- CreateIndex
CREATE INDEX "ChoreOccurrence_householdId_eligibleStartOn_eligibleEndOn_idx" ON "ChoreOccurrence"("householdId", "eligibleStartOn", "eligibleEndOn");

-- CreateIndex
CREATE INDEX "ChoreOccurrence_householdId_planningMode_plannedStartAt_idx" ON "ChoreOccurrence"("householdId", "planningMode", "plannedStartAt");

-- CreateIndex
CREATE INDEX "ChoreOccurrence_householdId_planningMode_eligibleEndOn_elig_idx" ON "ChoreOccurrence"("householdId", "planningMode", "eligibleEndOn", "eligibleStartOn");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreCompletionCheckIn_occurrenceId_key" ON "ChoreCompletionCheckIn"("occurrenceId");

-- CreateIndex
CREATE INDEX "ChoreCompletionCheckIn_householdId_completedAt_idx" ON "ChoreCompletionCheckIn"("householdId", "completedAt");

-- CreateIndex
CREATE INDEX "ChoreCompletionCheckIn_householdId_choreId_idx" ON "ChoreCompletionCheckIn"("householdId", "choreId");

-- CreateIndex
CREATE INDEX "ChoreCompletionCheckIn_householdId_scheduleId_idx" ON "ChoreCompletionCheckIn"("householdId", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoreCompletionCheckIn_householdId_occurrenceId_key" ON "ChoreCompletionCheckIn"("householdId", "occurrenceId");

-- CreateIndex
CREATE INDEX "CalendarConnection_userId_provider_idx" ON "CalendarConnection"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCalendar_connectionId_providerCalendarId_key" ON "ExternalCalendar"("connectionId", "providerCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarImportPolicy_householdId_memberId_key" ON "CalendarImportPolicy"("householdId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSharingPreference_userId_householdId_key" ON "CalendarSharingPreference"("userId", "householdId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarExportPreference_userId_householdId_key" ON "CalendarExportPreference"("userId", "householdId");

-- CreateIndex
CREATE INDEX "CleanlyCalendarEvent_householdId_startsAt_idx" ON "CleanlyCalendarEvent"("householdId", "startsAt");

-- CreateIndex
CREATE INDEX "CleanlyCalendarEvent_householdId_type_idx" ON "CleanlyCalendarEvent"("householdId", "type");

-- CreateIndex
CREATE INDEX "CalendarImportQueueItem_householdId_queueStatus_createdAt_idx" ON "CalendarImportQueueItem"("householdId", "queueStatus", "createdAt");

-- CreateIndex
CREATE INDEX "CalendarImportQueueItem_submittedByUserId_createdAt_idx" ON "CalendarImportQueueItem"("submittedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CalendarExportQueueItem_userId_queueStatus_createdAt_idx" ON "CalendarExportQueueItem"("userId", "queueStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCalendarEventLink_connectionId_externalCalendarId_p_key" ON "ExternalCalendarEventLink"("connectionId", "externalCalendarId", "providerEventId", "direction");

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdProfile" ADD CONSTRAINT "HouseholdProfile_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvitation" ADD CONSTRAINT "HouseholdInvitation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvitation" ADD CONSTRAINT "HouseholdInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdFloor" ADD CONSTRAINT "HouseholdFloor_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdRoom" ADD CONSTRAINT "HouseholdRoom_floorDbId_fkey" FOREIGN KEY ("floorDbId") REFERENCES "HouseholdFloor"("dbId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chore" ADD CONSTRAINT "Chore_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSchedule" ADD CONSTRAINT "ChoreSchedule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreSchedule" ADD CONSTRAINT "ChoreSchedule_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreScheduleAssignee" ADD CONSTRAINT "ChoreScheduleAssignee_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ChoreSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreScheduleAssignee" ADD CONSTRAINT "ChoreScheduleAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreOccurrence" ADD CONSTRAINT "ChoreOccurrence_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreOccurrence" ADD CONSTRAINT "ChoreOccurrence_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreOccurrence" ADD CONSTRAINT "ChoreOccurrence_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ChoreSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreOccurrence" ADD CONSTRAINT "ChoreOccurrence_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreCompletionCheckIn" ADD CONSTRAINT "ChoreCompletionCheckIn_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreCompletionCheckIn" ADD CONSTRAINT "ChoreCompletionCheckIn_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreCompletionCheckIn" ADD CONSTRAINT "ChoreCompletionCheckIn_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ChoreSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreCompletionCheckIn" ADD CONSTRAINT "ChoreCompletionCheckIn_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ChoreOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoreCompletionCheckIn" ADD CONSTRAINT "ChoreCompletionCheckIn_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendar" ADD CONSTRAINT "ExternalCalendar_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarImportPolicy" ADD CONSTRAINT "CalendarImportPolicy_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarImportPolicy" ADD CONSTRAINT "CalendarImportPolicy_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSharingPreference" ADD CONSTRAINT "CalendarSharingPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSharingPreference" ADD CONSTRAINT "CalendarSharingPreference_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarExportPreference" ADD CONSTRAINT "CalendarExportPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarExportPreference" ADD CONSTRAINT "CalendarExportPreference_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarExportPreference" ADD CONSTRAINT "CalendarExportPreference_destinationExternalCalendarId_fkey" FOREIGN KEY ("destinationExternalCalendarId") REFERENCES "ExternalCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanlyCalendarEvent" ADD CONSTRAINT "CleanlyCalendarEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanlyCalendarEvent" ADD CONSTRAINT "CleanlyCalendarEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarImportQueueItem" ADD CONSTRAINT "CalendarImportQueueItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarImportQueueItem" ADD CONSTRAINT "CalendarImportQueueItem_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarImportQueueItem" ADD CONSTRAINT "CalendarImportQueueItem_sourceConnectionId_fkey" FOREIGN KEY ("sourceConnectionId") REFERENCES "CalendarConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarImportQueueItem" ADD CONSTRAINT "CalendarImportQueueItem_sourceExternalCalendarId_fkey" FOREIGN KEY ("sourceExternalCalendarId") REFERENCES "ExternalCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarImportQueueItem" ADD CONSTRAINT "CalendarImportQueueItem_ownerDecisionByUserId_fkey" FOREIGN KEY ("ownerDecisionByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarImportQueueItem" ADD CONSTRAINT "CalendarImportQueueItem_createdCleanlyEventId_fkey" FOREIGN KEY ("createdCleanlyEventId") REFERENCES "CleanlyCalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarExportQueueItem" ADD CONSTRAINT "CalendarExportQueueItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarExportQueueItem" ADD CONSTRAINT "CalendarExportQueueItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarExportQueueItem" ADD CONSTRAINT "CalendarExportQueueItem_cleanlyCalendarEventId_fkey" FOREIGN KEY ("cleanlyCalendarEventId") REFERENCES "CleanlyCalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarExportQueueItem" ADD CONSTRAINT "CalendarExportQueueItem_destinationExternalCalendarId_fkey" FOREIGN KEY ("destinationExternalCalendarId") REFERENCES "ExternalCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarEventLink" ADD CONSTRAINT "ExternalCalendarEventLink_cleanlyCalendarEventId_fkey" FOREIGN KEY ("cleanlyCalendarEventId") REFERENCES "CleanlyCalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarEventLink" ADD CONSTRAINT "ExternalCalendarEventLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendarEventLink" ADD CONSTRAINT "ExternalCalendarEventLink_externalCalendarId_fkey" FOREIGN KEY ("externalCalendarId") REFERENCES "ExternalCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
