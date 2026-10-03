# Build #4 verification — rechecked 2 October 2026

The current checkout was rechecked after newer Client Master primary-contact validation changes were present. Those changes initially blocked Client, Engagement, and Workflow fixtures and introduced two missing-relation type errors and a JSX lint error. The primary-contact requirement was preserved: scoped client reads now load the active primary contact, regression fixtures supply valid contact data, and the contact lifecycle test requires a replacement before deactivation. The full database suite passed again (117/117), as did lint, type checking, migration deployment, idempotent seeding, and the production build. The repaired Client browser suite passed 5/5.

## Baseline and regression

Before Build #4 extension, the Builds #1–#3 baseline passed: 92 Vitest tests and 16 Chrome/Playwright tests, with the original four migrations current. Build #4 retains those suites and adds workflow-specific coverage.

The final combined database run passed **117/117 tests** across four suites:

| Suite | Passed |
| --- | ---: |
| Foundation authentication, roles, tenant isolation | 16 |
| Client Master | 37 |
| Engagement Master | 39 |
| Workflow templates/stages | 25 |

The combined Chrome browser run passed **20/20 tests**: six foundation, five Client, five Engagement, four Workflow. The standalone Engagement lifecycle test explicitly chooses “No workflow yet,” retaining its original assertions; workflow creation/default/confirmation and Draft behavior are tested separately.

## Commands executed

All commands ran from the repository root against local development/test PostgreSQL. No database reset was used.

| Exact command | Result |
| --- | --- |
| `node node_modules/prisma/build/index.js validate` | Passed: schema valid |
| `node node_modules/prisma/build/index.js migrate deploy` | Passed: workflow engine and management grants deployed |
| `node node_modules/tsx/dist/cli.mjs scripts/test-migrate.ts` | Passed: same migrations deployed to isolated test database |
| `node node_modules/prisma/build/index.js migrate status` | Passed: six migrations, schema current |
| `node node_modules/tsx/dist/cli.mjs prisma/seed.ts` | Passed: prior firms/clients/engagements preserved; six demo templates and compatible runtime examples ready |
| `node node_modules/eslint/bin/eslint.js src scripts tests e2e prisma *.ts *.mjs` | Passed: no lint errors |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed: no type errors |
| `node node_modules/vitest/vitest.mjs run` | Passed: 117 tests, four suites |
| `node node_modules/@playwright/test/cli.js test` | Passed: 20 tests, one Chrome worker |
| `node node_modules/next/dist/bin/next build` | Passed: optimized build, TypeScript and route generation; Templates and My Work compiled as dynamic routes |
| `node node_modules/@playwright/test/cli.js test e2e/workflows.spec.ts -g 'apply preview'` | Passed: final movement walkthrough and settled mobile screenshot, 1/1 |

All Build #4 Definition of Done requirements are satisfied. Builds #1–#3 remain covered by passing regressions. Ready for the next controlled build; no later module has been started.

Prisma reports the existing package.json configuration deprecation notice for a future major version; the project remains pinned to Prisma 6.19.3. Chrome test processes emit the existing NO_COLOR/FORCE_COLOR notice. Neither warning fails a check.

## Workflow coverage and UI walkthrough

Template tests cover create/add/reorder/publish, explicit stage semantics, immutable published definitions at service/database level, new versions, duplication, archiving, snapshot independence and tenant isolation. Runtime tests cover owner resolution, forward/return with reason, repeated visits, optional skip/required rejection, reassignment segments, completion/reopen history, compatible defaults, creation/application, hold/cancellation behavior, inactive-owner recovery, and separate workflow-view permission.

Concurrency tests submit two simultaneous transitions from the same revision: exactly one commits and one receives 409, leaving one Current stage and one open visit. Other tests reject direct database state corruption, foreign owners and targets, history deletion, unauthorized operations, record-visibility bypass, and cross-firm reads/copies/edits/application/movement/history. Calendar-day tests include firm-local midnight and DST.

The browser walkthrough executes the real UI in Chrome: build/reorder/publish/version/duplicate/archive; preview/apply; forward to Preparation; reassign to Manager; skip optional Questions; return from Review to Preparation with a reason; advance and complete; reopen to Preparation; inspect preserved history; expose workflow list columns; open the Preparer's My Work queue; verify restricted action buttons and mobile viewport behavior. It also checks template defaults, explicit application confirmation, Save as Draft, forbidden API operations and stale conflicts. Page errors and hydration errors are asserted absent.

An additional interactive in-app-browser walkthrough used the existing test Engagement `WF-UI-1790862259005`: Preparation → Questions → return to Preparation with a reason; reassign James Wilson → Daniel Brooks without changing stage entry; advance through Questions/Review/Filed; Complete; Reopen to Preparation with a reason. The final screen showed Engagement In Progress, owner James Wilson, and both the completion and reopening events. Screenshot: `.local/ui/build4/manual-reopened.png`. No real client messages or notifications were sent.

Screenshots were captured under `.local/ui/build4/` and visually inspected, including template builder, workflow history, and mobile workflow. Movement history uses readable cards so comments remain visible without an eight-column horizontal grid. Visit segments retain a horizontally scrollable table on narrow screens.

## Manual review path

1. Open `http://127.0.0.1:3000/login`. Log in with your existing `admin@demo.setu.test` credentials (development seed password from your local setup).
2. Choose **Templates**. Open **Form 1120S** or **Monthly Close**. Inspect the published version, default owners and target days. Click **Create New Version**, edit/reorder a draft, **Save Draft**, then **Publish → Confirm Publish**. Return to V1 to verify its unchanged definition.
3. Choose **Engagements** and search `ABC001-2026-TAX`. Open **2026 Corporate Tax Return → Workflow**. The untouched demo engagement receives the compatible Form 1120S workflow during seed. If you previously changed that record, create a new Tax / S Corporation Tax Return Engagement, choose the template and confirm its preview.
4. **Move to Next Stage → Confirm Move**. Check Current Stage, Current Owner, entry time, calendar age, target and instructions. **Reassign Current Stage** and select a visible same-firm staff member, then confirm.
5. Advance to review. Choose **Return to Previous Stage**, select Preparation and enter a reason. Confirm. Inspect Workflow History and Stage Visits for both Preparation visits and the previous owner transfers.
6. When an optional Questions stage is current, choose **Skip Optional Stage** and enter a reason. Required stages do not show this action.
7. Advance to the final stage. **Complete Workflow → Confirm Completion**. Check Engagement Status = Completed. **Reopen Workflow**, choose Preparation, give a reason and confirm. Check In Progress and preserved completion/return events.
8. In **Engagements**, use **Customize Columns** for Current Stage, Current Owner, Days in Stage and Last Move; filter by template/stage/owner.
9. Log in as `associate@demo.setu.test`; choose **My Work**, then open assigned work. Forward movement is available for owned stages; template administration/reassignment/reopen are not granted to the default Preparer role.
10. Log in as `admin@sample.setu.test` to confirm the other firm's independent data. Its template list may include a draft created by the browser tenant-isolation test; it must not contain Demo CPA Firm templates.

## V1 boundaries

One lifetime workflow instance per Engagement; no workflow replacement/deletion; exact-name stage filtering; accessible up/down reorder controls; calendar days including holds; no bypass of required stages. Later checklist, queries, deliverables, time, capacity, notifications and reports remain deferred. These are documented Build #4 scope boundaries, not partial implementations of later builds.
