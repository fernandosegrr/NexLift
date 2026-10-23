-- REVIEW ONLY: offline Prisma diff of received -> Phase6 schema. NOT executable migration.
-- Required columns need the conservative backfill and SQL guards/triggers in the actual versioned migration.
-- DropForeignKey
ALTER TABLE "Exercise" DROP CONSTRAINT "Exercise_routineDayId_fkey";

-- DropForeignKey
ALTER TABLE "WorkoutLog" DROP CONSTRAINT "WorkoutLog_exerciseId_fkey";

-- DropForeignKey
ALTER TABLE "SuggestionLog" DROP CONSTRAINT "SuggestionLog_exerciseId_fkey";

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "routineDayId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WorkoutLog" ADD COLUMN     "contextCapturedAt" TIMESTAMP(3),
ADD COLUMN     "exerciseNameSnapshot" TEXT NOT NULL,
ADD COLUMN     "isUnilateralSnapshot" BOOLEAN,
ADD COLUMN     "muscleGroupSnapshot" TEXT,
ADD COLUMN     "originRoutineDayId" TEXT,
ADD COLUMN     "originRoutineId" TEXT,
ADD COLUMN     "snapshotSource" TEXT NOT NULL DEFAULT 'recorded',
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PersonalRecord" ADD COLUMN     "sourceExerciseId" TEXT;

-- CreateIndex
CREATE INDEX "Exercise_userId_archivedAt_idx" ON "Exercise"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "WorkoutLog_userId_date_idx" ON "WorkoutLog"("userId", "date");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_routineDayId_fkey" FOREIGN KEY ("routineDayId") REFERENCES "RoutineDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutLog" ADD CONSTRAINT "WorkoutLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_sourceExerciseId_fkey" FOREIGN KEY ("sourceExerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionLog" ADD CONSTRAINT "SuggestionLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

