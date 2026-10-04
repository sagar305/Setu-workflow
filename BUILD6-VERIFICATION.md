# Build #6 verification — 4 October 2026

## Checkpoint and environment

The repository initially had no commits and all application files were untracked. Commit `a31066e` preserves Builds #1–#5 before changes, using a commit-scoped `Codex Checkpoint` identity because Git had no author configured. No existing files or database records were discarded. The missing Build #5 verification document was restored with only outcomes actually observed in this session.

Read the installed Next.js route-handler guide before implementation. Used the existing PostgreSQL development database and dedicated `setu_test` database. Prisma engine generation and the test/server processes required sandbox elevation. Initial engine/network and database-start attempts did not pass; migration succeeded after the existing local database was running.

## Executed checks

| Check | Result |
| --- | --- |
| Prisma schema validation | Passed |
| Additive migration generation and Prisma Client generation | Passed |
| `scripts/test-migrate.ts` | Checklist migration applied successfully to `setu_test` |
| `prisma migrate deploy` | Checklist migration applied successfully to local `setu` |
| `prisma/seed.ts` | Passed; existing data preserved, checklist demo drafts added |
| `tests/workflows.test.ts` | 25 passed |
| `tests/allocations.test.ts` | 32 passed |
| `tests/checklists.test.ts` | 8 passed after correcting AuditLog history ordering to use `timestamp` |
| Full configured ESLint scope | Passed after retrying a scan that encountered a deleted temporary implementation script |
| TypeScript `--noEmit` | Passed after correcting the AuditLog field |
| `pnpm build` | One production build executed and passed, including Next.js TypeScript checking |
| `e2e/checklists.spec.ts` using installed Chrome | 1 passed; final run 14.6 seconds |

The initial targeted database run passed 64 of 65 tests; its sole failure was the checklist AuditLog timestamp-field mismatch. The complete checklist file was rerun after that fix; all eight passed. The workflow and allocation suites were not repeatedly rerun.

The focused Chrome test verifies draft checklist creation through the editor, publication, runtime instantiation, instructions, comments, completion, percentage, reopening and My Work, with no browser page errors. Early attempts found a missing development server and overly broad/title-dependent test locators. The final functional attempt exposed a real server/browser date-format hydration mismatch; checklist event timestamps now render deterministically with an explicit UTC label. The test passed after that correction.

The production build preceded two small final UI corrections: allowing checklist-only roles to see My Work without allocation permission, and deterministic checklist timestamps. To honor the one-build limit, production compilation was not repeated. The final UI changes received TypeScript and targeted ESLint checks; the timestamp change also passed the focused Chrome test on the development server. The checklist-only-role branch has not had a dedicated browser test.

## Coverage and boundaries

Checklist database tests cover template creation/copy/edit/reorder/removal, published immutability, runtime snapshots and retry protection, default and manual ownership, reassignment, reasons, status changes, completion/reopening audit history, comments/authorship, 75% progress with Not Applicable exclusions, empty progress, required-item gates and override auditing, whole-workflow final validation, closed-stage mutation rejection, tenant/record isolation, unavailable-attachment authorization, evidence blocking, concurrent revisions, stale workflow movement, database foreign keys/history protection and My Work without allocation-budget changes.

**Not executed:** complete Builds #1–#5 Chrome regression suites, foundation/client/engagement service suites, a full browser/RBAC matrix, load testing, or persistent file transfer tests. File transfer cannot be tested as functional because no secure storage provider exists. Earlier verification documents describe historical runs, not fresh results from this build. Failure-only screenshots/traces were produced by the existing Playwright configuration; no screenshot regeneration campaign or full browser regression was performed.

## Manual verification

1. Open the local app at `http://127.0.0.1:3000` using an existing demo management account. Credentials remain in the existing local configuration; they were not changed.
2. Open Templates and a newly seeded checklist draft (Monthly Close, Monthly Bookkeeping, 1040, 1065, 1120S or Audit / Assurance). Expand a stage and item. Edit instructions, reorder items, save and publish. Confirm editing now requires a new version.
3. Create an eligible engagement with appropriate staffing and apply that version in Workflow. Open Checklist. Check copied instructions, owners, due dates and required flags. Changing another draft must leave these items unchanged.
4. Start an item, block it with a reason, add a comment, complete it and reopen it with a reason. Expand activity entries to see the retained completion and reopening events. Timestamps display UTC explicitly.
5. Mark an item Not Applicable with a reason and verify the completed/applicable count and percentage. Reassign an item to an eligible employee and inspect My Work as that employee; planned allocation hours must not change.
6. Attempt a forward transition with an incomplete required item. Confirm it is blocked. As an authorized workflow manager, provide an override reason; confirm the audit entry. Final workflow completion still checks earlier unresolved required items.
7. Open one item in two tabs, save in one, and submit the old revision in the other. Expect a refresh/conflict message. A workflow movement screen opened before a checklist requirement/status change must also reject its stale revision.
8. Create an evidence-required item. Its attachment section must clearly say storage is unavailable, and completion must be refused. No successful upload/download is claimed.
9. Use another firm's account or an employee not staffed on the engagement; direct URLs/API requests must not expose its checklist, comments, attachments or actions. Configure custom permissions explicitly where needed.

## Readiness

The checklist engine is ready to serve as the foundation for Build #7. Persistent secure evidence storage remains an explicit limitation allowed by the Build #6 scope. Existing engagement workflows were not retroactively populated; use a new published checklist version for new workflows, or authorized manual items on unfinished stages. Build #7 was not started.
