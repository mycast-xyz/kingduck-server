-- CreateTable
CREATE TABLE "redeem_groups" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "period_text" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redeem_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redeem_codes" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "reward" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redeem_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "redeem_groups_game_id_idx" ON "redeem_groups"("game_id");

-- CreateIndex
CREATE INDEX "redeem_groups_end_time_idx" ON "redeem_groups"("end_time");

-- CreateIndex
CREATE UNIQUE INDEX "redeem_codes_code_key" ON "redeem_codes"("code");

-- AddForeignKey
ALTER TABLE "redeem_groups" ADD CONSTRAINT "redeem_groups_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redeem_codes" ADD CONSTRAINT "redeem_codes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "redeem_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
