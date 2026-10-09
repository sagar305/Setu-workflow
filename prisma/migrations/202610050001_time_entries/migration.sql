-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('Draft', 'Submitted');

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "engagement_workflow_id" UUID,
    "engagement_workflow_stage_id" UUID,
    "checklist_item_id" UUID,
    "work_allocation_id" UUID,
    "work_date" DATE NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'Draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "request_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "time_entries_firm_id_user_id_work_date_idx" ON "time_entries"("firm_id", "user_id", "work_date");

-- CreateIndex
CREATE INDEX "time_entries_firm_id_engagement_id_status_work_date_idx" ON "time_entries"("firm_id", "engagement_id", "status", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_firm_id_id_key" ON "time_entries"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_firm_id_user_id_request_id_key" ON "time_entries"("firm_id", "user_id", "request_id");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_user_id_fkey" FOREIGN KEY ("firm_id", "user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_engagement_id_fkey" FOREIGN KEY ("firm_id", "engagement_id") REFERENCES "engagements"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_engagement_id_engagement_workflow_id_fkey" FOREIGN KEY ("firm_id", "engagement_id", "engagement_workflow_id") REFERENCES "engagement_workflows"("firm_id", "engagement_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_engagement_workflow_id_engagement_wor_fkey" FOREIGN KEY ("firm_id", "engagement_workflow_id", "engagement_workflow_stage_id") REFERENCES "engagement_workflow_stages"("firm_id", "engagement_workflow_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_checklist_item_id_fkey" FOREIGN KEY ("firm_id", "checklist_item_id") REFERENCES "engagement_checklist_items"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_work_allocation_id_fkey" FOREIGN KEY ("firm_id", "work_allocation_id") REFERENCES "work_allocations"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_created_by_user_id_fkey" FOREIGN KEY ("firm_id", "created_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_updated_by_user_id_fkey" FOREIGN KEY ("firm_id", "updated_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE time_entries ADD CONSTRAINT time_hours CHECK(hours > 0 AND hours <= 24),
 ADD CONSTRAINT time_description CHECK(length(trim(description)) > 0 AND length(description) <= 2000),
 ADD CONSTRAINT time_revision CHECK(revision > 0),
 ADD CONSTRAINT time_submitted CHECK(status <> 'Submitted' OR submitted_at IS NOT NULL),
 ADD CONSTRAINT time_stage CHECK((engagement_workflow_id IS NULL) = (engagement_workflow_stage_id IS NULL));
CREATE FUNCTION protect_time_entry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' THEN
   IF OLD.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Previously finalized time cannot be deleted'; END IF;
   RETURN OLD;
 END IF;
 IF TG_OP = 'UPDATE' THEN
   IF ROW(OLD.id,OLD.firm_id,OLD.user_id,OLD.engagement_id,OLD.request_id,OLD.created_at,OLD.created_by_user_id) IS DISTINCT FROM ROW(NEW.id,NEW.firm_id,NEW.user_id,NEW.engagement_id,NEW.request_id,NEW.created_at,NEW.created_by_user_id) THEN RAISE EXCEPTION 'Time identity is immutable'; END IF;
   IF OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS NULL THEN RAISE EXCEPTION 'Finalization history must be retained'; END IF;
   IF OLD.status = 'Submitted' AND (NEW.status <> 'Draft' OR ROW(OLD.hours,OLD.work_date,OLD.description,OLD.engagement_workflow_id,OLD.engagement_workflow_stage_id,OLD.checklist_item_id,OLD.work_allocation_id) IS DISTINCT FROM ROW(NEW.hours,NEW.work_date,NEW.description,NEW.engagement_workflow_id,NEW.engagement_workflow_stage_id,NEW.checklist_item_id,NEW.work_allocation_id)) THEN RAISE EXCEPTION 'Submitted time must first be explicitly returned to draft'; END IF;
 END IF;
 IF NEW.checklist_item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM engagement_checklist_items c WHERE c.id=NEW.checklist_item_id AND c.firm_id=NEW.firm_id AND c.engagement_id=NEW.engagement_id AND c.engagement_workflow_stage_id=NEW.engagement_workflow_stage_id) THEN RAISE EXCEPTION 'Checklist must match engagement and stage'; END IF;
 IF NEW.work_allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_allocations a WHERE a.id=NEW.work_allocation_id AND a.firm_id=NEW.firm_id AND a.engagement_id=NEW.engagement_id) THEN RAISE EXCEPTION 'Allocation must match engagement'; END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER time_integrity BEFORE INSERT OR UPDATE OR DELETE ON time_entries FOR EACH ROW EXECUTE FUNCTION protect_time_entry();
INSERT INTO permissions(key,label) VALUES ('time.view_own','time view_own') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('time.create','time create') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('time.edit_own','time edit_own') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('time.submit','time submit') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('time.view_engagement','time view_engagement') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('time.correct','time correct') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('budget.view','budget view') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key)
SELECT r.firm_id,r.id,p.key FROM roles r CROSS JOIN permissions p WHERE r.is_default=true AND (
 (p.key IN ('time.view_own','time.create','time.edit_own','time.submit') AND r.role_name IN ('Firm Admin','Partner','Manager','Senior / Reviewer','Associate / Preparer')) OR
 (p.key IN ('time.view_engagement','time.correct','budget.view') AND r.role_name IN ('Firm Admin','Partner','Manager')))
 ON CONFLICT DO NOTHING;
