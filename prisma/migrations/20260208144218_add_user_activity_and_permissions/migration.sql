-- AlterTable
ALTER TABLE "users" ADD COLUMN     "permissions" JSONB;

-- CreateTable
CREATE TABLE "user_activity_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_activity_logs_user_id_idx" ON "user_activity_logs"("user_id");

-- CreateIndex
CREATE INDEX "user_activity_logs_action_idx" ON "user_activity_logs"("action");

-- CreateIndex
CREATE INDEX "user_activity_logs_created_at_idx" ON "user_activity_logs"("created_at");

-- AddForeignKey
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
