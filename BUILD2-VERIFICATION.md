# Build #2 verification and handover

Completed September 29, 2026. The local preview is `http://127.0.0.1:3000/clients`. If redirected, sign in with an existing demo account; the development password is `SEED_PASSWORD` in the private `.env` file.

## A. Implemented

Client Master CRUD without destructive deletion; all six statuses; same-firm office/partner/manager ownership; primary address; multiple services; multiple contacts with primary/deactivate/reactivate; five custom field types; readable activity history; configuration catalogs; server search/filter/sort/pagination; per-user column choices; bulk status/ownership updates; CSV preview/import/export. Engagements remains a disabled future tab.

## B. Database

Nine models: Client, ClientAddress, ClientContact, EntityType, ServiceLine, ClientServiceLine, ClientCustomFieldDefinition, ClientCustomFieldValue, ClientImportJob. Two additive migrations: `202609280001_client_master` and `202609280002_client_date_constraint`. Both deployed successfully to development and test databases. Idempotent seed completed and was rerun successfully. Local WIN1252 databases were preserved and converted to UTF-8; see BUILD2.md for backup details.

## C. UI

Routes: `/clients`, `/clients/new`, `/clients/{id}`, `/clients/{id}/edit`, `/clients/settings`, `/clients/import`. Existing navigation and dashboard wording now identify Build #2. Responsive list/form/detail pages retain the Build #1 visual language.

## D. Security

Session-derived firm context, server-side permissions, composite tenant foreign keys, firm-lock transactions with session recheck, no standard deletion, optimistic version checks, primary-contact uniqueness, input validation, and existing Origin protections. Cross-tenant reads, writes, assignments, contact access, staged imports, and export boundaries tested. Read-only controls are hidden and forbidden operations rejected by the server. Client activity omits raw audit metadata and credentials.

## E. Import/export

UTF-8 CSV template and upload, optional column mapping, row validation with downloadable error report, preview without client writes, explicit confirmation, atomic valid-row commits, creator-bound expiring previews, idempotent commits, and actor audit. Export applies all active filters across pages. Formula escaping is enabled. XLSX is deferred as permitted by the specification.

## F. Tests and exact commands

All commands ran from the repository root. Direct Node entry points were used because npm is not on this machine's PATH.

| Check | Result |
| --- | --- |
| Original Build #1 baseline before implementation | 16 database + 6 browser tests passed |
| Final database suite | **53/53 passed** (37 Client Master + 16 foundation) |
| Full browser suite | **11/11 passed** (5 Client Master + 6 foundation) |
| TypeScript | Passed, no errors |
| ESLint | Passed, no errors/warnings |
| Next.js production build | Passed; all six client routes compiled |
| Development/test migrations | Both current |
| Seed rerun | Passed; existing records skipped |

```powershell
node node_modules/prisma/build/index.js migrate deploy
node node_modules/tsx/dist/cli.mjs scripts/test-migrate.ts
node node_modules/tsx/dist/cli.mjs prisma/seed.ts
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src scripts tests e2e prisma *.ts *.mjs
node node_modules/next/dist/bin/next build
```

An additional focused browser run refreshed screenshots after fixing capture scroll position:

```powershell
node node_modules/@playwright/test/cli.js test e2e/clients.spec.ts
```

The UTF-8 repair was executed once with the application stopped:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/local-utf8.ts
```

Initial checks found and resolved local service availability, database encoding, invalid test fixture code lengths, an incomplete SQL year-end constraint, and a screenshot capture/hydration interaction. A test-fixture property typo was corrected before the final successful typecheck. No known failing checks remain.

Coverage includes duplicate code/name behavior, typed values, inactive references, stale edits, primary-contact concurrency, direct database tenant constraints, Unicode, 1,000-record pagination, bulk atomicity, rollback after import reference changes, formula-safe exports, and browser-level denied access. Browser tests now fail on page errors and hydration errors.

## G. Build #1 regression

All original tests remain passing: authentication/logout, invitation/reset lifecycle, user and firm suspension, permission changes and escalation prevention, offices/custom roles/firm settings, tenant boundaries, Origin checks, rate limits, and mobile navigation. Existing authentication, password storage, sessions, permissions, and AuditLog were extended rather than replaced.

## H. Known limitations

- CSV only; XLSX is a future enhancement.
- Imports: up to 500 rows / 1 MB. Exports: up to 10,000 filtered clients. Bulk actions: at most 100 selected clients.
- All users with `clients.view` see their firm's clients until Build #3 defines engagement visibility.
- Expired uncommitted import payloads require a deployed cleanup/retention job; expiry already blocks commit.
- CSV exports contain directory/template fields, not every contact/custom field or a full backup.
- Existing Build #1 production-hardening requirements remain. Browser fixture records remain in the local demo database.

## I. Screenshots and manual path

Local screenshots are in `.local/ui/build2/`: `clients.png`, `clients-mobile.png`, `client-overview.png`, `client-activity.png`, `client-settings.png`, and `client-import-preview.png`.

1. Log in as `admin@demo.setu.test` and open Clients. Search for ABC, filter by Tax, change columns, and export.
2. Open ABC Manufacturing LLC. Inspect Overview, Contacts, Services, Custom Fields, and Activity.
3. Create a client with a unique code, assign an office/partner/manager, select two services, and add a primary contact. Edit it, change status, and check Activity.
4. Add another contact, switch primary, deactivate/reactivate, and verify the old records remain.
5. Open Client settings to inspect Entity Types, Service Lines, and Custom Fields.
6. Open Import Clients, download the template, use a new client code and a valid office, upload, preview, and confirm. Include one invalid office row to inspect the error report.
7. Use the Associate demo account to verify read-only access; it cannot create, import, export, or edit.

## Materially created or changed modules

| Area | Files |
| --- | --- |
| Database | `prisma/schema.prisma`, both new migration folders |
| Seed / local runtime | `prisma/seed.ts`, `prisma/seed-clients.ts`, `scripts/local-db.ts`, `scripts/local-utf8.ts` |
| Existing authorization | `src/lib/auth.ts`, `admin.ts`, `permissions.ts`, `provision.ts` |
| Client domain | `src/lib/clients.ts`, `client-validation.ts`, `client-constants.ts`, `client-csv.ts`, `client-api.ts`, `client-page.ts` |
| API boundary | `src/app/api/[...path]/route.ts` |
| Pages | Six page files under `src/app/(workspace)/clients/` |
| Components | `src/components/clients/` forms, list, detail, import, settings, fields, and types |
| Existing shell / styles | `src/components/navigation.tsx`, `src/app/(workspace)/[section]/page.tsx`, `src/app/globals.css`, `src/app/clients.css` |
| Tests | `tests/clients.test.ts`, `e2e/clients.spec.ts` |
| Dependencies / documentation | `package.json`, `pnpm-lock.yaml`, `README.md`, `BUILD2.md`, this report |

## J. Ready for Build #3?

**YES.** All Build #2 Definition of Done checks passed. No Build #3 implementation has been started.
