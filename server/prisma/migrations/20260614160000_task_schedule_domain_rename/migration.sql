ALTER TABLE "HouseholdMember" RENAME COLUMN "choreLibraryPermission" TO "taskLibraryPermission";

ALTER TABLE "Chore" RENAME TO "Task";
ALTER TABLE "ChoreSchedule" RENAME TO "TaskSchedule";
ALTER TABLE "ChoreScheduleAssignee" RENAME TO "TaskScheduleAssignee";
ALTER TABLE "ChoreOccurrence" RENAME TO "TaskOccurrence";
ALTER TABLE "ChoreCompletionCheckIn" RENAME TO "TaskCompletionCheckIn";

ALTER TABLE "TaskSchedule" RENAME COLUMN "choreId" TO "taskId";
ALTER TABLE "TaskOccurrence" RENAME COLUMN "choreId" TO "taskId";
ALTER TABLE "TaskCompletionCheckIn" RENAME COLUMN "choreId" TO "taskId";
ALTER TABLE "Recommendation" RENAME COLUMN "affectedChoreId" TO "affectedTaskId";

ALTER TABLE "Task" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'chore';
ALTER TABLE "Task" ADD COLUMN "libraryState" TEXT NOT NULL DEFAULT 'saved';

ALTER TABLE "CalendarImportQueueItem" ADD COLUMN "linkedTaskId" TEXT;
ALTER TABLE "CalendarImportQueueItem" ADD COLUMN "taskLinkStatus" TEXT NOT NULL DEFAULT 'unreviewed';
ALTER TABLE "CalendarImportQueueItem" ADD COLUMN "taskMatchReason" TEXT;
ALTER TABLE "CalendarImportQueueItem" ADD COLUMN "importScope" TEXT NOT NULL DEFAULT 'single';

ALTER INDEX IF EXISTS "ChoreSchedule_householdId_choreId_idx" RENAME TO "TaskSchedule_householdId_taskId_idx";
ALTER INDEX IF EXISTS "ChoreCompletionCheckIn_householdId_choreId_idx" RENAME TO "TaskCompletionCheckIn_householdId_taskId_idx";

CREATE INDEX "Task_householdId_libraryState_idx" ON "Task"("householdId", "libraryState");
CREATE INDEX "Task_householdId_type_idx" ON "Task"("householdId", "type");
