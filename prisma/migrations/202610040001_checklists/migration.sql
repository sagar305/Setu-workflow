-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('NotStarted', 'InProgress', 'Blocked', 'Completed', 'NotApplicable');

-- CreateTable
CREATE TABLE "workflow_template_checklist_items" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "workflow_template_stage_id" UUID NOT NULL,
    "item_code" TEXT NOT NULL DEFAULT '',
    "item_title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL,
    "estimated_hours" DOUBLE PRECISION,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "evidence_required" BOOLEAN NOT NULL DEFAULT false,
    "default_owner_type" TEXT NOT NULL DEFAULT 'StageOwner',
    "specific_user_id" UUID,
    "relative_due_days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_template_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_checklist_items" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "engagement_workflow_id" UUID NOT NULL,
    "engagement_workflow_stage_id" UUID NOT NULL,
    "source_template_checklist_item_id" UUID,
    "item_code" TEXT NOT NULL DEFAULT '',
    "item_title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "instructions_snapshot" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL,
    "estimated_hours" DOUBLE PRECISION,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "evidence_required" BOOLEAN NOT NULL DEFAULT false,
    "assigned_user_id" UUID,
    "due_date" DATE,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'NotStarted',
    "reason" TEXT NOT NULL DEFAULT '',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by_user_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagement_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_comments" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "checklist_item_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "comment_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_attachments" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "checklist_item_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_checklist_items_firm_id_id_key" ON "workflow_template_checklist_items"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_checklist_items_firm_id_workflow_template_key" ON "workflow_template_checklist_items"("firm_id", "workflow_template_stage_id", "sequence");

-- CreateIndex
CREATE INDEX "engagement_checklist_items_firm_id_engagement_id_engagement_idx" ON "engagement_checklist_items"("firm_id", "engagement_id", "engagement_workflow_stage_id", "sequence");

