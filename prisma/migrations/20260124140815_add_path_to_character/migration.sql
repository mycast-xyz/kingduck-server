/*
  Warnings:

  - Added the required column `type` to the `elements` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "path_id" INTEGER;

-- AlterTable
ALTER TABLE "elements" ADD COLUMN     "type" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "characters_path_id_idx" ON "characters"("path_id");

-- CreateIndex
CREATE INDEX "elements_game_id_type_idx" ON "elements"("game_id", "type");

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "elements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
