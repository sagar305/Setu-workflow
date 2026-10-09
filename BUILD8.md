# Build #8 — Budget, time entry and actual hours

## Employee workflow

Use **My Work → + Add Time** on an owned, non-cancelled allocation, or **My Time → + Add Time**. The compact form asks for engagement, work date, decimal hours and work performed. Allocation context supplies engagement and stage; planned hours never prefill actual hours. Stage and checklist links are optional, under progressive disclosure.

Save a draft, edit it if needed, then **Submit** from My Time. Today, This Week and Previous Week show recorded totals (draft plus submitted). **Find another week** retrieves historical entries, including corrections. Work dates are stored as PostgreSQL `DATE`; firm timezone determines today and Monday–Sunday weeks.

## Engagement workspace

**Engagement → Budget & Hours** shows the existing engagement budget, planned hours, submitted actual hours, remaining hours and budget-used percentage. The employee table includes current staff and historical contributors, their current engagement role, planned hours, actual hours and difference. No employee budgets are invented.

- Budget: existing `Engagement.budgetHours`; editing retains `engagements.manage_budget` and existing budget-change audit events.
- Planned: all non-cancelled WorkAllocation hours, including completed allocations.
- Actual: submitted TimeEntry hours only. Drafts, including returned corrections, are excluded.
- Remaining: budget minus actual; may be negative.
- Budget used: actual / budget × 100; null for missing or zero budgets.
- Employee difference: planned minus actual.

New hours use `Decimal(4,2)`. Arithmetic uses Prisma Decimal, including conversion of the existing Float budget through its string representation. Existing budget storage is not rewritten. Warnings select budget exceeded, 90%, or 80%, plus actual above planned. They never block entry.

Authorized users expand **Time entry details** for employee/date/stage filters and correction actions. The engagement list is unchanged.

## Status and correction policy

V1 is **Draft → Submitted**; submission is finalization, not manager approval. Formal approval/rejection is deferred.

- Only the employee can edit, delete or submit their own draft, subject to permissions and current engagement visibility.
- An authorized user with both `time.correct` and `time.view_engagement` can return submitted time to Draft with a required reason. This action changes no hours or description. Audit retains before/after values, reason, actor and timestamp.
- The employee then explicitly amends and resubmits. Previously finalized entries cannot be hard-deleted, even after returning to Draft.
- Corrections temporarily remove the entry from budget actuals until resubmission. Employees must retain engagement access to amend entries; access changes remain an administrator responsibility.

## Security and integrity

Time permissions: `time.view_own`, `time.create`, `time.edit_own`, `time.submit`, `time.view_engagement`, `time.correct`, `budget.view`. Default employees receive own-time permissions; default administrators, partners and managers also receive engagement visibility, budget visibility and correction. Custom roles require explicit grants. Runtime authorization checks capabilities, never role names.

Authentication supplies firm and employee identity. Existing engagement visibility applies to reads and writes. Composite tenant foreign keys and server validation protect engagement/workflow/stage/checklist/allocation references; checklist and stage must agree, and an allocation must belong to the employee at creation/edit. Neither time entry nor submission changes workflow, checklist, allocation, or Points state.

The existing tenant mutation transaction and firm lock serialize writes; revisions reject stale edits and repeated submissions. A per-employee request UUID prevents duplicate creation retries. Positive hours support at most two decimal places, with a 24-hour total per employee/business date across all drafts and submissions. Database checks and triggers preserve original identity, finalized history and linked-record consistency. Audit records creation, editing, submission, deletion of never-submitted drafts and authorized correction; no read auditing is added.

## Database and rollout

Migration `202610050001_time_entries` adds the runtime `TimeEntry` model/table, Draft/Submitted enum, tenant-scoped relations/indexes, request uniqueness, constraints, triggers, permission catalog entries and default-role grants. It adds no budget field and no billing fields. No existing business rows are rewritten. Apply through the existing Prisma deployment workflow and regenerate the Prisma client before restarting the app.

The migration is applied to local `setu` and `setu_test`. No production deployment or external database migration was performed. No seed expansion was needed; the focused Chrome test creates one small fixture per run in the local demo database.

## Scope and limits

Weekly totals and entry lists are implemented; a spreadsheet-style grid, formal approvals, bulk timesheets, notifications, billing and utilization reporting are not. Engagement detail filters currently operate on the loaded engagement time history; large-history server pagination is future work. No Build #9 work was started. Verification results are recorded in BUILD8-VERIFICATION.md.
