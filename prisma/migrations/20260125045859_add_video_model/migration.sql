-- CreateTable
CREATE TABLE "videos" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "character_id" INTEGER,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "videos_url_key" ON "videos"("url");

-- CreateIndex
CREATE INDEX "videos_game_id_idx" ON "videos"("game_id");

-- CreateIndex
CREATE INDEX "videos_character_id_idx" ON "videos"("character_id");

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
