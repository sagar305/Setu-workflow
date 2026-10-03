# Build #3 — completion and verification

Completed September 29, 2026. Preview: `http://127.0.0.1:3000/engagements`. The existing development credentials remain unchanged; the private `.env` holds `SEED_PASSWORD`.

## A. Implemented

Engagement Master with unique per-firm codes, client/service/type/office references, four staffing slots, periods, reporting year, schedules, lifecycle status, explicit priority, budgets, recurring indicator, descriptions/notes, typed custom fields, assignment/status history, activity, CSV import/export, controlled bulk actions, and record-level visibility. Actual Hours is unavailable and is not stored as an editable number. No Build #4 workflow functionality was created.

## B. Database

Migration: `prisma/migrations/202609290001_engagement_master/migration.sql`.

New models: Engagement, EngagementType, EngagementAssignmentHistory, EngagementStatusHistory, EngagementCustomFieldDefinition, EngagementCustomFieldValue, EngagementImportJob. Existing Firm/User/Office/Client/ServiceLine relations extended. Compound tenant foreign keys, firm/code uniqueness, budget/date/completion/value constraints, tenant filter/staff/date indexes, and trigram search indexes added. Both local databases migrated successfully; final recheck reported no pending migrations.

## C. UI

Routes: `/engagements`, `/engagements/new`, `/engagements/{id}`, `/engagements/{id}/edit`, `/engagements/settings`, `/engagements/import`. Components: form, list/filter/column/bulk controls, detail/Team/Activity, settings, and shared CSV import UI. Existing shell updated to Build 03 without a redesign.

## D. Client integration

Client Detail's Engagements tab is enabled, showing that client's engagements intersected with record visibility. Active/Completed/All filters and New Engagement with preselected Client work. Client selection supplies editable ownership defaults and single-service preselection. Additional client-service associations require explicit confirmation plus permission; they are audited.

## E. Permissions

All operations require engagements.view plus their operation permission. Firm Admin and Partner see all same-firm engagements. Manager sees records personally staffing them in any of the four slots. Senior/Reviewer sees personal Reviewer or Preparer assignments. Associate/Preparer sees personal Preparer assignments. These rules use capability keys, not role-name checks.

Create, edit, status, assignment, budget, import, export, catalog configuration, and field configuration are independent. General editing cannot change protected budget/status/staffing without their permissions. Custom roles are explicitly configurable; existing custom roles are not silently upgraded. A creator with limited visibility must assign themselves to a permitted slot.

Build #2 Client directory permissions remain separate. Engagement-only users receive minimal client context, not Client administration. Exact capability rules and the retained Client visibility behavior are documented in BUILD3.md.

## F. Security

Session-derived firm; scoped service queries; same-firm relational validation and database foreign keys; hidden/missing records share not-found responses; firm-lock transactions recheck identity and permissions; optimistic versions reject stale updates; original Origin checks and body bounds remain. No standard hard-delete route exists. Visibility applies to list, detail, activity, export, Client tab, and mutations. Audit DTOs omit raw technical metadata and credentials.

## G. Staffing and lifecycle history

Fixed nullable Partner/Manager/Reviewer/Preparer references support the V1 UX. Structured assignment history retains old/new users, slot, allocation dates, actor, and time. Status history preserves transitions, comments, and completion dates, including reopening. Both histories and AuditLog events commit in the same transaction. The rationale for structured histories and future multi-assignee expansion is in BUILD3.md.

## H. Import/export

CSV upload → mapping → validation → preview → explicit confirmation. Template and row error-report downloads included. Unknown/foreign clients, catalogs, staff, inactive users, duplicate codes, malformed dates/periods, and negative budgets are rejected. Valid rows commit atomically; invalid rows are explicitly skipped; changed references roll back the valid batch. Jobs are creator/firm-bound, expiring, and idempotent. Filtered exports respect record visibility and escape spreadsheet formulas.

## I. Tests and exact commands

| Verification | Result |
| --- | --- |
| Required pre-coding baseline | 53 database tests + 11 browser tests passed |
| Final database suite | **92/92 passed**: 16 foundation, 37 clients, 39 engagements |
| Final browser suite | **16/16 passed**: 6 foundation, 5 clients, 5 engagements |
| TypeScript | Passed |
| ESLint | Passed |
| Production build | Passed; all six Engagement routes compiled |
| Development/test migration recheck | No pending migrations |
| Seed and idempotent rerun | Passed for both demo firms |
| Visual review | Desktop list, responsive list, Overview, Team, Activity reviewed; screenshots captured for create, Client integration, settings, import |

Commands were executed from `C:\Users\Juhi\Documents\ChatGPT\Setu Workflow for firms`. npm is absent from this machine's PATH, so direct Node equivalents were used:

