-- CreateEnum
CREATE TYPE "FirmStatus" AS ENUM ('Active', 'Suspended', 'Inactive');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('Invited', 'Active', 'Inactive');

-- CreateTable
CREATE TABLE "firms" (
    "id" UUID NOT NULL,
    "firm_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "FirmStatus" NOT NULL DEFAULT 'Active',
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "default_currency" TEXT NOT NULL DEFAULT 'USD',
    "standard_weekly_capacity_hours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offices" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "office_name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "timezone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "primary_office_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "role_id" UUID NOT NULL,
    "job_title" TEXT NOT NULL DEFAULT '',
    "manager_id" UUID,
    "weekly_capacity_hours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "status" "UserStatus" NOT NULL DEFAULT 'Invited',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "role_name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "firm_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("firm_id","role_id","permission_key")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "offices_firm_id_id_key" ON "offices"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "offices_firm_id_office_name_key" ON "offices"("firm_id", "office_name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_firm_id_status_idx" ON "users"("firm_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_firm_id_id_key" ON "users"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_firm_id_id_key" ON "roles"("firm_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_firm_id_role_name_key" ON "roles"("firm_id", "role_name");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_firm_id_user_id_idx" ON "sessions"("firm_id", "user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_firm_id_user_id_idx" ON "invitations"("firm_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_firm_id_user_id_idx" ON "password_resets"("firm_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_firm_id_timestamp_idx" ON "audit_logs"("firm_id", "timestamp");

-- CreateIndex
CREATE INDEX "rate_limits_expires_at_idx" ON "rate_limits"("expires_at");

-- AddForeignKey
ALTER TABLE "offices" ADD CONSTRAINT "offices_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_firm_id_primary_office_id_fkey" FOREIGN KEY ("firm_id", "primary_office_id") REFERENCES "offices"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_firm_id_role_id_fkey" FOREIGN KEY ("firm_id", "role_id") REFERENCES "roles"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_firm_id_manager_id_fkey" FOREIGN KEY ("firm_id", "manager_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_firm_id_role_id_fkey" FOREIGN KEY ("firm_id", "role_id") REFERENCES "roles"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_firm_id_user_id_fkey" FOREIGN KEY ("firm_id", "user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_firm_id_user_id_fkey" FOREIGN KEY ("firm_id", "user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_firm_id_user_id_fkey" FOREIGN KEY ("firm_id", "user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_firm_id_actor_user_id_fkey" FOREIGN KEY ("firm_id", "actor_user_id") REFERENCES "users"("firm_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants also enforced for writes outside the application.
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized" CHECK (email = lower(trim(email)));
ALTER TABLE "users" ADD CONSTRAINT "users_capacity_range" CHECK (weekly_capacity_hours >= 0 AND weekly_capacity_hours <= 168);
ALTER TABLE "users" ADD CONSTRAINT "users_manager_not_self" CHECK (manager_id IS NULL OR manager_id <> id);
ALTER TABLE "firms" ADD CONSTRAINT "firms_capacity_range" CHECK (standard_weekly_capacity_hours >= 0 AND standard_weekly_capacity_hours <= 168);
