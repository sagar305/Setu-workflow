# Build #8 verification — 5 October 2026

## Executed

- Prisma schema validation passed.
- Prisma client generation passed after stopping the local development server to release its Windows DLL lock. The server was restarted in the background.
- Migration `202610050001_time_entries` deployed successfully to local `setu_test` and `setu` databases.
- `vitest run tests/time.test.ts`: **8 tests passed** in the final run.
- `playwright test e2e/time.spec.ts`: **1 Chrome test passed** in the final run, with no browser page errors.
- Full configured ESLint scope passed once after primary implementation. Targeted lint of the final changed time files and tests also passed.
- TypeScript `tsc --noEmit` passed, including a final check after adding historical-week selection and custom-role tests.
- One production `next build` passed compilation, TypeScript, page generation and route collection. It was executed before the final historical-week selector was added; that small follow-up was subsequently covered by TypeScript, lint, service tests and Chrome rather than repeating the build.
- `git diff --check` passed; Git emitted only line-ending notices.

## Coverage

The service tests cover decimal/date validation; positive hours and precision; zero/null budgets; deterministic threshold warnings; draft creation/edit/deletion; owner-only changes; stale revisions; duplicate creation and concurrent submission; serialized daily limits; submitted edit restrictions; required correction reasons; audit before/after history; retention of previously finalized records; direct-database finalized-edit rejection; cross-firm and engagement authorization; foreign stage/checklist validation; checklist-stage mismatch; linked allocation context; unchanged workflow/checklist/allocation state; submitted-only actuals; cancelled-allocation exclusion; precise remaining/percentage/employee calculations; My Time periods; historical weeks; and independent custom-role grants.

The Chrome test covers an owned My Work allocation, engagement prefill, blank actual-hours input, draft saving, My Time navigation, editing, submission, removal of ordinary edit controls, engagement budget figures and employee breakdown, authorized correction, actuals recalculation, historical-week selection and browser error collection.

Initial tests exposed a blank-input Decimal exception and a cancelled-allocation fixture missing `cancelledAt`. Both were diagnosed and corrected before successful reruns. The sandbox initially prevented Prisma engine execution; the installed engine was then used with approved elevated execution. No dependency upgrade or engine download was needed.

## Not executed

- Full Builds #1–#8 Chrome regression or the complete service test suite.
- Formal approval/rejection tests: V1 deliberately implements Draft → Submitted with audited return-to-draft correction.
- Production deployment, remote database migration, load testing or broad historical-data performance testing.

Existing uncommitted Build #7 changes were preserved. No unrelated module refactor or Build #9 work was undertaken. Test-created local demo fixtures remain available for inspection; no bulk seed data was added.
