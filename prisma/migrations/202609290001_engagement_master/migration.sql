-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('Draft', 'Planned', 'Assigned', 'InProgress', 'OnHold', 'Completed', 'Cancelled');

-- CreateEnum
CREATE TYPE "EngagementPriority" AS ENUM ('Low', 'Normal', 'High', 'Urgent');

-- CreateEnum
CREATE TYPE "EngagementPeriod" AS ENUM ('Monthly', 'Quarterly', 'Annual', 'TaxYear', 'Custom', 'NotApplicable');

-- CreateEnum
CREATE TYPE "EngagementStaffSlot" AS ENUM ('Partner', 'Manager', 'Reviewer', 'Preparer');

-- CreateTable
CREATE TABLE "engagement_types" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "service_line_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "engagement_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagements" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "engagement_code" TEXT NOT NULL,
    "engagement_name" TEXT NOT NULL,
    "service_line_id" UUID NOT NULL,
    "engagement_type_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "partner_id" UUID,
    "manager_id" UUID,
    "reviewer_id" UUID,
    "preparer_id" UUID,
    "status" "EngagementStatus" NOT NULL DEFAULT 'Draft',
    "priority" "EngagementPriority" NOT NULL DEFAULT 'Normal',
    "period_type" "EngagementPeriod" NOT NULL DEFAULT 'NotApplicable',
    "period_start_date" DATE,
    "period_end_date" DATE,
    "reporting_year" INTEGER,
    "allocation_date" DATE,
    "planned_start_date" DATE,
    "actual_start_date" DATE,
    "due_date" DATE,
    "completed_date" DATE,
    "budget_hours" DOUBLE PRECISION,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_reference" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "internal_notes" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "engagements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_assignment_history" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "slot" "EngagementStaffSlot" NOT NULL,
    "old_user_id" UUID,
    "new_user_id" UUID,
    "old_allocation_date" DATE,
    "new_allocation_date" DATE,
    "actor_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_status_history" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "old_status" "EngagementStatus",
    "new_status" "EngagementStatus" NOT NULL,
    "old_completed_date" DATE,
    "new_completed_date" DATE,
    "comment" TEXT NOT NULL DEFAULT '',
    "actor_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_custom_field_definitions" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "field_type" "ClientFieldType" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "engagement_custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_custom_field_values" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "engagement_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "text_value" TEXT,
    "number_value" DOUBLE PRECISION,
    "date_value" DATE,
    "boolean_value" BOOLEAN,

    CONSTRAINT "engagement_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_import_jobs" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Preview',
    "file_name" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "engagement_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "engagement_types_firm_id_id_key" ON "engagement_types"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_types_firm_id_normalized_name_key" ON "engagement_types"("firm_id", "normalized_name");

-- CreateIndex
CREATE INDEX "engagements_firm_id_client_id_due_date_idx" ON "engagements"("firm_id", "client_id", "due_date");

