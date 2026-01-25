/*
  Warnings:

  - You are about to drop the column `weapon_id` on the `characters` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "characters" DROP CONSTRAINT "characters_weapon_id_fkey";

-- AlterTable
ALTER TABLE "characters" DROP COLUMN "weapon_id";
