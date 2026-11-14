-- Marks a database as a disposable demo. The demo reset (src/lib/demo.ts) wipes
-- every other table, and refuses to touch a database that holds data but has no
-- row here, so a production database can never be reset by a misconfiguration.
CREATE TABLE demo_instance (
  id INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_reset_at TIMESTAMP(3),
  -- Set while a reset runs, so a manual and a scheduled reset never overlap.
  resetting_since TIMESTAMP(3),
  CONSTRAINT demo_instance_pkey PRIMARY KEY (id),
  CONSTRAINT demo_instance_single_row CHECK (id = 1)
);
