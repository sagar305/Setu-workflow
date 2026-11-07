-- Owner console: invited staff, authenticator-app sign-in, lockout, IPs in the
-- activity log, and plan reminder emails.
ALTER TABLE platform_admins
  ALTER COLUMN password_hash DROP NOT NULL,
  ADD COLUMN totp_secret_enc TEXT,
  ADD COLUMN totp_last_step INTEGER,
  ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN locked_until TIMESTAMP(3),
  ADD COLUMN invited_by_id UUID;

-- One-time tokens: invite / password links, and the short-lived second step of
-- sign-in ("setup" carries the new authenticator secret until it is confirmed).
CREATE TABLE platform_tokens (
  id UUID NOT NULL,
  admin_id UUID NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  totp_secret_enc TEXT,
  expires_at TIMESTAMP(3) NOT NULL,
  used_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT platform_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT platform_tokens_purpose CHECK (purpose IN ('invite', 'setup', 'mfa')),
  CONSTRAINT platform_tokens_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES platform_admins(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX platform_tokens_token_hash_key ON platform_tokens (token_hash);

ALTER TABLE platform_audit_logs ADD COLUMN ip TEXT;

CREATE TABLE plan_reminders (
  id UUID NOT NULL,
  firm_id UUID NOT NULL,
  license_ends_at TIMESTAMP(3) NOT NULL,
  days_before INTEGER NOT NULL,
  kind TEXT NOT NULL,
  sent_to TEXT NOT NULL,
  admin_id UUID,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT plan_reminders_pkey PRIMARY KEY (id),
  CONSTRAINT plan_reminders_kind CHECK (kind IN ('auto', 'manual')),
  CONSTRAINT plan_reminders_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES firms(id),
  CONSTRAINT plan_reminders_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES platform_admins(id)
);
CREATE INDEX plan_reminders_firm_id_created_at_idx ON plan_reminders (firm_id, created_at);
CREATE INDEX plan_reminders_created_at_idx ON plan_reminders (created_at);
