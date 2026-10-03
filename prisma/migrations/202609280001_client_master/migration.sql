-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('Prospect', 'Onboarding', 'Active', 'OnHold', 'Inactive', 'Terminated');

-- CreateEnum
CREATE TYPE "ClientFieldType" AS ENUM ('Text', 'Number', 'Date', 'Boolean', 'Dropdown');

-- CreateTable
CREATE TABLE "entity_types" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "entity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_lines" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "client_code" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "normalized_legal_name" TEXT NOT NULL,
    "normalized_display_name" TEXT NOT NULL,
    "entity_type_id" UUID NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'Prospect',
    "primary_office_id" UUID NOT NULL,
    "responsible_partner_id" UUID,
    "responsible_manager_id" UUID,
    "industry" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "tax_year_end_month" INTEGER,
    "tax_year_end_day" INTEGER,
    "onboarding_date" DATE,
    "termination_date" DATE,
    "internal_notes" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_addresses" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "address_line_1" TEXT NOT NULL DEFAULT '',
    "address_line_2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state_province" TEXT NOT NULL DEFAULT '',
    "postal_code" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "client_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "job_title" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "mobile" TEXT NOT NULL DEFAULT '',
    "contact_type" TEXT NOT NULL DEFAULT 'Other',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_service_lines" (
    "firm_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "service_line_id" UUID NOT NULL,

    CONSTRAINT "client_service_lines_pkey" PRIMARY KEY ("firm_id","client_id","service_line_id")
);

