CREATE TYPE "AllocationStatus" AS ENUM ('Planned','Assigned','InProgress','Blocked','Completed','Cancelled');
CREATE UNIQUE INDEX engagement_workflows_firm_engagement_id_key ON engagement_workflows(firm_id,engagement_id,id);
CREATE TABLE work_allocations (
 id uuid PRIMARY KEY, firm_id uuid NOT NULL REFERENCES firms(id), engagement_id uuid NOT NULL,
 engagement_workflow_id uuid, engagement_workflow_stage_id uuid,
 assigned_user_id uuid NOT NULL, assigned_by_user_id uuid NOT NULL,
 allocation_date date NOT NULL, planned_start_at timestamp(3), planned_end_at timestamp(3),
 allocated_hours decimal(8,2) NOT NULL CHECK(allocated_hours>0),
 status "AllocationStatus" NOT NULL DEFAULT 'Assigned', priority "EngagementPriority" NOT NULL DEFAULT 'Normal',
 description text NOT NULL DEFAULT '', allocation_note text NOT NULL DEFAULT '', blocked_reason text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamp(3) NOT NULL, cancelled_at timestamp(3),
 UNIQUE(firm_id,id),
 FOREIGN KEY(firm_id,engagement_id) REFERENCES engagements(firm_id,id),
 FOREIGN KEY(firm_id,engagement_id,engagement_workflow_id) REFERENCES engagement_workflows(firm_id,engagement_id,id),
 FOREIGN KEY(firm_id,engagement_workflow_id,engagement_workflow_stage_id) REFERENCES engagement_workflow_stages(firm_id,engagement_workflow_id,id),
 FOREIGN KEY(firm_id,assigned_user_id) REFERENCES users(firm_id,id),
 FOREIGN KEY(firm_id,assigned_by_user_id) REFERENCES users(firm_id,id),
 CHECK(engagement_workflow_stage_id IS NULL OR engagement_workflow_id IS NOT NULL),
 CHECK(planned_start_at IS NULL OR planned_end_at IS NULL OR planned_end_at>planned_start_at),
 CHECK(status <> 'Blocked' OR length(trim(blocked_reason))>0),
 CHECK((status='Cancelled')=(cancelled_at IS NOT NULL))
);
CREATE INDEX work_allocations_firm_id_engagement_id_allocation_date_idx ON work_allocations(firm_id,engagement_id,allocation_date);
CREATE INDEX work_allocations_firm_id_assigned_user_id_allocation_date_idx ON work_allocations(firm_id,assigned_user_id,allocation_date);
CREATE INDEX work_allocations_firm_id_allocation_date_status_idx ON work_allocations(firm_id,allocation_date,status);
CREATE INDEX work_allocations_firm_id_status_idx ON work_allocations(firm_id,status);
CREATE INDEX work_allocations_firm_id_engagement_workflow_stage_id_idx ON work_allocations(firm_id,engagement_workflow_stage_id);
CREATE FUNCTION preserve_work_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Cancel operational allocations instead of deleting them'; END $$;
CREATE TRIGGER work_allocation_no_delete BEFORE DELETE ON work_allocations FOR EACH ROW EXECUTE FUNCTION preserve_work_allocation();
INSERT INTO permissions(key,label) VALUES ('allocations.view','allocations view') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('allocations.create','allocations create') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('allocations.edit','allocations edit') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('allocations.reassign','allocations reassign') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('allocations.cancel','allocations cancel') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('allocations.manage_team','allocations manage_team') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('my_work.view','my_work view') ON CONFLICT DO NOTHING;
INSERT INTO permissions(key,label) VALUES ('my_work.update_status','my_work update_status') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key)
SELECT r.firm_id,r.id,p.key FROM roles r CROSS JOIN permissions p
WHERE r.is_default=true AND (
(p.key IN ('allocations.view','my_work.view','my_work.update_status') AND r.role_name IN ('Firm Admin','Partner','Manager','Senior / Reviewer','Associate / Preparer')) OR
(p.key IN ('allocations.create','allocations.edit','allocations.reassign','allocations.cancel','allocations.manage_team') AND r.role_name IN ('Firm Admin','Partner','Manager')))
ON CONFLICT DO NOTHING;
