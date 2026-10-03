-- Operational managers may override current ownership, but Engagement visibility
-- and the permission for the requested action are still checked independently.
INSERT INTO role_permissions (firm_id, role_id, permission_key)
SELECT firm_id, id, 'workflows.manage' FROM roles
WHERE is_default = true AND role_name IN ('Partner', 'Manager')
ON CONFLICT DO NOTHING;
