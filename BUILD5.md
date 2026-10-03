# Build #5 — Assignment and My Work

Build #5 extends the existing Engagement, workflow snapshot, identity, RBAC, and AuditLog services. Builds #1–#4 documentation remains unchanged. No Checklist, Time Entry, notification delivery, or capacity forecasting engine is introduced.

## Four separate responsibilities

1. Engagement staffing: the existing Partner, Manager, Reviewer, and Preparer slots govern record visibility.
2. Current stage ownership: the existing runtime workflow stage owner, visit segments, and movement history.
3. Planned allocation: one employee, engagement, explicit date, and positive planned hours per `WorkAllocation`. Multiple dates create separate rows, including when the employee and engagement are identical.
4. Actual time: not implemented. Neither completing an allocation nor planning hours consumes the engagement budget or creates a time entry.

## Data and migration

`202610030001_work_allocations` adds `AllocationStatus`, `work_allocations`, tenant-scoped relationships, query indexes, database checks, and default-role grants. A composite workflow key binds `(firm, engagement, workflow)` and a second key binds `(firm, workflow, stage)`. A stage cannot be supplied without its workflow. Positive hours, ordered optional timestamps, blocked reasons, and cancellation timestamps have database checks. Operational allocations cannot be deleted; cancel them.

Fields include firm, engagement, optional workflow/stage, employee, original assigning user, allocation date (`date`), optional start/end instants, decimal planned hours (two decimal places), status, priority, description, notes, blocked reason, revision, timestamps, and cancellation time. Start/end API values must include an explicit UTC offset; ordinary daily UI allocation does not require clock times.

Statuses are Planned, Assigned, In Progress, Blocked, Completed, and Cancelled. These do not change engagement lifecycle or stage state. Overdue is derived, never saved as a status. Reassignment changes the employee but preserves the original Assigned By field; the audit event identifies the reassigning actor.

## Routes and operation

- `/my-work`: own dated work; defaults to This Week. Today, This Week, Upcoming, Overdue, Waiting / Blocked, Completed, and All views use server-side filters, sorting, and 25-row pagination.
- `/team/assignments`: management-scoped allocation table and weekly employee planning summary. The Team navigation opens this page for users with team allocation permission.
- `/engagements/:id?tab=assignments`: current stage/owner, allocations, employee actions, and management budget comparison. Management totals include all non-cancelled allocations, including Completed. Ordinary employees see only their own allocation records.
- `GET /api/allocations`: own queue, or explicitly authorized `scope=team`.
- `GET /api/my-work`: own allocation queue. The prior internal `workflows.myWork` service remains available for Build #4 regression compatibility; the public screen/API use Build #5.
- `POST /api/allocations/preview` and `POST /api/allocations`: validate a batch of 1–100 explicit rows. Preview writes no allocations. Save revalidates permissions, references, and totals; a preview is not a security token.
- `POST /api/allocations/:id`: revision-checked edit, reassign, status, note, or cancel action.
- `GET /api/allocations/:engagementId/options` and `/budget`: management-scoped form options and aggregate planning comparison.
- `GET /api/allocations/:id/history?page=1`: scoped, paginated audit history.

Use Allocate Work, choose an engagement and eligible employee, enter hours separately for each date, and Add to Batch. Repeat for other engagements if needed. Preview Allocations shows names, dates, hours, and warnings before Confirm Allocations. Dates are never automatically spread across weekends or holidays. The engagement search returns 25 matches; narrow the name/code to select another record.

## Calendar and summaries

The firm's IANA timezone determines today. Weeks are Monday–Sunday because there is no configured alternate week start. Upcoming starts after the current Sunday. Today shows unfinished allocations for today; This Week includes completed plans but excludes cancellations. Completed work also has its own view. Due indicators count unfinished allocations whose open engagement is due today/this week, rather than inventing a separate allocation due date. Overdue work differentiates an open engagement with a past due date from an unfinished allocation with a past date or planned end instant. On-hold engagements appear in Waiting / Blocked alongside explicitly blocked allocations.

Daily and weekly planned-hour totals are database aggregates over the full filtered result, not just the current page. Summary totals respect filters. Team summaries show only authorized engagements and clearly state that scope. Capacity warnings at preview/save compare the employee's existing configured weekly capacity against all non-cancelled planned hours in that firm/week. There is no daily capacity field, so no eight-hour daily assumption or warning is invented. Warnings do not prevent assignment.