-- CreateIndex
CREATE INDEX "engagements_firm_id_status_due_date_idx" ON "engagements"("firm_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "engagements_firm_id_due_date_idx" ON "engagements"("firm_id", "due_date");

-- CreateIndex
CREATE INDEX "engagements_firm_id_service_line_id_idx" ON "engagements"("firm_id", "service_line_id");

-- CreateIndex
CREATE INDEX "engagements_firm_id_engagement_type_id_idx" ON "engagements"("firm_id", "engagement_type_id");

-- CreateIndex
CREATE INDEX "engagements_firm_id_office_id_idx" ON "engagements"("firm_id", "office_id");

-- CreateIndex
CREATE INDEX "engagements_firm_id_partner_id_due_date_idx" ON "engagements"("firm_id", "partner_id", "due_date");

-- CreateIndex
CREATE INDEX "engagements_firm_id_manager_id_due_date_idx" ON "engagements"("firm_id", "manager_id", "due_date");

-- CreateIndex
CREATE INDEX "engagements_firm_id_reviewer_id_due_date_idx" ON "engagements"("firm_id", "reviewer_id", "due_date");

-- CreateIndex
CREATE INDEX "engagements_firm_id_preparer_id_due_date_idx" ON "engagements"("firm_id", "preparer_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "engagements_firm_id_id_key" ON "engagements"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "engagements_firm_id_engagement_code_key" ON "engagements"("firm_id", "engagement_code");

-- CreateIndex
CREATE INDEX "engagement_assignment_history_firm_id_engagement_id_changed_idx" ON "engagement_assignment_history"("firm_id", "engagement_id", "changed_at");

-- CreateIndex
CREATE INDEX "engagement_status_history_firm_id_engagement_id_changed_at_idx" ON "engagement_status_history"("firm_id", "engagement_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_custom_field_definitions_firm_id_id_key" ON "engagement_custom_field_definitions"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_custom_field_definitions_firm_id_normalized_name_key" ON "engagement_custom_field_definitions"("firm_id", "normalized_name");

-- CreateIndex
CREATE INDEX "engagement_custom_field_values_firm_id_definition_id_idx" ON "engagement_custom_field_values"("firm_id", "definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_custom_field_values_firm_id_engagement_id_defini_key" ON "engagement_custom_field_values"("firm_id", "engagement_id", "definition_id");

-- CreateIndex
CREATE INDEX "engagement_import_jobs_firm_id_created_at_idx" ON "engagement_import_jobs"("firm_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_import_jobs_firm_id_id_key" ON "engagement_import_jobs"("firm_id", "id");

-- AddForeignKey
ALTER TABLE "engagement_types" ADD CONSTRAINT "engagement_types_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_types" ADD CONSTRAINT "engagement_types_firm_id_service_line_id_fkey" FOREIGN KEY ("firm_id", "service_line_id") REFERENCES "service_lines"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_client_id_fkey" FOREIGN KEY ("firm_id", "client_id") REFERENCES "clients"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_service_line_id_fkey" FOREIGN KEY ("firm_id", "service_line_id") REFERENCES "service_lines"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_engagement_type_id_fkey" FOREIGN KEY ("firm_id", "engagement_type_id") REFERENCES "engagement_types"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_office_id_fkey" FOREIGN KEY ("firm_id", "office_id") REFERENCES "offices"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_partner_id_fkey" FOREIGN KEY ("firm_id", "partner_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_manager_id_fkey" FOREIGN KEY ("firm_id", "manager_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_reviewer_id_fkey" FOREIGN KEY ("firm_id", "reviewer_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_preparer_id_fkey" FOREIGN KEY ("firm_id", "preparer_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_created_by_user_id_fkey" FOREIGN KEY ("firm_id", "created_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_firm_id_updated_by_user_id_fkey" FOREIGN KEY ("firm_id", "updated_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_assignment_history" ADD CONSTRAINT "engagement_assignment_history_firm_id_engagement_id_fkey" FOREIGN KEY ("firm_id", "engagement_id") REFERENCES "engagements"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_assignment_history" ADD CONSTRAINT "engagement_assignment_history_firm_id_old_user_id_fkey" FOREIGN KEY ("firm_id", "old_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_assignment_history" ADD CONSTRAINT "engagement_assignment_history_firm_id_new_user_id_fkey" FOREIGN KEY ("firm_id", "new_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_assignment_history" ADD CONSTRAINT "engagement_assignment_history_firm_id_actor_user_id_fkey" FOREIGN KEY ("firm_id", "actor_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_status_history" ADD CONSTRAINT "engagement_status_history_firm_id_engagement_id_fkey" FOREIGN KEY ("firm_id", "engagement_id") REFERENCES "engagements"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_status_history" ADD CONSTRAINT "engagement_status_history_firm_id_actor_user_id_fkey" FOREIGN KEY ("firm_id", "actor_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_custom_field_definitions" ADD CONSTRAINT "engagement_custom_field_definitions_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_custom_field_values" ADD CONSTRAINT "engagement_custom_field_values_firm_id_engagement_id_fkey" FOREIGN KEY ("firm_id", "engagement_id") REFERENCES "engagements"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_custom_field_values" ADD CONSTRAINT "engagement_custom_field_values_firm_id_definition_id_fkey" FOREIGN KEY ("firm_id", "definition_id") REFERENCES "engagement_custom_field_definitions"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engagement_import_jobs" ADD CONSTRAINT "engagement_import_jobs_firm_id_actor_user_id_fkey" FOREIGN KEY ("firm_id", "actor_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE engagements ADD CONSTRAINT engagement_code_upper CHECK (engagement_code = upper(engagement_code));
ALTER TABLE engagements ADD CONSTRAINT engagement_budget_valid CHECK (budget_hours >= 0 AND budget_hours <= 1000000);
ALTER TABLE engagements ADD CONSTRAINT engagement_period_valid CHECK ((period_start_date IS NULL AND period_end_date IS NULL) OR (period_start_date IS NOT NULL AND period_end_date IS NOT NULL AND period_end_date >= period_start_date));
ALTER TABLE engagements ADD CONSTRAINT engagement_completion_valid CHECK ((status = 'Completed' AND completed_date IS NOT NULL) OR (status <> 'Completed' AND completed_date IS NULL));
ALTER TABLE engagements ADD CONSTRAINT engagement_schedule_valid CHECK ((due_date IS NULL OR planned_start_date IS NULL OR due_date >= planned_start_date) AND (completed_date IS NULL OR actual_start_date IS NULL OR completed_date >= actual_start_date));
ALTER TABLE engagement_custom_field_values ADD CONSTRAINT engagement_field_one_value CHECK (num_nonnulls(text_value, number_value, date_value, boolean_value) = 1);
CREATE INDEX engagement_name_search ON engagements USING gin (engagement_name gin_trgm_ops);
CREATE INDEX engagement_code_search ON engagements USING gin (engagement_code gin_trgm_ops);
INSERT INTO permissions (key,label) VALUES ('engagements.view','View permitted engagements (preparer by default)') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.view_all','View all engagements in the firm') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.view_staffed','View engagements in any of your four staffing slots') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.view_review','View engagements assigned to you as reviewer or preparer') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.create','Create engagements') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.edit','Edit permitted engagements') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.change_status','Change engagement status') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.assign','Assign engagement staff') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.manage_budget','Manage engagement budget hours') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.import','Import engagements') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.export','Export permitted engagements') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.manage_custom_fields','Configure engagement custom fields') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO permissions (key,label) VALUES ('engagements.configure','Configure engagement types') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view_all' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view_staffed' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view_review' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.create' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.edit' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.change_status' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.assign' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.manage_budget' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.import' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.export' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.manage_custom_fields' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.configure' FROM roles WHERE is_default=true AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view_all' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.create' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.edit' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.change_status' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.assign' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.manage_budget' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.export' FROM roles WHERE is_default=true AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view_staffed' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.create' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.edit' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.change_status' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.assign' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.manage_budget' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.export' FROM roles WHERE is_default=true AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view' FROM roles WHERE is_default=true AND role_name='Senior / Reviewer' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view_review' FROM roles WHERE is_default=true AND role_name='Senior / Reviewer' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (firm_id,role_id,permission_key) SELECT firm_id,id,'engagements.view' FROM roles WHERE is_default=true AND role_name='Associate / Preparer' ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Monthly Bookkeeping','monthly bookkeeping',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Monthly Close','monthly close',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Quarterly Close','quarterly close',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Annual Close','annual close',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Individual Tax Return','individual tax return',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Partnership Tax Return','partnership tax return',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'S Corporation Tax Return','s corporation tax return',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'C Corporation Tax Return','c corporation tax return',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Trust Tax Return','trust tax return',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'1099','1099',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Sales Tax','sales tax',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Payroll','payroll',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Financial Statement Audit','financial statement audit',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Review','review',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Compilation','compilation',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Advisory','advisory',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'FP&A','fp&a',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO engagement_types (id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Other','other',true FROM firms ON CONFLICT DO NOTHING;
