import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, sessionToken } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { teamCapacity } from "@/lib/capacity";
import { AppError } from "@/lib/errors";
import { ZodError } from "zod";
import { CreateAllocation } from "@/components/allocations/create";
import { AdjustCapacity } from "@/components/capacity/adjustment";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await currentUser();
  if (
    !hasPermission(actor, "capacity.view_team") ||
    !hasPermission(actor, "engagements.view")
  )
    notFound();
  const query = await searchParams;
  const data = await teamCapacity(await sessionToken(), query).catch((e) => {
    if (
      e instanceof ZodError ||
      (e instanceof AppError && [403, 404].includes(e.status))
    )
      notFound();
    throw e;
  });
  const { period, selected } = data;
  const url = (changes: Record<string, string>) =>
    `?${new URLSearchParams({ ...query, ...changes })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Team Capacity</h1>
          <p>
            {period.start} – {period.end} · Monday–Friday working week
          </p>
        </div>
        <Link href="/team/assignments">Team Assignments</Link>
      </div>
      <nav className="tabs" aria-label="Capacity period">
        <Link href={url({ week: period.previous })}>← Previous Week</Link>
        <Link href={url({ week: "", weeks: "1" })}>This Week</Link>
        <Link href={url({ week: period.next })}>Next Week →</Link>
        {[1, 2, 4].map((w) => (
          <Link
            className={period.weeks === w ? "active" : ""}
            key={w}
            href={url({ weeks: String(w) })}
          >
            {w} {w === 1 ? "Week" : "Weeks"}
          </Link>
        ))}
      </nav>
      <p className="card detail-card">
        <strong>Team Capacity: {data.summary.capacity}h</strong> · Planned:{" "}
        {data.summary.planned}h · Available: {data.summary.available}h ·
        Overloaded: {data.summary.overloaded} people
      </p>
      <details className="card detail-card">
        <summary>Find available people / Filters</summary>
        <form className="form-grid">
          <input type="hidden" name="week" value={period.start} />
          <input type="hidden" name="weeks" value={period.weeks} />
          <label>
            Workload
            <select name="load" defaultValue={query.load ?? "all"}>
              {[
                "all",
                "Available",
                "Near Capacity",
                "Overloaded",
                "No capacity",
              ].map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "All workloads" : value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search Employee
            <input
              name="q"
              defaultValue={query.q}
              placeholder="First or last name"
            />
          </label>
          <label>
            Role
            <select name="role" defaultValue={query.role ?? ""}>
              <option value="">All roles</option>
              {data.roles.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Office
            <select name="office" defaultValue={query.office ?? ""}>
              <option value="">All offices</option>
              {data.offices.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Available greater than (hours)
            <input
              type="number"
              name="available"
              min="0"
              max="672"
              step="0.01"
              defaultValue={query.available}
            />
          </label>
          <label>
            Sort
            <select name="sort" defaultValue={query.sort ?? "name"}>
              <option value="name">Employee name</option>
              <option value="available">Most available</option>
              <option value="load">Highest planned load</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              name="inactive"
              value="true"
              defaultChecked={query.inactive === "true"}
            />{" "}
            Include inactive employees
          </label>
          <button className="button secondary">Apply Filters</button>
          <Link
            href={url({
              q: "",
              role: "",
              office: "",
              available: "",
              inactive: "false",
              sort: "name",
              employee: "",
            })}
          >
            Clear Filters
          </Link>
        </form>
      </details>
      <section className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Employee",
                  "Capacity",
                  "Planned",
                  "Available",
                  "Planned Load",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={url({ employee: r.id })}>
                      {r.firstName} {r.lastName}
                    </Link>
                    <small>
                      {r.role.roleName}
                      {r.employeeStatus !== "Active" || !r.role.active
                        ? " · Inactive — no capacity"
                        : ""}
                    </small>
                    {r.unscheduled.length > 0 && (
                      <small>
                        {r.unscheduled.length} responsibilities not yet
                        scheduled
                      </small>
                    )}
                  </td>
                  <td>{r.capacity}h</td>
                  <td>{r.planned}h</td>
                  <td>{r.available}h</td>
                  <td>
                    <strong>{r.load === null ? "—" : `${r.load}%`}</strong>
                    <small>
                      {r.status}
                      {r.status === "Available" && Number(r.available) > 8
                        ? " · More than 8h available"
                        : ""}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rows.length && (
          <p className="empty-state">No employees match these filters.</p>
        )}
      </section>
      <p className="muted small">
        Planned Load = planned ÷ adjusted capacity. These indicators describe
        workload, not performance. All non-cancelled allocations count,
        including completed work. Actual time does not reduce available
        capacity.
      </p>
      {selected && (
        <section className="card detail-card">
          <div className="page-heading">
            <h2>
              {selected.firstName} {selected.lastName} · {period.start}
            </h2>
            <Link href={url({ employee: "" })}>Close employee details</Link>
          </div>
          <p>
            Capacity: {selected.capacity}h · Planned: {selected.planned}h ·
            Available: {selected.available}h
          </p>
          <p className="muted">
            Default: {selected.weeklyCapacityHours}h/week ·{" "}
            {selected.primaryOffice?.officeName ?? "No office"}
          </p>
          {hasPermission(actor, "users.manage") && (
            <Link href="/admin/users">Edit default weekly capacity</Link>
          )}
          {selected.actual !== null && (
            <p>
              Submitted actual hours (visible engagements, through{" "}
              {period.today}): {selected.actual}h
            </p>
          )}
          {hasPermission(actor, "capacity.adjust") && (
            <AdjustCapacity
              userId={selected.id}
              canEdit={
                selected.employeeStatus === "Active" && selected.role.active
              }
              start={period.start}
              rows={data.adjustments.map((a) => ({
                id: a.id,
                startDate: a.startDate.toISOString().slice(0, 10),
                endDate: a.endDate.toISOString().slice(0, 10),
                hoursReduction: a.hoursReduction.toFixed(2),
                adjustmentType: a.adjustmentType,
                reason: a.reason,
                revision: a.revision,
              }))}
            />
          )}
          {hasPermission(actor, "allocations.create") &&
            hasPermission(actor, "allocations.manage_team") &&
            selected.employeeStatus === "Active" &&
            selected.role.active && (
              <CreateAllocation
                today={period.start}
                assignedUserId={selected.id}
                label="Assign Work"
              />
            )}
          <details>
            <summary>Daily breakdown</summary>
            <table>
              <thead>
                <tr>
                  {["Date", "Capacity", "Planned", "Available"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.daily.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.capacity}h</td>
                    <td>{d.planned}h</td>
                    <td>{d.available}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <h3>Assignments</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Client / Engagement",
                    "Stage / Current Stage",
                    "Due Date",
                    "Allocation Date",
                    "Planned",
                    "Actions",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.assignments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/engagements/${a.engagementId}`}>
                        {a.engagement.client.displayName} ·{" "}
                        {a.engagement.engagementName}
                      </Link>
                    </td>
                    <td>
                      {a.stage?.name ?? "Engagement level"}
                      <small>
                        Current:{" "}
                        {a.engagement.workflow?.currentStage?.name ??
                          "No workflow"}
                      </small>
                    </td>
                    <td>
                      {a.engagement.dueDate?.toISOString().slice(0, 10) ?? "—"}
                    </td>
                    <td>{a.allocationDate.toISOString().slice(0, 10)}</td>
                    <td>{a.allocatedHours.toFixed(2)}h</td>
                    <td>
                      {hasPermission(actor, "allocations.manage_team") && (
                        <Link
                          href={`/team/assignments?view=all&employeeId=${selected.id}&engagementId=${a.engagementId}&from=${period.start}&to=${period.end}`}
                        >
                          Manage / Reassign
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.restrictedPlanned !== "0.00" && (
            <p>
              {data.restrictedPlanned}h planned on engagements whose details you
              cannot access. These hours are included in available capacity.
            </p>
          )}
          {!data.assignments.length && (
            <p>No visible assignments in this period.</p>
          )}
          {!!selected.unscheduled.length && (
            <details>
              <summary>
                Current responsibilities — not yet scheduled (
                {selected.unscheduled.length})
              </summary>
              <p className="muted small">
                Live responsibilities, independent of the selected planning
                period. No hours are assumed. An unfinished allocation for the
                employee at engagement or matching stage level covers the
                responsibility.
              </p>
              <ul>
                {selected.unscheduled.map((r) => (
                  <li key={r.id}>
                    <Link href={r.href}>{r.title}</Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </>
  );
}