-- CreateTable
CREATE TABLE "client_custom_field_definitions" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "field_type" "ClientFieldType" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "client_custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_custom_field_values" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "text_value" TEXT,
    "number_value" DOUBLE PRECISION,
    "date_value" DATE,
    "boolean_value" BOOLEAN,

    CONSTRAINT "client_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_import_jobs" (
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

    CONSTRAINT "client_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entity_types_firm_id_id_key" ON "entity_types"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_types_firm_id_normalized_name_key" ON "entity_types"("firm_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "service_lines_firm_id_id_key" ON "service_lines"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_lines_firm_id_normalized_name_key" ON "service_lines"("firm_id", "normalized_name");

-- CreateIndex
CREATE INDEX "clients_firm_id_status_idx" ON "clients"("firm_id", "status");

-- CreateIndex
CREATE INDEX "clients_firm_id_primary_office_id_idx" ON "clients"("firm_id", "primary_office_id");

-- CreateIndex
CREATE INDEX "clients_firm_id_responsible_partner_id_idx" ON "clients"("firm_id", "responsible_partner_id");

-- CreateIndex
CREATE INDEX "clients_firm_id_responsible_manager_id_idx" ON "clients"("firm_id", "responsible_manager_id");

-- CreateIndex
CREATE INDEX "clients_firm_id_entity_type_id_idx" ON "clients"("firm_id", "entity_type_id");

-- CreateIndex
CREATE INDEX "clients_firm_id_normalized_legal_name_idx" ON "clients"("firm_id", "normalized_legal_name");

-- CreateIndex
CREATE INDEX "clients_firm_id_normalized_display_name_idx" ON "clients"("firm_id", "normalized_display_name");

-- CreateIndex
CREATE UNIQUE INDEX "clients_firm_id_id_key" ON "clients"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_firm_id_client_code_key" ON "clients"("firm_id", "client_code");

-- CreateIndex
CREATE UNIQUE INDEX "client_addresses_client_id_key" ON "client_addresses"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_addresses_firm_id_client_id_key" ON "client_addresses"("firm_id", "client_id");

-- CreateIndex
CREATE INDEX "client_contacts_firm_id_client_id_idx" ON "client_contacts"("firm_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_contacts_firm_id_id_key" ON "client_contacts"("firm_id", "id");

-- CreateIndex
CREATE INDEX "client_service_lines_firm_id_service_line_id_client_id_idx" ON "client_service_lines"("firm_id", "service_line_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_custom_field_definitions_firm_id_id_key" ON "client_custom_field_definitions"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "client_custom_field_definitions_firm_id_normalized_name_key" ON "client_custom_field_definitions"("firm_id", "normalized_name");

-- CreateIndex
CREATE INDEX "client_custom_field_values_firm_id_definition_id_idx" ON "client_custom_field_values"("firm_id", "definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_custom_field_values_firm_id_client_id_definition_id_key" ON "client_custom_field_values"("firm_id", "client_id", "definition_id");

-- CreateIndex
CREATE INDEX "client_import_jobs_firm_id_created_at_idx" ON "client_import_jobs"("firm_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_import_jobs_firm_id_id_key" ON "client_import_jobs"("firm_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_firm_id_entity_type_entity_id_timestamp_idx" ON "audit_logs"("firm_id", "entity_type", "entity_id", "timestamp");

-- AddForeignKey
ALTER TABLE "entity_types" ADD CONSTRAINT "entity_types_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_lines" ADD CONSTRAINT "service_lines_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_entity_type_id_fkey" FOREIGN KEY ("firm_id", "entity_type_id") REFERENCES "entity_types"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_primary_office_id_fkey" FOREIGN KEY ("firm_id", "primary_office_id") REFERENCES "offices"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_responsible_partner_id_fkey" FOREIGN KEY ("firm_id", "responsible_partner_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_responsible_manager_id_fkey" FOREIGN KEY ("firm_id", "responsible_manager_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_created_by_user_id_fkey" FOREIGN KEY ("firm_id", "created_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_updated_by_user_id_fkey" FOREIGN KEY ("firm_id", "updated_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_firm_id_client_id_fkey" FOREIGN KEY ("firm_id", "client_id") REFERENCES "clients"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_firm_id_client_id_fkey" FOREIGN KEY ("firm_id", "client_id") REFERENCES "clients"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_service_lines" ADD CONSTRAINT "client_service_lines_firm_id_client_id_fkey" FOREIGN KEY ("firm_id", "client_id") REFERENCES "clients"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_service_lines" ADD CONSTRAINT "client_service_lines_firm_id_service_line_id_fkey" FOREIGN KEY ("firm_id", "service_line_id") REFERENCES "service_lines"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_custom_field_definitions" ADD CONSTRAINT "client_custom_field_definitions_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_custom_field_values" ADD CONSTRAINT "client_custom_field_values_firm_id_client_id_fkey" FOREIGN KEY ("firm_id", "client_id") REFERENCES "clients"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_custom_field_values" ADD CONSTRAINT "client_custom_field_values_firm_id_definition_id_fkey" FOREIGN KEY ("firm_id", "definition_id") REFERENCES "client_custom_field_definitions"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_import_jobs" ADD CONSTRAINT "client_import_jobs_firm_id_actor_user_id_fkey" FOREIGN KEY ("firm_id", "actor_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep client codes normalized and primary contacts unambiguous under concurrent writes.
ALTER TABLE clients ADD CONSTRAINT clients_code_normalized CHECK (client_code = upper(trim(client_code)));
ALTER TABLE clients ADD CONSTRAINT clients_year_end_valid CHECK ((tax_year_end_month IS NULL AND tax_year_end_day IS NULL) OR (tax_year_end_month BETWEEN 1 AND 12 AND tax_year_end_day BETWEEN 1 AND CASE WHEN tax_year_end_month=2 THEN 29 WHEN tax_year_end_month IN (4,6,9,11) THEN 30 ELSE 31 END));
ALTER TABLE clients ADD CONSTRAINT clients_dates_ordered CHECK (termination_date IS NULL OR onboarding_date IS NULL OR termination_date >= onboarding_date);
CREATE UNIQUE INDEX client_contacts_one_primary ON client_contacts(firm_id, client_id) WHERE is_primary;
ALTER TABLE client_contacts ADD CONSTRAINT client_contacts_primary_active CHECK (NOT is_primary OR active);
ALTER TABLE client_custom_field_values ADD CONSTRAINT client_field_one_value CHECK (num_nonnulls(text_value, number_value, date_value, boolean_value) = 1);
-- Substring search remains indexed as client volumes grow.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX clients_legal_search ON clients USING gin (legal_name gin_trgm_ops);
CREATE INDEX clients_display_search ON clients USING gin (display_name gin_trgm_ops);
CREATE INDEX clients_code_search ON clients USING gin (client_code gin_trgm_ops);
INSERT INTO permissions(key,label) VALUES ('clients.view','View clients across the firm') ON CONFLICT (key) DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('clients.create','Create clients') ON CONFLICT (key) DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('clients.edit','Edit clients and bulk ownership/status') ON CONFLICT (key) DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('clients.manage_contacts','Manage client contacts') ON CONFLICT (key) DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('clients.manage_services','Manage client service associations') ON CONFLICT (key) DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('clients.import','Import clients from CSV') ON CONFLICT (key) DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('clients.export','Export clients to CSV') ON CONFLICT (key) DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('clients.manage_custom_fields','Configure client custom fields') ON CONFLICT (key) DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('clients.configure','Configure entity types and service lines') ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.view' FROM roles WHERE is_default AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.create' FROM roles WHERE is_default AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.edit' FROM roles WHERE is_default AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.manage_contacts' FROM roles WHERE is_default AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.manage_services' FROM roles WHERE is_default AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.import' FROM roles WHERE is_default AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.export' FROM roles WHERE is_default AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.manage_custom_fields' FROM roles WHERE is_default AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.configure' FROM roles WHERE is_default AND role_name='Firm Admin' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.view' FROM roles WHERE is_default AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.create' FROM roles WHERE is_default AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.edit' FROM roles WHERE is_default AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.manage_contacts' FROM roles WHERE is_default AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.manage_services' FROM roles WHERE is_default AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.export' FROM roles WHERE is_default AND role_name='Partner' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.view' FROM roles WHERE is_default AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.edit' FROM roles WHERE is_default AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.manage_contacts' FROM roles WHERE is_default AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.manage_services' FROM roles WHERE is_default AND role_name='Manager' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.view' FROM roles WHERE is_default AND role_name='Senior / Reviewer' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key) SELECT firm_id,id,'clients.view' FROM roles WHERE is_default AND role_name='Associate / Preparer' ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Individual','individual',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Sole Proprietorship','sole proprietorship',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Partnership','partnership',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'LLC','llc',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'S Corporation','s corporation',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'C Corporation','c corporation',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Trust','trust',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Estate','estate',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Nonprofit','nonprofit',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Government','government',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO entity_types(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Other','other',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'CAS / Client Accounting Services','cas / client accounting services',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Bookkeeping','bookkeeping',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Month-End Close','month-end close',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Tax','tax',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Audit','audit',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Review','review',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Compilation','compilation',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Payroll','payroll',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Sales Tax','sales tax',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'1099','1099',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Advisory','advisory',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'FP&A','fp&a',true FROM firms ON CONFLICT DO NOTHING;
INSERT INTO service_lines(id,firm_id,name,normalized_name,active) SELECT gen_random_uuid(),id,'Other','other',true FROM firms ON CONFLICT DO NOTHING;
