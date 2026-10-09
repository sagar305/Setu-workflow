# Build #9 verification — 6 October 2026

## Executed checks

- Prisma schema validation and client generation passed using the installed engines.
- `202610060001_capacity` deployed successfully to local `setu_test` and `setu`.
- `vitest run tests/capacity.test.ts`: all **9 tests passed**.
- After the browser-discovered employee-status fix, the two affected aggregation/inactive-employee tests passed again with explicit `employeeStatus` assertions; seven unrelated cases were intentionally skipped in that focused rerun.
- `playwright test e2e/capacity.spec.ts`: **1 Chrome workflow passed**, with no page errors. It exercises adjustment save, preselected assignment employee, overload preview, confirmation, daily detail, next/previous navigation, existing reassignment controls, refreshed capacity and unchanged engagement staffing.
- The configured full ESLint scope passed once after primary implementation; targeted lint passed after subsequent UI/test edits.
- `tsc --noEmit` passed after primary implementation and after the employee-status UI fix.
- One production `next build` passed compilation, TypeScript, page generation and route collection, including `/team/capacity`. This build preceded the final employee-status fix; that fix was verified by targeted tests, lint, TypeScript and Chrome without repeating the production build.
- The small capacity demo seed completed locally: one engagement, 13 allocations and one adjustment, using existing employees.
- `git diff --check` passed with only Git line-ending notices.

## Service-test coverage

Default weekly capacity; exact daily rounding; zero-capacity and 80/100% boundaries; Sunday/year/timezone boundaries; 1/2/4-week periods; adjustment creation/edit/cancellation; revision conflicts; additive overlap and zero floor; audit identity/timestamps; invalid reductions/date periods; cross-firm employee and adjustment rejection; unauthorized role rejection; adjustment-aware allocation warnings; planned aggregation and cancelled-allocation exclusion; daily/employee drill-down; actual submitted hours without double counting; future actual suppression; assignment/reassignment without staffing or time-entry changes; unscheduled current stages/checklist items without fabricated hours; inactive-employee handling; custom permission grants; direct-report scope; hidden-engagement aggregate workload with protected details; default-capacity bounds and existing audit history.

## Issues diagnosed during verification

The database was stopped at the beginning of the migration test. Its existing local service was restarted; no database replacement/reset was performed. A missing brace in a query was corrected during formatting. An initial test spy interfered with Prisma's query proxy; the spy was removed and the database integration tests then passed. Chrome exposed an overloaded `status` property hiding action buttons and labelling active employees as inactive. Employee status is now carried separately as `employeeStatus`; the corrected Chrome flow and focused regression tests passed.

## Not executed

No complete Builds #1–#9 browser regression, complete historical service suite, production deployment, remote migration, load test or broad repository review. Existing uncommitted Builds #7/#8 changes were preserved. No Build #10 work was started.

The local database and development app were restarted and left running. Focused Chrome fixture records remain in the local demo database; no production data was touched. Current default capacity/status is used for selected historical periods, and large-team pagination/load behavior remains outside this build's validation.
