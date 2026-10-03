import Link from "next/link";
import {
  listAllocations,
  allocationBudget,
  allocationEmployeeTotals,
  allocationEngagementRoles,
  canManageAllocations,
} from "@/lib/allocations";
import { engagementPage } from "@/lib/engagement-page";
import { currentUser } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { getEngagement } from "@/lib/engagements";
import { serialize } from "@/lib/client-page";
import { AllocationActions } from "./actions";
import { CreateAllocation } from "./create";
import { ALLOCATION_STATUSES } from "@/lib/allocation-validation";
import { PRIORITIES, engagementLabel } from "@/lib/engagement-constants";
export async function AllocationWorkspace({
  query,
  team = false,
  engagementId,
}: {
  query: Record<string, string>;
  team?: boolean;
  engagementId?: string;
}) {
  const { token } = await engagementPage(
    team ? "allocations.manage_team" : "my_work.view",
  );
  const actor = await currentUser();
  const record = engagementId ? await getEngagement(token, engagementId) : null;
  const manage = record ? canManageAllocations(actor, record) : team;
  const scope = record ? manage : team;
  const data = await listAllocations(
    token,
    {
      ...query,
      ...(engagementId ? { engagementId, view: query.view ?? "all" } : {}),
    },
    scope,
  );
  const budget =
    engagementId && manage ? await allocationBudget(token, engagementId) : null;
  const employeeTotals =
    engagementId && manage
      ? await allocationEmployeeTotals(token, engagementId)
      : [];
  const permissions = actor.role.permissions.map((p) => p.permissionKey);
  const url = (values: Record<string, string>) =>
    "?" +
    new URLSearchParams({
      ...query,
      ...values,
      ...(engagementId ? { tab: "assignments" } : {}),
    });
  const views = [
    ["today", "Today"],
    ["week", "This Week"],
    ["upcoming", "Upcoming"],
    ["overdue", "Overdue"],
    ["blocked", "Waiting / Blocked"],
    ["completed", "Completed"],
    ["all", "All"],
  ];
  return (
    <div className="allocation-workspace">
      <div className="page-heading">
        <p className="eyebrow">PLANNED WORK · {data.timezone}</p>
        <h1>
          {engagementId ? "Assignments" : team ? "Team Assignments" : "My Work"}
        </h1>
        <p className="muted">
          Dated work allocations and current responsibilities. All hours shown
          are planned hours.
        </p>
        {!team &&
          !engagementId &&
          hasPermission(actor, "allocations.manage_team") && (
            <Link href="/team/assignments">Manage team assignments →</Link>
          )}
      </div>
      {record && (
        <section className="card detail-card">
          <h2>Engagement Planning</h2>
          <p>
            Current Stage:{" "}
            <strong>
              {record.workflow?.currentStage?.name ?? "Not started"}
            </strong>{" "}
            · Current Stage Owner:{" "}
            <strong>
              {record.workflow?.currentStage?.assignedUser
                ? `${record.workflow.currentStage.assignedUser.firstName} ${record.workflow.currentStage.assignedUser.lastName}`
                : "Unassigned"}
            </strong>
          </p>
          {budget && (
            <>
              <div className="allocation-summary">
                <span>
                  Engagement Budget
                  <strong>
                    {budget.budget ?? "Not configured"}
                    {budget.budget !== null ? "h" : ""}
                  </strong>
                </span>
                <span>
                  Planned Allocation
                  <strong>{budget.planned.toFixed(2)}h</strong>
                </span>
                <span>
                  Unallocated Budget
                  <strong>
                    {budget.unallocated === null
                      ? "Not configured"
                      : `${budget.unallocated.toFixed(2)}h`}
                  </strong>
                </span>
              </div>
              {budget.unallocated !== null && budget.unallocated < 0 && (
                <p className="notice">
                  Planned allocation exceeds engagement budget.
                </p>
              )}
              <p className="muted small">
                Cancelled allocations are excluded. Completed allocations remain
                part of the plan. Budget has not been consumed and no actual
                time has been recorded.
              </p>
            </>
          )}
        </section>
      )}
      {!engagementId && (
        <>
          <section
            className="allocation-summary card"
            aria-label="Work summary"
          >
            {[
              ["Due Today", data.summary.dueToday],
              ["Due This Week", data.summary.dueWeek],
              ["Overdue", data.summary.overdue],
              ["Blocked / Waiting", data.summary.blocked],
              [
                "Planned Hours This Week",
                `${data.summary.plannedWeek.toFixed(2)}h`,
              ],
            ].map(([label, value]) => (
              <span key={label}>
                {label}
                <strong>{value}</strong>
              </span>
            ))}
          </section>
          <p className="muted small">
            Due indicators count unfinished allocations on open engagements by
            engagement due date. Upcoming begins after this week. Summary totals
            respect filters.
          </p>
        </>
      )}
      {engagementId && manage && (
        <section
          className="card detail-card"
          aria-label="Engagement employee allocation totals"
        >
          <h2>Planned Hours by Employee</h2>
          <p className="muted small">
            All allocation dates, independent of table filters and pagination.
            Cancelled allocations are excluded; completed allocations remain
            planned hours. Roles reflect current engagement staffing.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Engagement Role</th>
                  <th>Total Planned Hours</th>
                </tr>
              </thead>
              <tbody>
                {employeeTotals.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      {employee.firstName} {employee.lastName}
                    </td>
                    <td>{employee.engagementRole}</td>
                    <td>{employee.plannedHours.toFixed(2)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!employeeTotals.length && (
            <p className="empty-state">No planned allocations.</p>
          )}
        </section>
      )}
      {manage && hasPermission(actor, "allocations.create") && (
        <CreateAllocation
          engagementId={engagementId}
          today={data.dates.today}
        />
      )}
      <nav className="tabs client-tabs" aria-label="Work views">
        {views.map(([value, label]) => (
          <Link
            key={value}
            className={data.filters.view === value ? "active" : ""}
            href={url({ view: value, page: "1" })}
          >
            {label}
          </Link>
        ))}
      </nav>
      <details className="card allocation-filters">
        <summary>Filters and sorting</summary>
        <form className="client-form-section">
          <input type="hidden" name="view" value={data.filters.view} />
          {engagementId && (
            <input type="hidden" name="tab" value="assignments" />
          )}
          <div className="form-grid">
            {[
              ["client", "Client"],
              ["engagement", "Engagement"],
              ["serviceLine", "Service Line"],
              ["stage", "Workflow Stage"],
              ...(scope
                ? [
                    ["employee", "Employee"],
                    ["manager", "Manager"],
                    ["office", "Office"],
                  ]
                : []),
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  defaultValue={query[key] ?? ""}
                  placeholder={`Filter ${label.toLowerCase()}`}
                />
              </label>
            ))}
            {[
              ["from", "Allocation From"],
              ["to", "Allocation To"],
              ["dueFrom", "Due From"],
              ["dueTo", "Due To"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input type="date" name={key} defaultValue={query[key] ?? ""} />
              </label>
            ))}
            <label>
              Priority
              <select
                name="priority"
                defaultValue={data.filters.priority ?? ""}
              >
                <option value="">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={data.filters.status ?? ""}>
                <option value="">All statuses</option>
                {ALLOCATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {engagementLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort By
              <select name="sort" defaultValue={data.filters.sort}>
                {[
                  ["allocationDate", "Allocation Date"],
                  ["dueDate", "Due Date"],
                  ["priority", "Priority"],
                  ["client", "Client"],
                  ["engagement", "Engagement"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Order
              <select name="direction" defaultValue={data.filters.direction}>
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </div>
          <div className="actions">
            <button className="button secondary">Filter Work</button>
            <Link
              href={
                engagementId
                  ? `?tab=assignments`
                  : team
                    ? "/team/assignments"
                    : "/my-work"
              }
            >
              Clear filters
            </Link>
          </div>
        </form>
      </details>
      {data.filters.view === "today" && (
        <p>
          <strong>
            Total Allocated Hours Today: {data.summary.plannedToday.toFixed(2)}h
          </strong>
        </p>
      )}
      {data.filters.view === "week" && (
        <section className="card detail-card">
          <h2>Weekly Planned Hours</h2>
          <div className="allocation-days">
            {data.daily.map((d) => (
              <div key={d.date}>
                <span>
                  {new Intl.DateTimeFormat("en", {
                    weekday: "short",
                    timeZone: "UTC",
                  }).format(new Date(d.date))}
                </span>
                <small>{d.date}</small>
                <strong>{d.hours.toFixed(2)}h</strong>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="card">
        <div className="table-scroll">
          <table className="allocation-table">
            <thead>
              <tr>
                {[
                  ...(scope || engagementId
                    ? [engagementId ? "Employee / Engagement Role" : "Employee"]
                    : []),
                  "Client / Engagement",
                  "Work / Stage",
                  "Allocation / Planned Hours",
                  "Due Date",
                  "Priority / Status",
                  "Actions",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  {(scope || engagementId) && (
                    <td>
                      {row.assignedUser.firstName} {row.assignedUser.lastName}
                      {record && (
                        <small>
                          {allocationEngagementRoles(
                            row.assignedUserId,
                            record,
                          )}
                        </small>
                      )}
                    </td>
                  )}
                  <td>
                    <small>{row.engagement.client.displayName}</small>
                    <Link href={`/engagements/${row.engagementId}`}>
                      {row.engagement.engagementName}
                    </Link>
                  </td>
                  <td>
                    {row.description || "Engagement work"}
                    <small>{row.stage?.name ?? "Engagement level"}</small>
                    <details>
                      <summary>Notes & assignment</summary>
                      <p>{row.allocationNote || "No allocation note"}</p>
                      <p>
                        Assigned By: {row.assignedBy.firstName}{" "}
                        {row.assignedBy.lastName}
                      </p>
                      {row.blockedReason && <p>Blocked: {row.blockedReason}</p>}
                    </details>
                  </td>
                  <td>
                    {row.allocationDate.toISOString().slice(0, 10)}
                    <strong>{row.allocatedHours.toFixed(2)}h planned</strong>
                    {row.overdueAllocation && (
                      <span className="overdue-label">Overdue Allocation</span>
                    )}
                  </td>
                  <td>
                    {row.engagement.dueDate?.toISOString().slice(0, 10) ?? "—"}
                    {row.overdueEngagement && (
                      <span className="overdue-label">Overdue Engagement</span>
                    )}
                  </td>
                  <td>
                    {row.priority}
                    <span className="pill">{engagementLabel(row.status)}</span>
                    {row.engagement.status === "OnHold" && (
                      <small>Engagement On Hold</small>
                    )}
                  </td>
                  <td>
                    <Link
                      href={`/engagements/${row.engagementId}?tab=workflow`}
                    >
                      View Workflow
                    </Link>
                    <AllocationActions
                      key={row.id + row.revision}
                      row={serialize(row)}
                      permissions={permissions}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.total && (
          <p className="empty-state">No allocations match these filters.</p>
        )}
        <div className="pagination">
          <span>
            {data.total} allocations · Page {data.filters.page}
          </span>
          {data.filters.page > 1 && (
            <Link href={url({ page: String(data.filters.page - 1) })}>
              Previous
            </Link>
          )}
          {data.filters.page * 25 < data.total && (
            <Link href={url({ page: String(data.filters.page + 1) })}>
              Next
            </Link>
          )}
        </div>
      </section>
      {scope && !engagementId && (
        <section className="card detail-card">
          <h2>Weekly Allocation by Employee</h2>
          <p className="muted">
            Totals cover permitted engagements and current filters. Capacity is
            configured weekly capacity; these figures are not actual
            utilization.
          </p>
          {data.weekly.map((u) => (
            <p key={u.id}>
              <strong>
                {u.firstName} {u.lastName}
              </strong>{" "}
              · Allocated: {u.hours.toFixed(2)}h · Configured Capacity:{" "}
              {u.weeklyCapacityHours}h{" "}
              {u.hours > u.weeklyCapacityHours && (
                <span className="overdue-label">
                  Planned allocation exceeds configured weekly capacity.
                </span>
              )}
            </p>
          ))}
          {!data.weekly.length && <p>No weekly allocations.</p>}
        </section>
      )}
      {!scope && !engagementId && (
        <section className="card detail-card">
          <h2>Current Responsibilities — Not Yet Scheduled</h2>
          <p className="muted">
            Current stages you own with no unfinished allocation for you at that
            stage or at engagement level. Independent of dated-work filters.
          </p>
          {data.responsibilities.map((w) => (
            <article key={w.id} className="allocation-responsibility">
              <span>{w.engagement.client.displayName}</span>
              <Link href={`/engagements/${w.engagementId}?tab=workflow`}>
                {w.engagement.engagementName}
              </Link>
              <span>
                {w.currentStage?.name} · Due{" "}
                {w.engagement.dueDate?.toISOString().slice(0, 10) ?? "not set"}
              </span>
            </article>
          ))}
          {!data.responsibilityTotal && (
            <p>No unscheduled current responsibilities.</p>
          )}
          <div className="pagination">
            <span>
              {data.responsibilityTotal} responsibilities · Page{" "}
              {data.filters.responsibilityPage}
            </span>
            {data.filters.responsibilityPage > 1 && (
              <Link
                href={url({
                  responsibilityPage: String(
                    data.filters.responsibilityPage - 1,
                  ),
                })}
              >
                Previous responsibilities
              </Link>
            )}
            {data.filters.responsibilityPage * 25 <
              data.responsibilityTotal && (
              <Link
                href={url({
                  responsibilityPage: String(
                    data.filters.responsibilityPage + 1,
                  ),
                })}
              >
                Next responsibilities
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
