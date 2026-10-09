# Build #10 — Verification

Executed locally on 7 October 2026. This report covers Build #10 only; prior-build work remains uncommitted and preserved.

## Executed

- Applied `202610060002_reports` to `setu_test` and local `setu`; no reset and no new operational data model.
- `vitest run tests/reports.test.ts`: **6 passed**. Initial fixture failures were corrected to respect immutable runtime definitions, blocked-item reasons and mandatory assignees; the final run passed.
- Focused browser journey in `e2e/reports.spec.ts`: **1 passed**. Dashboard → health → source; all six report pages and CSV endpoints; Clients, Engagements, My Work and Team Capacity; exact selected Workflow, Assignments, Checklist, Queries and Budget & Hours tabs; employee My Day; hidden Reports navigation; denied employee budget export; no browser page errors.
- Additional filtered-link browser check: **1 passed**. Active count resets active scope and preserves search; pipeline and budget-report links preserve portfolio search. Run separately after the link fix, without repeating the complete browser journey.
- Full project ESLint: passed after primary implementation. Changed dashboard/test files: targeted lint passed after final link correction.
- TypeScript: initial conditional Prisma selection issue corrected; subsequent typecheck passed. A final typecheck covers the last link/test edit.
- `next build`: **passed once** (Next.js 16.3.6), including compilation, TypeScript, page collection and generation. This build preceded the final dashboard URL-preservation-only correction; that correction received its focused browser, lint and type checks. Production build was not repeated, as requested.

## Coverage represented by the six service tests

1. Tenant isolation before dashboard/report aggregation and CSV export; hidden engagement exclusion; unauthenticated export denied; employee report permission denied.
2. Custom reports.view grant cannot reveal unassigned records; source permissions suppress workflow/checklist/point fields; direct budget, points, workflow, checklist and capacity reports denied without underlying rights; separate export permission required.
3. Firm-local deadlines, overdue/due-soon exceptions, workflow entry age and reset, target stagnation, blocking and overdue points, knowledge exclusion and aging bucket, blocked/required checklist attention and distinct employee counts, overdue report filter.
4. Draft time excluded, submitted actuals included, planned hours separate, decimal totals and budget warning/exceeded priority, workload overload and filtered capacity group.
5. All six CSV headers and filtered contents, export independent of page number, formula escaping, no view-audit noise, invalid filters rejected, unscheduled responsibility exception.
6. Grouped checklist progress matches existing item-level rules, including Not Applicable denominator and required outstanding items.

## Not executed / limits

- No full Builds #1–#10 unit or browser regression, no full old-build workflow retest and no deployment.
- No exhaustive role-by-role transactional manual acceptance, visual screenshot review, accessibility audit, production load test or large-export stress test.
- Six service tests group multiple assertions; they are not 22 separate test cases. The high-level navigation check does not prove all historical mutation paths.
- Production build was not rerun after the final link-only change. Local development preview is available at http://127.0.0.1:3000.
- XLSX/PDF, saved filters and global search were not implemented. Existing production-hardening considerations in the project handover remain applicable.

## Recommended manual V1 acceptance

1. Admin: create/configure users and verify intended capabilities.
2. Manager: choose/create client and engagement, apply workflow, allocate work.
3. Preparer: find My Work, complete checklist, raise/respond to points, submit time.
4. Reviewer: review, return and resolve a point; confirm workflow entry aging follows movement.
5. Manager: inspect deadline, budget and capacity exceptions and follow each to source.
6. Partner: inspect dashboard and all six reports; verify filtered CSV contents.
7. Repeat representative visibility checks with a restricted custom role and second firm, including direct report/export URLs.

Assessment: implemented and locally verified for focused V1 acceptance. This is not a claim of full regression coverage or production deployment readiness. Stop here; no later build started.
