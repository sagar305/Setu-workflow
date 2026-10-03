-- CreateEnum
CREATE TYPE "WorkflowTemplateStatus" AS ENUM ('Draft', 'Published', 'Archived');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('Active', 'Completed');

-- CreateEnum
CREATE TYPE "WorkflowStageState" AS ENUM ('NotStarted', 'Current', 'Completed', 'Skipped');

-- CreateEnum
CREATE TYPE "WorkflowOwnerType" AS ENUM ('Partner', 'Manager', 'Reviewer', 'Preparer', 'SpecificUser', 'Manual');

-- CreateEnum
CREATE TYPE "WorkflowCategory" AS ENUM ('Queue', 'Preparation', 'Waiting', 'Review', 'Approval', 'Completion', 'Other');

-- CreateEnum
CREATE TYPE "WorkflowMovementType" AS ENUM ('Start', 'Forward', 'Return', 'Reassign', 'Skip', 'Complete', 'Reopen');

-- AlterTable
ALTER TABLE "engagement_types" ADD COLUMN     "default_workflow_template_id" UUID;

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "service_line_id" UUID NOT NULL,
    "engagement_type_id" UUID,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "WorkflowTemplateStatus" NOT NULL DEFAULT 'Draft',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_template_stages" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "workflow_template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL,
    "category" "WorkflowCategory" NOT NULL DEFAULT 'Other',
    "default_owner_type" "WorkflowOwnerType" NOT NULL DEFAULT 'Manual',
    "specific_user_id" UUID,
    "target_days" INTEGER,
    "instructions" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "is_start" BOOLEAN NOT NULL DEFAULT false,
    "is_completion" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_template_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_workflows" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "source_workflow_template_id" UUID NOT NULL,
    "source_template_version" INTEGER NOT NULL,
    "template_name_snapshot" TEXT NOT NULL,
    "current_stage_id" UUID,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'Active',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagement_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_workflow_stages" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "engagement_workflow_id" UUID NOT NULL,
    "source_template_stage_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sequence" INTEGER NOT NULL,
    "category" "WorkflowCategory" NOT NULL,
    "target_days" INTEGER,
    "instructions" TEXT NOT NULL DEFAULT '',
    "default_owner_type" "WorkflowOwnerType" NOT NULL,
    "specific_user_id" UUID,
    "required" BOOLEAN NOT NULL,
    "is_start" BOOLEAN NOT NULL,
    "is_completion" BOOLEAN NOT NULL,
    "assigned_user_id" UUID,
    "state" "WorkflowStageState" NOT NULL DEFAULT 'NotStarted',
    "entered_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engagement_workflow_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_movements" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "engagement_workflow_id" UUID NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID NOT NULL,
    "movement_type" "WorkflowMovementType" NOT NULL,
    "from_user_id" UUID,
    "to_user_id" UUID,
    "moved_by_user_id" UUID NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL,

    CONSTRAINT "workflow_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_visits" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "engagement_workflow_id" UUID NOT NULL,
    "engagement_workflow_stage_id" UUID NOT NULL,
    "assigned_user_id" UUID,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exited_at" TIMESTAMP(3),
    "exit_type" "WorkflowMovementType",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_templates_firm_id_status_service_line_id_engagemen_idx" ON "workflow_templates"("firm_id", "status", "service_line_id", "engagement_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_firm_id_id_key" ON "workflow_templates"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_firm_id_family_id_version_number_key" ON "workflow_templates"("firm_id", "family_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_firm_id_normalized_name_version_number_key" ON "workflow_templates"("firm_id", "normalized_name", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_stages_firm_id_id_key" ON "workflow_template_stages"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_stages_firm_id_workflow_template_id_seque_key" ON "workflow_template_stages"("firm_id", "workflow_template_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_workflows_engagement_id_key" ON "engagement_workflows"("engagement_id");

-- CreateIndex
CREATE INDEX "engagement_workflows_firm_id_source_workflow_template_id_st_idx" ON "engagement_workflows"("firm_id", "source_workflow_template_id", "status");

-- CreateIndex
CREATE INDEX "engagement_workflows_firm_id_current_stage_id_idx" ON "engagement_workflows"("firm_id", "current_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_workflows_firm_id_id_key" ON "engagement_workflows"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_workflows_firm_id_engagement_id_key" ON "engagement_workflows"("firm_id", "engagement_id");

-- CreateIndex
CREATE INDEX "engagement_workflow_stages_firm_id_assigned_user_id_state_e_idx" ON "engagement_workflow_stages"("firm_id", "assigned_user_id", "state", "entered_at");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_workflow_stages_firm_id_engagement_workflow_id_i_key" ON "engagement_workflow_stages"("firm_id", "engagement_workflow_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_workflow_stages_firm_id_engagement_workflow_id_s_key" ON "engagement_workflow_stages"("firm_id", "engagement_workflow_id", "sequence");

-- CreateIndex
CREATE INDEX "workflow_movements_firm_id_engagement_workflow_id_moved_at_idx" ON "workflow_movements"("firm_id", "engagement_workflow_id", "moved_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_movements_firm_id_engagement_workflow_id_revision_key" ON "workflow_movements"("firm_id", "engagement_workflow_id", "revision");

-- CreateIndex
CREATE INDEX "stage_visits_firm_id_engagement_workflow_id_entered_at_idx" ON "stage_visits"("firm_id", "engagement_workflow_id", "entered_at");

-- CreateIndex
CREATE INDEX "stage_visits_firm_id_engagement_workflow_stage_id_entered_a_idx" ON "stage_visits"("firm_id", "engagement_workflow_stage_id", "entered_at");

-- AddForeignKey
ALTER TABLE "engagement_types" ADD CONSTRAINT "engagement_types_firm_id_default_workflow_template_id_fkey" FOREIGN KEY ("firm_id", "default_workflow_template_id") REFERENCES "workflow_templates"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_firm_id_service_line_id_fkey" FOREIGN KEY ("firm_id", "service_line_id") REFERENCES "service_lines"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_firm_id_engagement_type_id_fkey" FOREIGN KEY ("firm_id", "engagement_type_id") REFERENCES "engagement_types"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_firm_id_created_by_user_id_fkey" FOREIGN KEY ("firm_id", "created_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_template_stages" ADD CONSTRAINT "workflow_template_stages_firm_id_workflow_template_id_fkey" FOREIGN KEY ("firm_id", "workflow_template_id") REFERENCES "workflow_templates"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_template_stages" ADD CONSTRAINT "workflow_template_stages_firm_id_specific_user_id_fkey" FOREIGN KEY ("firm_id", "specific_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_workflows" ADD CONSTRAINT "engagement_workflows_firm_id_engagement_id_fkey" FOREIGN KEY ("firm_id", "engagement_id") REFERENCES "engagements"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_workflows" ADD CONSTRAINT "engagement_workflows_firm_id_source_workflow_template_id_fkey" FOREIGN KEY ("firm_id", "source_workflow_template_id") REFERENCES "workflow_templates"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_workflows" ADD CONSTRAINT "engagement_workflows_firm_id_id_current_stage_id_fkey" FOREIGN KEY ("firm_id", "id", "current_stage_id") REFERENCES "engagement_workflow_stages"("firm_id", "engagement_workflow_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_workflow_stages" ADD CONSTRAINT "engagement_workflow_stages_firm_id_engagement_workflow_id_fkey" FOREIGN KEY ("firm_id", "engagement_workflow_id") REFERENCES "engagement_workflows"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_workflow_stages" ADD CONSTRAINT "engagement_workflow_stages_firm_id_source_template_stage_i_fkey" FOREIGN KEY ("firm_id", "source_template_stage_id") REFERENCES "workflow_template_stages"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_workflow_stages" ADD CONSTRAINT "engagement_workflow_stages_firm_id_specific_user_id_fkey" FOREIGN KEY ("firm_id", "specific_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_workflow_stages" ADD CONSTRAINT "engagement_workflow_stages_firm_id_assigned_user_id_fkey" FOREIGN KEY ("firm_id", "assigned_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_movements" ADD CONSTRAINT "workflow_movements_firm_id_engagement_workflow_id_fkey" FOREIGN KEY ("firm_id", "engagement_workflow_id") REFERENCES "engagement_workflows"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_movements" ADD CONSTRAINT "workflow_movements_firm_id_engagement_workflow_id_from_sta_fkey" FOREIGN KEY ("firm_id", "engagement_workflow_id", "from_stage_id") REFERENCES "engagement_workflow_stages"("firm_id", "engagement_workflow_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_movements" ADD CONSTRAINT "workflow_movements_firm_id_engagement_workflow_id_to_stage_fkey" FOREIGN KEY ("firm_id", "engagement_workflow_id", "to_stage_id") REFERENCES "engagement_workflow_stages"("firm_id", "engagement_workflow_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_movements" ADD CONSTRAINT "workflow_movements_firm_id_from_user_id_fkey" FOREIGN KEY ("firm_id", "from_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_movements" ADD CONSTRAINT "workflow_movements_firm_id_to_user_id_fkey" FOREIGN KEY ("firm_id", "to_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_movements" ADD CONSTRAINT "workflow_movements_firm_id_moved_by_user_id_fkey" FOREIGN KEY ("firm_id", "moved_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_visits" ADD CONSTRAINT "stage_visits_firm_id_engagement_workflow_id_fkey" FOREIGN KEY ("firm_id", "engagement_workflow_id") REFERENCES "engagement_workflows"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_visits" ADD CONSTRAINT "stage_visits_firm_id_engagement_workflow_id_engagement_wor_fkey" FOREIGN KEY ("firm_id", "engagement_workflow_id", "engagement_workflow_stage_id") REFERENCES "engagement_workflow_stages"("firm_id", "engagement_workflow_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_visits" ADD CONSTRAINT "stage_visits_firm_id_assigned_user_id_fkey" FOREIGN KEY ("firm_id", "assigned_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One operational current stage and one open assignment visit per workflow.
CREATE UNIQUE INDEX workflow_one_current ON engagement_workflow_stages (firm_id, engagement_workflow_id) WHERE state = 'Current';
CREATE UNIQUE INDEX workflow_one_open_visit ON stage_visits (firm_id, engagement_workflow_id) WHERE exited_at IS NULL;
ALTER TABLE workflow_template_stages ADD CONSTRAINT template_stage_target CHECK (target_days IS NULL OR target_days BETWEEN 0 AND 3650);
ALTER TABLE workflow_template_stages ADD CONSTRAINT template_stage_sequence CHECK (sequence > 0);
ALTER TABLE engagement_workflow_stages ADD CONSTRAINT runtime_stage_target CHECK (target_days IS NULL OR target_days BETWEEN 0 AND 3650);
ALTER TABLE stage_visits ADD CONSTRAINT visit_interval CHECK ((exited_at IS NULL AND exit_type IS NULL) OR (exited_at >= entered_at AND exit_type IS NOT NULL));
CREATE FUNCTION preserve_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status <> 'Draft' THEN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Historical templates cannot be deleted'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','active','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','active','revision','updated_at']) OR NEW.status <> 'Archived' OR NEW.active THEN
   RAISE EXCEPTION 'Historical template definitions are immutable';
  END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_template BEFORE UPDATE OR DELETE ON workflow_templates FOR EACH ROW EXECUTE FUNCTION preserve_template();
CREATE FUNCTION preserve_template_stage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE template_status "WorkflowTemplateStatus";
BEGIN
 IF TG_OP <> 'INSERT' THEN
  SELECT status INTO template_status FROM workflow_templates WHERE id=OLD.workflow_template_id;
  IF template_status <> 'Draft' THEN RAISE EXCEPTION 'Historical template stages are immutable'; END IF;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  SELECT status INTO template_status FROM workflow_templates WHERE id=NEW.workflow_template_id;
  IF template_status <> 'Draft' THEN RAISE EXCEPTION 'Historical template stages are immutable'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER preserve_template_stage BEFORE INSERT OR UPDATE OR DELETE ON workflow_template_stages FOR EACH ROW EXECUTE FUNCTION preserve_template_stage();
CREATE FUNCTION preserve_workflow_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Workflow history cannot be changed or deleted';
END $$;
CREATE TRIGGER preserve_movements BEFORE UPDATE OR DELETE ON workflow_movements FOR EACH ROW EXECUTE FUNCTION preserve_workflow_history();
CREATE TRIGGER preserve_workflows BEFORE DELETE ON engagement_workflows FOR EACH ROW EXECUTE FUNCTION preserve_workflow_history();
CREATE TRIGGER preserve_runtime_stages BEFORE DELETE ON engagement_workflow_stages FOR EACH ROW EXECUTE FUNCTION preserve_workflow_history();
CREATE TRIGGER preserve_visits BEFORE DELETE ON stage_visits FOR EACH ROW EXECUTE FUNCTION preserve_workflow_history();
CREATE FUNCTION preserve_visit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.exited_at IS NOT NULL OR (to_jsonb(NEW) - ARRAY['exited_at','exit_type']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['exited_at','exit_type']) THEN RAISE EXCEPTION 'Visits may only be closed once'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_visit BEFORE UPDATE ON stage_visits FOR EACH ROW EXECUTE FUNCTION preserve_visit();
CREATE FUNCTION preserve_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW) - ARRAY['assigned_user_id','state','entered_at','completed_at','skipped_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['assigned_user_id','state','entered_at','completed_at','skipped_at','updated_at']) THEN RAISE EXCEPTION 'Runtime stage definitions are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_snapshot BEFORE UPDATE ON engagement_workflow_stages FOR EACH ROW EXECUTE FUNCTION preserve_snapshot();
-- Deferred validation permits all steps of an atomic move and rejects partial commits.
CREATE FUNCTION validate_workflow_current() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid uuid; w engagement_workflows; n integer; v integer;
BEGIN
 IF TG_TABLE_NAME='engagement_workflows' THEN wid=NEW.id; ELSE wid=NEW.engagement_workflow_id; END IF;
 SELECT * INTO w FROM engagement_workflows WHERE id=wid;
 SELECT count(*) INTO n FROM engagement_workflow_stages WHERE engagement_workflow_id=wid AND state='Current';
 SELECT count(*) INTO v FROM stage_visits WHERE engagement_workflow_id=wid AND exited_at IS NULL;
 IF w.status='Active' THEN
  IF n<>1 OR v<>1 OR NOT EXISTS (SELECT 1 FROM engagement_workflow_stages s JOIN stage_visits sv ON sv.engagement_workflow_stage_id=s.id AND sv.exited_at IS NULL WHERE s.id=w.current_stage_id AND s.state='Current' AND sv.assigned_user_id IS NOT DISTINCT FROM s.assigned_user_id) THEN RAISE EXCEPTION 'Active workflow requires exactly one matching current stage and open visit'; END IF;
 ELSE
  IF n<>0 OR v<>0 OR w.completed_at IS NULL THEN RAISE EXCEPTION 'Completed workflow cannot have a current stage or open visit'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER validate_workflow_current AFTER INSERT OR UPDATE ON engagement_workflows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_workflow_current();
CREATE CONSTRAINT TRIGGER validate_stage_current AFTER INSERT OR UPDATE ON engagement_workflow_stages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_workflow_current();
CREATE CONSTRAINT TRIGGER validate_visit_current AFTER INSERT OR UPDATE ON stage_visits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_workflow_current();
INSERT INTO permissions (key,label) VALUES ('workflow_templates.view','View workflow templates') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflow_templates.create','Create and duplicate workflow templates') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflow_templates.edit','Edit drafts and create template versions') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflow_templates.publish','Publish workflow templates') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflow_templates.archive','Archive workflow templates') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.view','View permitted engagement workflows') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.apply','Apply workflows to permitted engagements') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.start','Start engagement workflows') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.move','Move owned workflow stages forward') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.return','Return owned workflow stages') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.reassign','Reassign current workflow stages') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.skip','Skip optional workflow stages') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.complete','Complete engagement workflows') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.reopen','Reopen completed workflows') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('workflows.manage','Manage workflows beyond current ownership within engagement visibility') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflow_templates.view' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflow_templates.create' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflow_templates.edit' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflow_templates.publish' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflow_templates.archive' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.view' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.apply' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.start' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.move' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.return' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.reassign' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.skip' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.complete' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.reopen' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.manage' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflow_templates.view' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.view' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.apply' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.start' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.move' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.return' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.reassign' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.skip' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.complete' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.reopen' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflow_templates.view' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.view' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.apply' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.start' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.move' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.return' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.reassign' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.skip' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.complete' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.reopen' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflow_templates.view' FROM roles WHERE is_default=true AND role_name='Senior / Reviewer' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.view' FROM roles WHERE is_default=true AND role_name='Senior / Reviewer' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.move' FROM roles WHERE is_default=true AND role_name='Senior / Reviewer' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.return' FROM roles WHERE is_default=true AND role_name='Senior / Reviewer' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.view' FROM roles WHERE is_default=true AND role_name='Associate / Preparer' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'workflows.move' FROM roles WHERE is_default=true AND role_name='Associate / Preparer' ON CONFLICT DO NOTHING;
