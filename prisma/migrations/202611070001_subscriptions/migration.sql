-- Paid subscriptions bought as license keys on setutechnology.com.
ALTER TABLE firms
  ADD COLUMN license_expires_at TIMESTAMP(3),
  ADD COLUMN licensed_seats INTEGER;
ALTER TABLE firms ADD CONSTRAINT firm_license_shape CHECK (
  (license_expires_at IS NULL AND licensed_seats IS NULL) OR
  (license_expires_at IS NOT NULL AND licensed_seats IS NOT NULL AND licensed_seats > 0)
);

-- The super admin owns the firm's subscription: redeems keys and decides who
-- holds a seat. A seat only limits access while the firm has a license.
ALTER TABLE users
  ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN has_seat BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD CONSTRAINT super_admin_has_seat CHECK (NOT is_super_admin OR has_seat);
CREATE UNIQUE INDEX users_one_super_admin_per_firm ON users (firm_id) WHERE is_super_admin;

-- Each firm's earliest Firm Admin (the account that signed up or was
-- provisioned first) becomes its super admin.
UPDATE users SET is_super_admin = true
WHERE id IN (
  SELECT DISTINCT ON (u.firm_id) u.id
  FROM users u
  JOIN roles r ON r.id = u.role_id AND r.firm_id = u.firm_id
  WHERE r.is_default AND r.role_name = 'Firm Admin' AND u.status <> 'Inactive'
  ORDER BY u.firm_id, u.created_at, u.id
);

-- One row per license key ever redeemed or cancelled. The unique key_id is
-- what makes a key single-use: keys are not stored when sold.
CREATE TABLE license_redemptions (
  id UUID NOT NULL,
  key_id TEXT NOT NULL,
  firm_id UUID,
  user_id UUID,
  revoked BOOLEAN NOT NULL DEFAULT false,
  days INTEGER NOT NULL,
  seats INTEGER NOT NULL,
  previous_expires_at TIMESTAMP(3),
  new_expires_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT license_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT license_redemptions_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES firms(id),
  CONSTRAINT license_redemptions_shape CHECK (revoked OR firm_id IS NOT NULL)
);
CREATE UNIQUE INDEX license_redemptions_key_id_key ON license_redemptions (key_id);
CREATE INDEX license_redemptions_firm_id_idx ON license_redemptions (firm_id);
