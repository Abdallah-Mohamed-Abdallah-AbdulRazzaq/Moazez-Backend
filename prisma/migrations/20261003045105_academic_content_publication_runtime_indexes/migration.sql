-- CreateIndex
CREATE INDEX "academic_content_publications_status_publish_at_id_idx" ON "academic_content_publications"("status", "publish_at", "id");

-- CreateIndex
CREATE INDEX "academic_content_publications_status_visible_until_id_idx" ON "academic_content_publications"("status", "visible_until", "id");