-- CreateIndex
CREATE INDEX "engagement_checklist_items_firm_id_assigned_user_id_status__idx" ON "engagement_checklist_items"("firm_id", "assigned_user_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_checklist_items_firm_id_id_key" ON "engagement_checklist_items"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_checklist_items_firm_id_engagement_workflow_id_s_key" ON "engagement_checklist_items"("firm_id", "engagement_workflow_id", "source_template_checklist_item_id");

-- CreateIndex
CREATE INDEX "checklist_comments_firm_id_checklist_item_id_created_at_idx" ON "checklist_comments"("firm_id", "checklist_item_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_attachments_storage_key_key" ON "checklist_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "checklist_attachments_firm_id_checklist_item_id_idx" ON "checklist_attachments"("firm_id", "checklist_item_id");

-- AddForeignKey
ALTER TABLE "workflow_template_checklist_items" ADD CONSTRAINT "workflow_template_checklist_items_firm_id_workflow_templat_fkey" FOREIGN KEY ("firm_id", "workflow_template_stage_id") REFERENCES "workflow_template_stages"("firm_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_template_checklist_items" ADD CONSTRAINT "workflow_template_checklist_items_firm_id_specific_user_id_fkey" FOREIGN KEY ("firm_id", "specific_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_checklist_items" ADD CONSTRAINT "engagement_checklist_items_firm_id_engagement_id_fkey" FOREIGN KEY ("firm_id", "engagement_id") REFERENCES "engagements"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_checklist_items" ADD CONSTRAINT "engagement_checklist_items_firm_id_engagement_id_engagemen_fkey" FOREIGN KEY ("firm_id", "engagement_id", "engagement_workflow_id") REFERENCES "engagement_workflows"("firm_id", "engagement_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_checklist_items" ADD CONSTRAINT "engagement_checklist_items_firm_id_engagement_workflow_id__fkey" FOREIGN KEY ("firm_id", "engagement_workflow_id", "engagement_workflow_stage_id") REFERENCES "engagement_workflow_stages"("firm_id", "engagement_workflow_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_checklist_items" ADD CONSTRAINT "engagement_checklist_items_firm_id_source_template_checkli_fkey" FOREIGN KEY ("firm_id", "source_template_checklist_item_id") REFERENCES "workflow_template_checklist_items"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_checklist_items" ADD CONSTRAINT "engagement_checklist_items_firm_id_assigned_user_id_fkey" FOREIGN KEY ("firm_id", "assigned_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_checklist_items" ADD CONSTRAINT "engagement_checklist_items_firm_id_completed_by_user_id_fkey" FOREIGN KEY ("firm_id", "completed_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_checklist_items" ADD CONSTRAINT "engagement_checklist_items_firm_id_created_by_user_id_fkey" FOREIGN KEY ("firm_id", "created_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_checklist_items" ADD CONSTRAINT "engagement_checklist_items_firm_id_updated_by_user_id_fkey" FOREIGN KEY ("firm_id", "updated_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_comments" ADD CONSTRAINT "checklist_comments_firm_id_checklist_item_id_fkey" FOREIGN KEY ("firm_id", "checklist_item_id") REFERENCES "engagement_checklist_items"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_comments" ADD CONSTRAINT "checklist_comments_firm_id_author_user_id_fkey" FOREIGN KEY ("firm_id", "author_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_attachments" ADD CONSTRAINT "checklist_attachments_firm_id_checklist_item_id_fkey" FOREIGN KEY ("firm_id", "checklist_item_id") REFERENCES "engagement_checklist_items"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_attachments" ADD CONSTRAINT "checklist_attachments_firm_id_uploaded_by_user_id_fkey" FOREIGN KEY ("firm_id", "uploaded_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE engagement_checklist_items ADD CONSTRAINT checklist_title CHECK(length(trim(item_title))>0),
 ADD CONSTRAINT checklist_revision CHECK(revision>0),
 ADD CONSTRAINT checklist_hours CHECK(estimated_hours IS NULL OR estimated_hours>0),
 ADD CONSTRAINT checklist_reason CHECK(status NOT IN ('Blocked','NotApplicable') OR length(trim(reason))>0),
 ADD CONSTRAINT checklist_completion CHECK((status='Completed' AND completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL) OR (status<>'Completed' AND completed_at IS NULL AND completed_by_user_id IS NULL));
ALTER TABLE workflow_template_checklist_items ADD CONSTRAINT template_checklist_title CHECK(length(trim(item_title))>0),
 ADD CONSTRAINT template_checklist_hours CHECK(estimated_hours IS NULL OR estimated_hours>0),
 ADD CONSTRAINT template_checklist_owner CHECK(default_owner_type IN ('StageOwner','Preparer','Reviewer','Manager','Partner','SpecificUser','Manual') AND ((default_owner_type='SpecificUser')=(specific_user_id IS NOT NULL)));
ALTER TABLE checklist_attachments ADD CONSTRAINT checklist_attachment_size CHECK(byte_size>0 AND byte_size<=10485760),
 ADD CONSTRAINT checklist_attachment_type CHECK(media_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','image/png','image/jpeg'));
CREATE FUNCTION protect_checklist_definition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stage_id uuid; tenant_id uuid; template_status text;
BEGIN
 IF TG_OP='DELETE' THEN stage_id:=OLD.workflow_template_stage_id; tenant_id:=OLD.firm_id;
 ELSE stage_id:=NEW.workflow_template_stage_id; tenant_id:=NEW.firm_id; END IF;
 IF TG_OP='UPDATE' AND (OLD.workflow_template_stage_id<>NEW.workflow_template_stage_id OR OLD.firm_id<>NEW.firm_id) THEN RAISE EXCEPTION 'Checklist definitions cannot move between stages'; END IF;
 SELECT t.status::text INTO template_status FROM workflow_templates t JOIN workflow_template_stages s ON s.workflow_template_id=t.id AND s.firm_id=t.firm_id WHERE s.id=stage_id AND s.firm_id=tenant_id;
 IF template_status IS NOT NULL AND template_status<>'Draft' THEN RAISE EXCEPTION 'Published checklist definitions are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER checklist_definition_immutable BEFORE INSERT OR UPDATE OR DELETE ON workflow_template_checklist_items FOR EACH ROW EXECUTE FUNCTION protect_checklist_definition();
CREATE FUNCTION preserve_checklist_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Operational checklist history cannot be deleted'; END $$;
CREATE TRIGGER checklist_no_delete BEFORE DELETE ON engagement_checklist_items FOR EACH ROW EXECUTE FUNCTION preserve_checklist_history();
CREATE TRIGGER checklist_comment_immutable BEFORE UPDATE OR DELETE ON checklist_comments FOR EACH ROW EXECUTE FUNCTION preserve_checklist_history();
CREATE TRIGGER checklist_attachment_no_delete BEFORE DELETE ON checklist_attachments FOR EACH ROW EXECUTE FUNCTION preserve_checklist_history();
INSERT INTO permissions(key,label) VALUES ('checklist.view','checklist view') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist.create','checklist create') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist.edit','checklist edit') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist.assign','checklist assign') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist.update_status','checklist update_status') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist.complete','checklist complete') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist.reopen','checklist reopen') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist.override_required','checklist override_required') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist.comment','checklist comment') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist.attach','checklist attach') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist_templates.view','checklist_templates view') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist_templates.create','checklist_templates create') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('checklist_templates.edit','checklist_templates edit') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key)
SELECT r.firm_id,r.id,p.key FROM roles r CROSS JOIN permissions p
WHERE r.is_default=true AND ((p.key IN ('checklist.view','checklist.create','checklist.edit','checklist.assign','checklist.update_status','checklist.complete','checklist.reopen','checklist.override_required','checklist.comment','checklist.attach','checklist_templates.view','checklist_templates.create','checklist_templates.edit') AND r.role_name IN ('Firm Admin','Partner','Manager')) OR (p.key IN ('checklist.view','checklist.update_status','checklist.complete','checklist.comment','checklist.attach') AND r.role_name IN ('Senior / Reviewer','Associate / Preparer')))
ON CONFLICT DO NOTHING;
