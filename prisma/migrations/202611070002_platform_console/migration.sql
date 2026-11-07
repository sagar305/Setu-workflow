-- "Super admin" now means Setu's own staff (the platform console). The firm's
-- subscription holder is the account owner.
ALTER TABLE users RENAME COLUMN is_super_admin TO is_account_owner;
ALTER TABLE users RENAME CONSTRAINT super_admin_has_seat TO account_owner_has_seat;
ALTER INDEX users_one_super_admin_per_firm RENAME TO users_one_account_owner_per_firm;

-- Setu staff who run the platform console. Not tenant users: no firm, no
-- roles, created only from the command line.
CREATE TABLE platform_admins (
  id UUID NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT platform_admins_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX platform_admins_email_key ON platform_admins (email);

CREATE TABLE platform_sessions (
  id UUID NOT NULL,
  admin_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT platform_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT platform_sessions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES platform_admins(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX platform_sessions_token_hash_key ON platform_sessions (token_hash);

-- Every key Setu issues (plans and additional-user top-ups), with the payment
-- it was issued against. key_id matches license_redemptions.key_id.
CREATE TABLE license_issues (
  id UUID NOT NULL,
  key_id TEXT NOT NULL,
  order_ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  days INTEGER NOT NULL,
  seats INTEGER NOT NULL,
  amount DECIMAL(12,2),
  currency TEXT,
  note TEXT NOT NULL DEFAULT '',
  firm_id UUID,
  issued_by_id UUID,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT license_issues_pkey PRIMARY KEY (id),
  CONSTRAINT license_issues_kind CHECK (kind IN ('plan', 'addon')),
  CONSTRAINT license_issues_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES firms(id),
  CONSTRAINT license_issues_issued_by_id_fkey FOREIGN KEY (issued_by_id) REFERENCES platform_admins(id)
);
CREATE UNIQUE INDEX license_issues_key_id_key ON license_issues (key_id);
CREATE UNIQUE INDEX license_issues_order_ref_key ON license_issues (order_ref);
CREATE INDEX license_issues_firm_id_idx ON license_issues (firm_id);

CREATE TABLE platform_audit_logs (
  id UUID NOT NULL,
  admin_id UUID,
  action TEXT NOT NULL,
  firm_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT platform_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT platform_audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES platform_admins(id)
);
CREATE INDEX platform_audit_logs_created_at_idx ON platform_audit_logs (created_at);
CREATE INDEX platform_audit_logs_firm_id_idx ON platform_audit_logs (firm_id);
