ALTER TABLE "TaskOccurrence"
ADD COLUMN "customTitle" TEXT,
ADD COLUMN "customType" TEXT,
ADD COLUMN "customInstructions" TEXT,
ADD COLUMN "customTags" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN "hasTaskOverrides" BOOLEAN NOT NULL DEFAULT false;
