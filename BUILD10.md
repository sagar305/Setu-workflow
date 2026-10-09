# Build #10 — Management Dashboard, Exceptions & Reports

Build #10 completes the requested V1 operational reporting layer. It extends existing engagement, workflow, checklist, point, time and capacity services; it adds no persisted exception records or duplicate calculation engine.

## Views and navigation

- Management Dashboard: active engagements, due this week, overdue and blocking issues, with filtered drill-downs. Needs Attention is the default view; Engagement Health and Deadlines are separate views.
- Collapsed secondary summaries: workflow category pipeline, checklist progress, open points, budget exceptions and current-week capacity. Capacity links select the matching workload group.
- Employee My Day: own relevant deadlines, assigned actionable points, distinct assigned checklist items requiring attention, My Work and My Time. Full management summaries are omitted.
- Existing Reports navigation is enabled only for permitted users. Existing Team navigation leads to Team Capacity where permitted. No new top-level menu is introduced.

## Deterministic attention rules

| Rule | Condition | Priority |
| --- | --- | --- |
| Engagement overdue | Active, due date before firm-local today | Critical |
| Engagement due soon | Active, due today through 3 calendar days ahead | Attention |
| Workflow stagnant | Active workflow, current stage age exceeds its target days | Attention |
| Blocking point | Open actionable blocking point | Critical when engagement due within 3 days or overdue; otherwise Attention |
| Point overdue | Open actionable point past its own deadline | Attention |
| Checklist blocked | One or more blocked applicable items | Attention |
| Checklist at risk | Required outstanding items, engagement due within 3 days or overdue | Attention |
| Budget warning | Submitted actuals consume at least 80% of budget, without exceeding it | Attention |
| Budget exceeded | Submitted actuals exceed budget | Critical at exact 110% or more; positive actuals against zero budget are Critical |
| Capacity overload | Existing Build #9 workload calculation reports Overloaded | Attention |
| Unscheduled responsibility | Current workflow/checklist responsibility without unfinished allocation, following Build #9 | Informational |

Every exception carries a reason, owner, due date when present and source link. These are operational rules, not predictive scoring. Workflow age uses the current runtime stage entry timestamp maintained by workflow movement. Calendar dates and aging use firm timezone. No hard-coded UTC day is used for deadlines.

## Reports and export

Six predefined reports: Engagement Status, Budget vs Actual, Open Points Aging, Team Capacity, Workflow Aging and Checklist Progress. Tables link to source records, show 25 rows per page and support filtered CSV export of all matching rows, independently of the displayed page. CSV uses existing BOM/formula-escaping infrastructure and no-store responses.

Filters include search, active/all/completed engagement scope, engagement due-date range, report-specific attention/aging and capacity week/period/load. Scoped identifiers can be supplied in links. Default engagement scope is active. Budget is lifetime submitted actuals versus budget and noncancelled planned allocations. Capacity is the selected period; actual time is secondary visible context and never deducted from capacity. Checklist denominator excludes Not Applicable. Point aging excludes knowledge/instruction and resolved/closed points.

No existing XLSX infrastructure was available. XLSX, PDF, saved filters, global search, generic reporting and later builds are not implemented.

## Security and calculations

`reports.view` and `reports.export` are separate capabilities, in addition to source permissions and engagement record visibility. Defaults grant both to Firm Admin, Partner and Manager; custom roles are not expanded. Migration `202610060002_reports` is applied to local app and test databases. Every request re-authenticates. Tenant/record visibility is applied before aggregation. Missing source rights suppress dashboard data and reject the corresponding direct report/export. Query identifiers cannot expand access.

Capacity retains Build #9 semantics: workload totals can include hidden allocations for permitted team members so capacity is accurate; hidden engagement details are not exposed, and actuals/open-work context is visibility-scoped. Current-week capacity is a team-wide summary, independent of engagement search. Unscheduled engagement exceptions are restricted to the selected visible portfolio.

Queries select scoped records and grouped checklist/hour totals; they do not issue a query per engagement. There is no shared cache to leak tenants. Explicit limits reject more than 5,000 matching engagements, 10,000 open points or 5,000 exported rows with a request to narrow filters. Results refresh per request; they are not a single transactional historical snapshot. Very large portfolios should be benchmarked before rollout.

## V1 acceptance and scope

The focused browser check traverses Dashboard, Clients, Engagements, My Work, Team Capacity, all six Reports, and engagement Workflow / Assignments / Checklist / Queries / Budget & Hours tabs. It also checks employee My Day and denied report exports. It is not a full role-by-role transactional acceptance run.

Before rollout, manually exercise Firm Admin setup; Manager client/engagement creation, workflow application and allocation; Preparer checklist, points and submitted time; Reviewer return/resolve flow; Manager deadline/budget/capacity monitoring; Partner dashboard and CSV export. Confirm custom-role restrictions and timezone behavior with representative firm data. Check readability on the firm's normal laptop and mobile viewport.

See BUILD10-VERIFICATION.md for executed checks and remaining validation limits. No further build is authorized by this completion.
