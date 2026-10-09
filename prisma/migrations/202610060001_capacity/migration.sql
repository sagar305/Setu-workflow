-- CreateTable
CREATE TABLE "capacity_adjustments" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "adjustment_type" TEXT NOT NULL,
    "hours_reduction" DECIMAL(4,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,

    CONSTRAINT "capacity_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capacity_adjustments_firm_id_user_id_start_date_end_date_idx" ON "capacity_adjustments"("firm_id", "user_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "capacity_adjustments_firm_id_id_key" ON "capacity_adjustments"("firm_id", "id");

-- AddForeignKey
ALTER TABLE "capacity_adjustments" ADD CONSTRAINT "capacity_adjustments_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_adjustments" ADD CONSTRAINT "capacity_adjustments_firm_id_user_id_fkey" FOREIGN KEY ("firm_id", "user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_adjustments" ADD CONSTRAINT "capacity_adjustments_firm_id_created_by_user_id_fkey" FOREIGN KEY ("firm_id", "created_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_adjustments" ADD CONSTRAINT "capacity_adjustments_firm_id_updated_by_user_id_fkey" FOREIGN KEY ("firm_id", "updated_by_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE capacity_adjustments ADD CONSTRAINT capacity_dates CHECK(end_date >= start_date AND end_date - start_date <= 365),
 ADD CONSTRAINT capacity_reduction CHECK(hours_reduction > 0 AND hours_reduction <= 24),
 ADD CONSTRAINT capacity_reason CHECK(length(trim(reason)) > 0 AND length(reason) <= 1000),
 ADD CONSTRAINT capacity_type CHECK(adjustment_type IN ('Leave','Training','Holiday','Other')),
 ADD CONSTRAINT capacity_revision CHECK(revision > 0);
CREATE FUNCTION preserve_capacity_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cancel capacity adjustments to preserve history'; END IF;
 IF ROW(OLD.id,OLD.firm_id,OLD.user_id,OLD.created_by_user_id,OLD.created_at) IS DISTINCT FROM ROW(NEW.id,NEW.firm_id,NEW.user_id,NEW.created_by_user_id,NEW.created_at) THEN RAISE EXCEPTION 'Capacity adjustment identity is immutable'; END IF;
 IF OLD.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Cancelled capacity adjustments are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capacity_identity BEFORE UPDATE OR DELETE ON capacity_adjustments FOR EACH ROW EXECUTE FUNCTION preserve_capacity_identity();
INSERT INTO permissions(key,label) VALUES ('capacity.view_team','View capacity of employees in your team scope'),('capacity.adjust','Adjust capacity of employees in your team scope') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(firm_id,role_id,permission_key)
SELECT r.firm_id,r.id,p.key FROM roles r CROSS JOIN permissions p WHERE r.is_default=true AND r.role_name IN ('Firm Admin','Partner','Manager') AND p.key IN ('capacity.view_team','capacity.adjust') ON CONFLICT DO NOTHING;
