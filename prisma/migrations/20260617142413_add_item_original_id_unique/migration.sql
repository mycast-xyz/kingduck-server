-- AlterTable
ALTER TABLE "items" ADD COLUMN "original_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "items_game_id_type_original_id_key" ON "items"("game_id", "type", "original_id");
