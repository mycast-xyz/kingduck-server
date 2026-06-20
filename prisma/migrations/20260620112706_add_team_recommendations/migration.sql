-- CreateTable
CREATE TABLE "team_recommendations" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "character_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slots" JSONB NOT NULL,
    "tags" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_recommendations_character_id_sort_order_idx" ON "team_recommendations"("character_id", "sort_order");

-- CreateIndex
CREATE INDEX "team_recommendations_game_id_idx" ON "team_recommendations"("game_id");

-- AddForeignKey
ALTER TABLE "team_recommendations" ADD CONSTRAINT "team_recommendations_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_recommendations" ADD CONSTRAINT "team_recommendations_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
