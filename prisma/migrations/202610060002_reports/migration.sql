INSERT INTO permissions(key,label) VALUES
('reports.view','View operational reports within underlying record permissions'),
('reports.export','Export permitted operational reports to CSV') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key)
SELECT r.firm_id,r.id,p.key FROM roles r CROSS JOIN permissions p WHERE r.is_default=true AND r.role_name IN ('Firm Admin','Partner','Manager') AND p.key IN ('reports.view','reports.export') ON CONFLICT DO NOTHING;
