-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "weapon_id" INTEGER;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_weapon_id_fkey" FOREIGN KEY ("weapon_id") REFERENCES "elements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
