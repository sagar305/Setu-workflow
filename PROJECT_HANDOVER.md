# Setu Workflow — project handover

**Build #7 update, 4 October 2026:** The unified Queries / Open Points Engine now extends Builds #1–#6. Read `BUILD7.md` and `BUILD7-VERIFICATION.md` first for current routes, lifecycle rules, workflow/checklist integration, security, migration and executed tests. Work started from clean checkpoint `3405afe` / `setu-build-6-checkpoint`. Persistent attachments remain unavailable. Build #8 has not been started. The older assessments below are historical.

**4 October 2026 update:** Build #6 extends this repository with the Checklist Engine. The original Builds #1–#5 working directory was saved in Git checkpoint `a31066e`. The earlier untracked-file warning below is historical. Read `BUILD6.md` and `BUILD6-VERIFICATION.md` for the current implementation, migration, evidence-storage limitation and actual verification results before using the older assessment below. Build #7 has not been started.

Assessed from the local repository on 3 October 2026. This document is a starting point for a fresh conversation; previous chat history is not required.

## Workspace and assessment scope

- Repository: `C:\Users\Juhi\Documents\ChatGPT\Setu Workflow for firms`.
- The repository is accessible and contains the existing application, dependencies, migrations, tests, and build documentation.
- This assessment inspected source and documentation only. No installation, migration, seed, test, browser check, or database operation was performed. Application code and data were not changed.
- Status below means implemented in the inspected code, not freshly verified at runtime.
- Git currently reports the application files as untracked. Preserve this working directory; do not assume Git history can restore it. No commit, reset, or cleanup was performed.

## Architecture

Multi-tenant CPA/accounting-firm application using Next.js App Router 16.3.6, React 19.2.4, TypeScript, Tailwind CSS 4, PostgreSQL, Prisma 6.19.3, and Zod. `package.json` defines commands; `pnpm-lock.yaml` records dependencies.

- `src/app/(workspace)/`: protected pages; `src/app/(auth)/`: authentication screens.
- `src/app/api/[...path]/`: JSON API boundary; module API dispatchers live in `src/lib/`.
- `src/lib/`: authenticated business services, permissions, validation, CSV handling, and database access.
- `src/components/`: existing forms and module interfaces; styles in `src/app/*.css`.
- `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed*.ts`: shared models, database constraints, and demo provisioning.
- `tests/`: Vitest database/security tests; `e2e/`: Playwright browser tests.

Reuse the existing Firm, User, Role, Permission, AuditLog, Client, ServiceLine, EngagementType, and Engagement models. Firm identity comes from the server session. Scoped services and composite foreign keys enforce tenant boundaries; PostgreSQL row-level security is not enabled. `auth.ts` provides permission checks, transactional firm locking, identity revalidation, and audit writes. Engagement services additionally enforce record visibility. Do not bypass these services with unscoped Prisma calls.

## Current module status and entry points

| Area | Implemented scope | Relevant files/routes |
| --- | --- | --- |
| Firm Master / foundation | Tenant identity and firm settings; offices; users/invitations; custom roles and permissions; password authentication/reset; sessions; audit records. Firm provisioning is internal, not a public registration or cross-firm master-management screen. | `/admin/firm`, `/admin/offices`, `/admin/users`, `/admin/roles`; `src/lib/admin.ts`, `auth.ts`, `session.ts`, `permissions.ts`, `provision.ts`, `validation.ts`; `src/app/(workspace)/admin/` |
| Client Master | Client records, addresses, contacts, entity types, service associations, ownership, custom fields, activity, search/filtering, CSV import/export, and bulk changes. Active primary contact requires email and phone. Email Reminder opens an editable mail draft; it does not send email. | `/clients`, `/clients/new`, `/clients/import`, `/clients/settings`, `/clients/[clientId]`; `src/lib/clients.ts`, `client-validation.ts`, `client-api.ts`, `client-csv.ts`, `client-reminder.ts`; `src/components/clients/` |
| Engagement Master | Client-linked engagements, types, service lines, Partner/Manager/Reviewer/Preparer staffing, lifecycle and assignment history, priority, periods, dates, budgets, custom fields, CSV import/export, pagination/filtering, and record-level access. | `/engagements` and detail/new/edit/import/settings routes; `src/lib/engagements.ts`, `engagement-validation.ts`, `engagement-api.ts`, `engagement-csv.ts`; `src/components/engagements/` |
| Workflow Templates & Stages | Template builder, ordering, publication, versions, duplication/archive, compatible defaults/application, independent runtime snapshots, transitions, owner assignment, history, stage age/targets, list integration, and limited My Work queue. | `/templates`, `/templates/[templateId]`, Engagement detail Workflow tab, `/my-work`; `src/lib/workflow-templates.ts`, `workflows.ts`, `workflow-api.ts`, `workflow-validation.ts`, `workflow-constants.ts`; `src/components/workflows/`; `src/app/workflows.css` |

## Workflow design to preserve