```powershell
# Required baseline, before implementation
node node_modules/tsx/dist/cli.mjs scripts/test-migrate.ts
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test

# Schema validation and migration generation
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js migrate diff --from-schema-datamodel .local/build2-schema.prisma --to-schema-datamodel prisma/schema.prisma --script --output .local/build3-migration.sql
node node_modules/tsx/dist/cli.mjs .local/build3-migration.mts

# Apply committed migration and generate client
node node_modules/prisma/build/index.js migrate deploy
node node_modules/tsx/dist/cli.mjs scripts/test-migrate.ts
node node_modules/prisma/build/index.js generate
node node_modules/tsx/dist/cli.mjs prisma/seed.ts

# Focused development verification
node node_modules/vitest/vitest.mjs run tests/engagements.test.ts
node node_modules/@playwright/test/cli.js test e2e/engagements.spec.ts

# Final regression and static checks
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src scripts tests e2e prisma *.ts *.mjs

# Final migration/seed/build recheck
node node_modules/prisma/build/index.js migrate deploy
node node_modules/tsx/dist/cli.mjs scripts/test-migrate.ts
node node_modules/tsx/dist/cli.mjs prisma/seed.ts
node node_modules/next/dist/bin/next build
```

The `.local` migration assembly script was a development aid for adding constraints, catalog defaults, and permission grants to Prisma's SQL diff. Deployment uses the committed migration, not that script. The preview was briefly stopped to release Windows' Prisma engine DLL lock before generation, then restarted.

Failures found and fixed during development: refined Zod object projection, custom-role test fixture relation setup, default scope select value, and browser timing that mistook the busy button label for a completed status refresh. All final checks above passed. Prisma emits its existing package.json configuration deprecation notice; it remains pinned to the verified v6 release.

Test coverage includes every requested tenant relationship, all four staffing slots, active/inactive staff, default-role and custom-role visibility, independent protected-field permissions, scoped creator rules, completion/reopening, allocation history, database constraint attacks, DST/local-date/week boundaries, 10,000-record pagination, client defaults/integration, five field types, atomic imports and bulk updates, expired/foreign jobs, and formula-safe exports. The 10,000-record test is not a production concurrency benchmark.

## J. Regression

Build #1's authentication, invitation/reset, authorization, administration, tenant isolation, and mobile shell tests all pass. Build #2's clients, contacts, services, custom fields, imports/exports, tenant isolation, bulk actions, and browser tests all pass. Existing architecture and historical documentation were preserved.

## K. Known limitations

- CSV only; XLSX remains deferred.
- One person per staffing slot; no automatic reporting-tree access or multiple preparers/reviewers.
- Codes are manual; recurring is an indicator only.
- Imports: 500 rows / 1 MB. Exports: 10,000 matching rows. Bulk changes: 100 selected records. Client picker: 30 matching choices, refine search as needed.
- Optional column choices are local to the current page session.
- Expired uncommitted import payloads need a deployment retention/cleanup job.
- CSV exports are work trackers, not full backups of all notes/custom fields/history.
- Existing production-hardening notes remain applicable. Browser fixtures remain in the local demo database.
- No workflow stages, time entry, Actual Hours calculation, billing, notifications, or other excluded modules were built.

## L. Manual test path

1. Sign in as `admin@demo.setu.test` using the existing development password. Open Engagements.
2. Search for ABC001; filter by service/status/priority/staff/date. Open Due This Week and Overdue summary links, customize columns, and export CSV.
3. Open Clients → ABC Manufacturing LLC → Engagements. Choose New Engagement. Verify Client, Office, Partner, and Manager defaults; select service/type, enter a unique code/name, dates, and budget. Create it.
4. Open Edit Engagement and change Budget Hours. In Change Status, complete with a date, then reopen. Review Activity for preserved completion and budget changes.
5. Open Team/Reassign. Change Preparer and Allocation Date, save, reopen the record, and inspect Activity.
6. Open Engagement settings; create/edit/deactivate/reactivate a type and inspect custom fields. No deletion is exposed.
7. Open Import Engagements. Download the template, use a new code and valid Client/service/type/office, upload, map, preview, then confirm. Add an unknown Client Code row to inspect explicit rejection/error-report behavior.
8. Sign in as `manager@demo.setu.test`, `senior@demo.setu.test`, and `associate@demo.setu.test` to compare scoped lists. Associate sees only their Preparer assignments and has no mutation/import/export controls.

Screenshots: `.local/ui/build3/engagements.png`, `engagements-mobile.png`, `client-engagements.png`, `engagement-create.png`, `engagement-overview.png`, `engagement-team.png`, `engagement-activity.png`, `engagement-settings.png`, `engagement-import.png`.

## Materially created or changed modules

| Area | Files/modules |
| --- | --- |
| Database | prisma/schema.prisma; 202609290001_engagement_master migration |
| Domain | src/lib/engagements.ts; engagement-validation.ts; engagement-constants.ts; engagement-csv.ts; engagement-api.ts; engagement-page.ts |
| Shared architecture | src/lib/permissions.ts; provision.ts; clients.ts; custom-field-values.ts; client-csv.ts |
| API boundary | src/app/api/[...path]/route.ts |
| Engagement UI | Six page routes under src/app/(workspace)/engagements; src/components/engagements form/list/detail/settings/types |
| Client integration/shared UI | Client Detail page and component; clients/fields.tsx; clients/client-import.tsx |
| Shell/styles | navigation.tsx; workspace [section] page; globals.css; engagements.css |
| Seed/runtime | prisma/seed.ts; seed-engagements.ts; local-utf8.ts table ordering |
| Tests | tests/engagements.test.ts; e2e/engagements.spec.ts |
| Documentation | README.md; BUILD3.md; this report |

## M. Ready for Build #4?

**YES.** All Build #3 Definition of Done checks passed. Build #4 has not been started.
