# Build #9 — Team capacity and resource planning

## Where to use it

Authorized users open **Team Capacity** from the existing Team navigation item. The default is this week in the firm's timezone. Previous/This/Next Week and 1/2/4-week controls retain the employee selection. The compact summary and five-column table show capacity, planned hours, available hours, planned load and deterministic status.

Expand **Find available people / Filters** to search first/last name, filter by existing role or office, show available hours above a threshold, include inactive users, or sort by available hours/planned load. Summary totals reflect the filtered employee list.

Click an employee for visible assignments, client/engagement, allocated stage, current workflow stage, engagement deadline, allocation date, optional daily breakdown, actual-hours context and unscheduled current responsibilities. **Assign Work** reuses the Build #5 form with the employee preselected when eligible for the engagement. **Manage / Reassign** opens the existing filtered Team Assignments workspace and its history/reassignment controls. No second assignment engine exists.

## Calculations and policy

- Default capacity reuses `User.weeklyCapacityHours`; existing Admin → Users editing, 0–168 validation and `user.updated` before/after auditing remain authoritative. No duplicate employee/default-capacity field was added.
- Working days are Monday–Friday. Weekly capacity is distributed in hundredths across five days; any rounding remainder goes to the earliest weekdays, keeping weekly and daily totals equal. Weekend capacity is zero, but weekend allocations remain in planned totals.
- Adjustments reduce capacity by the entered hours **per working day** over an inclusive business-date range. Types are Leave, Training, Holiday or Other. Maximum reduction is 24 hours/day with two decimals; a period is at most 366 days and must include a weekday. Overlapping reductions add together; each day's adjusted capacity floors at zero.
- Capacity is the sum of adjusted daily capacity in the selected period.
- Planned is all non-cancelled WorkAllocation hours dated within the period, including completed allocations. No hours are inferred from stage or checklist ownership.
- Available = adjusted capacity − planned. Negative values are intentionally retained.
- Planned Load = planned ÷ adjusted capacity × 100, following the prompt's example table (32 ÷ 40 = 80%). Dividing by remaining availability would conflict with those examples. It is never labelled utilization.
- Under 80% = Available; 80–100% = Near Capacity; above 100% = Overloaded. Available above 8 hours gets a secondary availability indicator. Zero capacity displays no percentage; positive planned hours with zero capacity are overloaded.
- Actual context includes submitted TimeEntry hours on visible engagements through today, only for periods starting today or earlier. Drafts and future work dates are excluded. Actual hours do not reduce available capacity.
- Inactive employees and employees with inactive roles are excluded by default. When included, their planned hours remain visible and capacity is zero. Invited users are excluded. Inactive employees cannot receive new adjustments or assignments; existing adjustments can be cancelled.

Planning uses the user's current default capacity and active status for every selected period. These are not effective-dated historical workforce records. Capacity/default/adjustment changes never rewrite allocations or time entries.

## Adjustments and audit

In employee details choose **Adjust Capacity**, enter dates, reduction/day, type and reason. Existing period adjustments can be edited or cancelled with a cancellation reason. Cancelled records remain stored, excluded from calculations and immutable. Revision checks reject stale updates and repeated cancellation; tenant mutation transactions and the existing firm lock serialize changes. Audit captures adjustment creation, edit and cancellation with before/after, actor and timestamp. Read-only calculations emit no audit events.

Allocation create/edit/reassign warnings now use the same adjustment-aware weekly capacity calculation. Warnings describe resulting planned hours, adjusted capacity and load; authorized users may continue. Existing budget-acknowledgment behavior is preserved. Allocation history remains owned by Build #5, and staffing, stage ownership and checklist ownership change only via explicit existing actions.

## Visibility and tenant isolation

New permissions are `capacity.view_team` and `capacity.adjust`. Default roles already granted `allocations.manage_team` receive both; runtime checks are capability-based, never role-name checks. Default capacity administration reuses `users.manage`; assigning/reassigning reuses existing allocation permissions.

Firm-wide capacity access requires the existing `visibility.firm` capability. Other capacity viewers see themselves, direct reports and employees staffed, allocated or currently responsible on engagements in their existing management scope. All data is tenant-scoped server-side. An explicit employee outside this scope is rejected.

For eligible team members, planned totals include all their firm allocations, so restricted engagements cannot create falsely optimistic availability. The drill-down shows only engagements the viewer can access and labels the remaining aggregate hours as restricted details. Actual-hours context additionally requires `time.view_engagement` and is explicitly labelled as visible-engagement context. Cross-firm employees, adjustments and allocation relationships are rejected.

## Unscheduled responsibilities

The indicator is a live current-responsibility list, independent of the selected period. It includes active current stages and unfinished checklist items in active current stages, within engagement visibility. An unfinished employee allocation at engagement level or the matching stage covers the responsibility, matching Build #5's existing convention. Completed/cancelled allocations do not cover current responsibility. No estimated or manufactured hours enter capacity totals.

## Database, queries and demo

Migration `202610060001_capacity` adds CapacityAdjustment with tenant/employee/actor foreign keys, business dates, decimal reductions, revision and cancellation metadata, overlap-query index, validation constraints and immutable identity/history trigger. It also seeds the two permissions and default-role grants. Existing capacity fields and existing allocation/time indexes are reused.

The overview queries the requested 1/2/4-week period and scoped employees using grouped planned/actual queries and batched adjustments/responsibilities, without per-employee database queries. Only the selected employee loads detailed allocations. Unscheduled-coverage lookup is limited to relevant employees/engagements and unfinished allocations, without fetching historical allocation details.

The small idempotent demo seeder creates one planning engagement, 13 dated allocations and one leave adjustment in the existing Demo CPA Firm. It uses existing employees and does not reset their other work or weekly defaults. Demo records are dated to the seed week. Re-running skips an existing CAPACITY-DEMO engagement.

## Limits

No custom working-day schedules, effective-dated default capacities, automatic holiday calendars, approval workflow, HR/attendance, performance ratings, utilization reporting, automatic staffing or Build #10 features. A reduction is per working day, not a total spread over its date range. Defaults remain managed in Admin → Users. Existing work outside a viewer's engagement access is aggregate-only. Large-team pagination and load testing remain future work; no complex caching was introduced.

See BUILD9-VERIFICATION.md for executed checks and their results.