Current Responsibilities — Not Yet Scheduled is an independently paginated, unfiltered section. It shows current stages the employee owns without unfinished allocations for that employee at the current stage or at engagement level. An allocation for a different historical/future stage does not conceal the current responsibility. Completing/cancelling the final relevant allocation can reveal the responsibility again: the stage still needs its own workflow action. These responsibilities have no fictional hours and are excluded from planned totals.

## Budget, reassignment, and history

Unallocated Budget = Budget Hours − all non-cancelled Planned Allocation Hours. No actual budget consumption is implied. Exceeding budget requires explicit acknowledgement at save; authorized users can proceed. Editing rechecks totals, and cancellation removes hours from totals. Engagement budget values are never overwritten.

Reassignment requires a reason and a confirmation action. It does not silently change stage ownership. For a linked current stage, the optional “Also reassign the current workflow stage” action invokes the existing workflow transition inside the same transaction and requires both allocation and workflow permissions and both revisions. Stage visits and workflow movements remain intact. Invalid/stale stage transitions roll back the allocation change too.

AuditLog is the single history store. `allocation.created`, `.edit`, `.reassign`, `.status`, `.cancel`, and `.note` events include schemaVersion, engagement ID, before/after data, changed field names, reason, actor, timestamp, and snapshotted employee names. Date, hours, employee, and status changes are individually identifiable in structured metadata. Events support future notification consumers without claiming delivery or sending email. The public API provides no history editing or deletion.

## Authorization and concurrency

Independent custom-role keys: `allocations.view/create/edit/reassign/cancel/manage_team`, `my_work.view/update_status`. Default Firm Admin/Partner/Manager roles receive allocation management permissions; Reviewer/Preparer roles receive own-work viewing and status/note permissions. The additive migration grants only recognized default roles; existing custom roles must be configured explicitly. Custom-role forms can now hold the complete permission catalog rather than stopping at 20 entries.

Every entry point derives firm from the authenticated session and requires engagement visibility. Management additionally requires `allocations.manage_team` and either firm-wide engagement visibility or the actor occupying the engagement's Manager/Partner slot. A Reviewer slot alone does not authorize management. Eligible employees must be active, in the same firm, have an active role, and already be able to view the engagement and My Work. Allocating a record does not silently grant new visibility; update engagement staffing through the existing authorized staffing workflow when necessary.

Own-work endpoints pin the employee to the current principal; forged employee IDs are rejected. Read, options, budget, history, and mutation services independently enforce scope. Composite foreign keys add tenant protection below the service layer. There is no allocation export endpoint; guessed export URLs return 404, including cross-tenant requests. Existing origin checks and bounded JSON request handling apply to every allocation mutation.

Mutations use the existing firm row lock, recheck the session/permissions inside the transaction, and compare integer allocation revisions. Conditional updates increment revisions. Stale edits return HTTP 409 with a refresh message. Multi-row creation, audit events, and optional linked stage reassignment commit atomically. The firm lock also serializes planning calculations against concurrent authorized mutations, preventing lost updates.

## Seed and validation

`prisma/seed-allocations.ts` adds realistic daily plans, In Progress, Blocked, Completed, overdue plans, reassignment history, and unscheduled current responsibilities for both existing demo firms. It reuses their existing staff names. Compatible demo workflows are created only where absent. Seeding is development-only and preserves existing records and passwords. An audit marker avoids duplicate allocation seeds.

Standard commands remain:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

Targeted development checks:

```sh
node node_modules/vitest/vitest.mjs run tests/allocations.test.ts tests/workflows.test.ts
node node_modules/@playwright/test/cli.js test e2e/allocations.spec.ts
```

See `BUILD5-VERIFICATION.md` for commands actually executed, outcomes, and manual verification steps.

## Deliberate limitations / future integration

No allocation CSV export, bulk reassignment UI, automatic scheduling, working-day/holiday model, leave forecasts, daily capacity, actual hours, timesheets, checklist items, notifications, or Build #6 features. Optional start/end instants are API-supported; the UI schedules explicit dates and hours. Batch creation supports multiple engagements through a reviewed batch, rather than a separate engagement-list mass-selection toolbar. Capacity is an advisory weekly planning check; scoped manager summaries are not full-firm utilization. Existing firm locks serialize writes and can be revisited if write throughput warrants a finer locking scheme.

Future Capacity should reuse allocations and configured capacity; future Time should introduce separate actual-time records linked to the same engagement/stage. Neither should reinterpret allocated hours as actual work.