- Blueprint models: `WorkflowTemplate` and `WorkflowTemplateStage`. Versions share a family ID; lifecycle is Draft → Published → Archived. Published definitions are preserved by service rules and database triggers. Changes use a new draft version; duplication creates a separate template family.
- Runtime models: `EngagementWorkflow` and `EngagementWorkflowStage`. Applying a compatible published template copies stage definitions, including explicit start/completion semantics, owners, instructions, targets, and required flags. Later template changes do not alter the snapshot.
- `WorkflowMovement` records Start/Forward/Return/Reassign/Skip/Complete/Reopen with stage/user transfers, actor, timestamp, reason, and revision. `StageVisit` preserves repeated visits and assignment-duration segments. AuditLog remains separate.
- Stage owners resolve from Engagement staffing, a specific same-firm user, or manual assignment. Ownership overrides require authorization.
- Transitions check permission, Engagement visibility, ownership/management authority, target membership, current stage, and revision. Stale requests receive a conflict. Mutations are transactional; database indexes/triggers protect one current stage and one open visit for active workflows.
- Starting sets Engagement In Progress; completion sets Completed; reopening restores In Progress while preserving historical completion events. Engagement status remains separate from workflow stage. On Hold/Cancelled block transitions until resumed.
- Stage age counts calendar midnight boundaries in the Firm timezone, includes hold time, and does not reset on reassignment. Targets are informational; no escalation engine exists.
- V1 supports one lifetime workflow instance per Engagement, optional-stage skipping only, and accessible up/down ordering. No runtime replacement/deletion or required-stage bypass.

## Database and local data

Six migration directories exist: `202609230001_foundation`, `202609280001_client_master`, `202609280002_client_date_constraint`, `202609290001_engagement_master`, `202609290002_workflow_engine`, and `202610010001_workflow_management`. Their current database deployment state was not checked today.

`scripts/local-db.ts` supplies the documented local PostgreSQL setup at `127.0.0.1:55432`; application origin is documented as `http://127.0.0.1:3000`. `.env` contains local configuration/secrets and `.local/` holds local runtime data. Neither was inspected for sensitive values or modified. Preserve both. Do not reset databases or reseed merely to resume development.

## Verification evidence and boundaries

`BUILD4-VERIFICATION.md`, dated 2 October 2026, records 117 passing database tests (16 foundation, 37 client, 39 engagement, 25 workflow), 20 passing browser tests, and successful lint, type checking, and production build. These are prior recorded results, not checks performed during this assessment.

Relevant suites: `tests/security.test.ts`, `clients.test.ts`, `engagements.test.ts`, `workflows.test.ts`; corresponding browser suites under `e2e/`. `npm test` also invokes test-database migrations: do not treat it as a read-only assessment command.

Dashboard remains a foundation overview; Team and Reports remain placeholders. Detailed checklists, questions/open points, deliverables, time/actual hours, capacity/utilization, billing, client portal, document management, integrations, and automated workflow notifications are outside the implemented stage. My Work is only the current-stage ownership queue.

Read `BUILD2.md`, `BUILD3.md`, and `BUILD4.md` for module details as needed. Earlier README/build sections and the generic `[section]` route contain historical placeholder language; concrete module routes and current services take precedence.

## Continuation instructions

1. Read this handover and the user's new stage request; inspect only relevant code next.
2. No next development stage has been approved in this assessment. Do not infer authorization for a later module from Build #4's completion report.
3. Summarize the proposed change, relevant files, and incremental approach; wait for user approval before changing application code.
4. Preserve existing functionality, data, tenancy, configurable permissions, audit/history, and the design system. Extend rather than rebuild.
5. Follow `AGENTS.md`: read relevant installed Next.js guidance under `node_modules/next/dist/docs/` before writing code.
6. Keep verification proportional to approved changes. Do not install, migrate, run browser verification, or execute full suites without new authorization.

Build #8: TimeEntry runtime model, submitted actuals, My Time, allocation quick entry and Budget & Hours are implemented. Migration 202610050001_time_entries is applied locally. See BUILD8.md for correction policy and BUILD8-VERIFICATION.md for targeted verification. Build #9 has not started.

Build #9 adds /team/capacity and CapacityAdjustment while reusing existing weekly capacity, WorkAllocation, TimeEntry and assignment controls. See BUILD9.md for scope/calculation policy and BUILD9-VERIFICATION.md for targeted checks. Build #10 has not started.

Build #10 is now implemented: /dashboard, /reports and scoped dashboard/report/export APIs. Local migration 202610060002_reports grants default management report capabilities. See BUILD10.md and BUILD10-VERIFICATION.md. Earlier statements that Builds #9/#10 have not started are historical. Stop at V1; no later build or full regression is authorized. Existing uncommitted work from preceding builds is preserved.

20 October 2026: Added public firm-admin signup and 15-day firm trial lifecycle. Local/test migration 202610200001_firm_trials applied; existing firms remain unrestricted. Expiry is checked in the shared tenant mutation boundary and business POST routes. Signup uses email activation, starts the clock only on activation, and defaults continuation contact to hello@setutechnology.com. See TRIAL-ONBOARDING.md for tests, mail/hosting prerequisites and the operator-only maintenance command. This change is local and does not itself deploy external hosting.
