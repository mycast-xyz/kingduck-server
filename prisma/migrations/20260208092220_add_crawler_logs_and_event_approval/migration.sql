-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CrawlerStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" INTEGER,
ADD COLUMN     "status" "EventStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "crawler_logs" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "crawler_type" TEXT NOT NULL,
    "status" "CrawlerStatus" NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "items_found" INTEGER,
    "error_msg" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawler_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crawler_logs_game_id_crawler_type_start_time_idx" ON "crawler_logs"("game_id", "crawler_type", "start_time");

-- CreateIndex
CREATE INDEX "calendar_events_status_idx" ON "calendar_events"("status");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawler_logs" ADD CONSTRAINT "crawler_logs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
