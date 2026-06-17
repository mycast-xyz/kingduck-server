-- CreateIndex
CREATE UNIQUE INDEX "elements_game_id_name_type_key" ON "elements"("game_id", "name", "type");

-- CreateIndex
CREATE INDEX "calendar_events_reviewed_by_idx" ON "calendar_events"("reviewed_by");
