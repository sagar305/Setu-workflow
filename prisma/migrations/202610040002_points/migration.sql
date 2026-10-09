-- CreateEnum
CREATE TYPE "PointType" AS ENUM ('Question', 'ReviewPoint', 'KnowledgeInstruction', 'InternalIssue');

-- CreateEnum
CREATE TYPE "PointStatus" AS ENUM ('Open', 'Responded', 'ClarificationRequired', 'Resolved', 'Closed', 'Reopened', 'Active', 'Archived');

-- CreateEnum
CREATE TYPE "PointAudience" AS ENUM ('Internal', 'External');

-- CreateTable
CREATE TABLE "engagement_points" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "point_sequence" INTEGER NOT NULL,
    "point_number" TEXT NOT NULL,
    "point_type" "PointType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "PointStatus" NOT NULL DEFAULT 'Open',
    "priority" "EngagementPriority" NOT NULL DEFAULT 'Normal',
    "audience" "PointAudience" NOT NULL DEFAULT 'Internal',
    "raised_by_user_id" UUID NOT NULL,
    "assigned_to_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "engagement_workflow_id" UUID,
    "workflow_stage_id" UUID,
    "checklist_item_id" UUID,
    "reference_number" TEXT NOT NULL DEFAULT '',
    "reference_amount" DECIMAL(18,2),
    "prior_year_amount" DECIMAL(18,2),
    "due_date" DATE,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagement_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_responses" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "point_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "parent_comment_id" UUID,
    "comment_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_attachments" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "point_id" UUID NOT NULL,
    "response_id" UUID,
    "uploaded_by_user_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engagement_points_firm_id_engagement_id_status_created_at_idx" ON "engagement_points"("firm_id", "engagement_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "engagement_points_firm_id_assigned_to_user_id_status_due_da_idx" ON "engagement_points"("firm_id", "assigned_to_user_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "engagement_points_firm_id_engagement_id_blocking_workflow_s_idx" ON "engagement_points"("firm_id", "engagement_id", "blocking", "workflow_stage_id");

-- CreateIndex
CREATE INDEX "engagement_points_firm_id_checklist_item_id_idx" ON "engagement_points"("firm_id", "checklist_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_points_firm_id_id_key" ON "engagement_points"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_points_firm_id_engagement_id_point_sequence_key" ON "engagement_points"("firm_id", "engagement_id", "point_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_points_firm_id_engagement_id_point_number_key" ON "engagement_points"("firm_id", "engagement_id", "point_number");

-- CreateIndex
CREATE INDEX "point_responses_firm_id_point_id_created_at_idx" ON "point_responses"("firm_id", "point_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "point_responses_firm_id_point_id_id_key" ON "point_responses"("firm_id", "point_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "point_attachments_storage_key_key" ON "point_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "point_attachments_firm_id_point_id_idx" ON "point_attachments"("firm_id", "point_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_point_link_key" ON "engagement_checklist_items"("firm_id", "engagement_id", "engagement_workflow_id", "engagement_workflow_stage_id", "id");

-- AddForeignKey
ALTER TABLE "engagement_points" ADD CONSTRAINT "engagement_points_firm_id_engagement_id_fkey" FOREIGN KEY ("firm_id", "engagement_id") REFERENCES "engagements"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_points" ADD CONSTRAINT "engagement_points_firm_id_raised_by_user_id_fkey" FOREIGN KEY ("firm_id", "raised_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_points" ADD CONSTRAINT "engagement_points_firm_id_assigned_to_user_id_fkey" FOREIGN KEY ("firm_id", "assigned_to_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_points" ADD CONSTRAINT "engagement_points_firm_id_updated_by_user_id_fkey" FOREIGN KEY ("firm_id", "updated_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_points" ADD CONSTRAINT "engagement_points_firm_id_engagement_id_engagement_workflo_fkey" FOREIGN KEY ("firm_id", "engagement_id", "engagement_workflow_id") REFERENCES "engagement_workflows"("firm_id", "engagement_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_points" ADD CONSTRAINT "engagement_points_firm_id_engagement_workflow_id_workflow__fkey" FOREIGN KEY ("firm_id", "engagement_workflow_id", "workflow_stage_id") REFERENCES "engagement_workflow_stages"("firm_id", "engagement_workflow_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_points" ADD CONSTRAINT "point_checklist_link_fkey" FOREIGN KEY ("firm_id", "engagement_id", "engagement_workflow_id", "workflow_stage_id", "checklist_item_id") REFERENCES "engagement_checklist_items"("firm_id", "engagement_id", "engagement_workflow_id", "engagement_workflow_stage_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_points" ADD CONSTRAINT "engagement_points_firm_id_resolved_by_user_id_fkey" FOREIGN KEY ("firm_id", "resolved_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_responses" ADD CONSTRAINT "point_responses_firm_id_point_id_fkey" FOREIGN KEY ("firm_id", "point_id") REFERENCES "engagement_points"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_responses" ADD CONSTRAINT "point_responses_firm_id_author_user_id_fkey" FOREIGN KEY ("firm_id", "author_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_responses" ADD CONSTRAINT "point_responses_firm_id_point_id_parent_comment_id_fkey" FOREIGN KEY ("firm_id", "point_id", "parent_comment_id") REFERENCES "point_responses"("firm_id", "point_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_attachments" ADD CONSTRAINT "point_attachments_firm_id_point_id_fkey" FOREIGN KEY ("firm_id", "point_id") REFERENCES "engagement_points"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_attachments" ADD CONSTRAINT "point_attachments_firm_id_point_id_response_id_fkey" FOREIGN KEY ("firm_id", "point_id", "response_id") REFERENCES "point_responses"("firm_id", "point_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_attachments" ADD CONSTRAINT "point_attachments_firm_id_uploaded_by_user_id_fkey" FOREIGN KEY ("firm_id", "uploaded_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE engagement_points ADD CONSTRAINT point_content CHECK(length(trim(title))>0 AND length(trim(description))>0),
 ADD CONSTRAINT point_revision CHECK(revision>0 AND point_sequence>0),
 ADD CONSTRAINT point_stage CHECK((workflow_stage_id IS NULL)=(engagement_workflow_id IS NULL)),
 ADD CONSTRAINT point_checklist CHECK(checklist_item_id IS NULL OR (workflow_stage_id IS NOT NULL AND engagement_workflow_id IS NOT NULL)),
 ADD CONSTRAINT point_instruction CHECK((point_type='KnowledgeInstruction' AND status IN ('Active','Archived') AND NOT blocking) OR (point_type<>'KnowledgeInstruction' AND status NOT IN ('Active','Archived'))),
 ADD CONSTRAINT point_resolution CHECK((status IN ('Resolved','Closed') AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL) OR (status NOT IN ('Resolved','Closed') AND resolved_at IS NULL AND resolved_by_user_id IS NULL)),
 ADD CONSTRAINT point_closure CHECK((status IN ('Closed','Archived'))=(closed_at IS NOT NULL));
ALTER TABLE point_responses ADD CONSTRAINT response_text CHECK(length(trim(comment_text))>0), ADD CONSTRAINT response_parent CHECK(parent_comment_id IS NULL OR parent_comment_id<>id);
ALTER TABLE point_attachments ADD CONSTRAINT point_attachment_size CHECK(byte_size>0 AND byte_size<=10485760), ADD CONSTRAINT point_attachment_type CHECK(media_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','image/png','image/jpeg'));
CREATE FUNCTION preserve_point_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(OLD.id,OLD.firm_id,OLD.engagement_id,OLD.point_number,OLD.point_sequence,OLD.point_type,OLD.raised_by_user_id,OLD.created_at) IS DISTINCT FROM ROW(NEW.id,NEW.firm_id,NEW.engagement_id,NEW.point_number,NEW.point_sequence,NEW.point_type,NEW.raised_by_user_id,NEW.created_at) THEN RAISE EXCEPTION 'Point identity and original authorship are immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER point_identity BEFORE UPDATE ON engagement_points FOR EACH ROW EXECUTE FUNCTION preserve_point_identity();
CREATE FUNCTION preserve_point_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Point history cannot be deleted or rewritten'; END $$;
CREATE TRIGGER point_no_delete BEFORE DELETE ON engagement_points FOR EACH ROW EXECUTE FUNCTION preserve_point_history();
CREATE TRIGGER point_response_immutable BEFORE UPDATE OR DELETE ON point_responses FOR EACH ROW EXECUTE FUNCTION preserve_point_history();
CREATE TRIGGER point_attachment_no_delete BEFORE DELETE ON point_attachments FOR EACH ROW EXECUTE FUNCTION preserve_point_history();
INSERT INTO permissions(key,label) VALUES ('points.view','points view') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('points.create','points create') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('points.reply','points reply') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('points.assign','points assign') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('points.edit','points edit') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('points.resolve','points resolve') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('points.reopen','points reopen') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('points.close','points close') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('points.override_blocking','points override_blocking') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('points.attach','points attach') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key)
SELECT r.firm_id,r.id,p.key FROM roles r CROSS JOIN permissions p WHERE r.is_default=true AND (
 (p.key IN ('points.view','points.create','points.reply','points.assign','points.attach') AND r.role_name IN ('Firm Admin','Partner','Manager','Senior / Reviewer','Associate / Preparer')) OR
 (p.key IN ('points.edit','points.resolve','points.reopen','points.close') AND r.role_name IN ('Firm Admin','Partner','Manager','Senior / Reviewer')) OR
 (p.key='points.override_blocking' AND r.role_name IN ('Firm Admin','Partner','Manager')))
 ON CONFLICT DO NOTHING;
