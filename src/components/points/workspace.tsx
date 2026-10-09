import Link from "next/link";
import { listPoints, pointOptions, pointSummary } from "@/lib/points";
import { sessionToken } from "@/lib/session";
import {
  POINT_TYPES,
  POINT_STATUSES,
  POINT_PRIORITIES,
  pointLabel,
} from "@/lib/point-validation";
import { Field } from "../form";
type Rows = Awaited<ReturnType<typeof listPoints>>;
const person = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`;
export function PointTable({
  data,
  mine = false,
}: {
  data: Rows;
  mine?: boolean;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr>
            {[
              ...(mine ? ["Client", "Engagement"] : []),
              "Point number",
              "Type",
              "Title",
              "Raised by",
              "Assigned to",
              "Raised date",
              "Age",
              "Due date",
              "Priority",
              "Status",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((p) => (
            <tr key={p.id}>
              {mine && (
                <>
                  <td>{p.engagement.client.displayName}</td>
                  <td>{p.engagement.engagementName}</td>
                </>
              )}
              <td>
                <Link href={`/engagements/${p.engagementId}/points/${p.id}`}>
                  {p.pointNumber}
                </Link>
              </td>
              <td>{pointLabel(p.pointType)}</td>
              <td>
                {p.title}
                {p.blocking && <strong> · Blocking</strong>}
              </td>
              <td>{person(p.raisedBy)}</td>
              <td>{person(p.assignedTo)}</td>
              <td>{p.raisedDate}</td>
              <td>{p.age === null ? "—" : `${p.age} days`}</td>
              <td>
                {p.dueDate?.toISOString().slice(0, 10) ?? "—"}
                {p.overdue ? " · Overdue" : ""}
              </td>
              <td>{p.priority}</td>
              <td>{pointLabel(p.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.items.length && <p>No points match these filters.</p>}
    </div>
  );
}
export async function PointsWorkspace({
  engagementId,
  query,
}: {
  engagementId: string;
  query: Record<string, string>;
}) {
  const token = await sessionToken();
  const [data, options] = await Promise.all([
    listPoints(token, engagementId, query),
    pointOptions(token, engagementId),
  ]);
  const s = data.summary,
    f = data.filters,
    url = (page: number) =>
      `?${new URLSearchParams({ ...query, tab: "queries", page: String(page) })}`;
  return (
    <section>
      <div className="section-heading">
        <h2>Queries / Open Points</h2>
        {options.permissions.includes("points.create") &&
          options.permissions.includes("points.assign") && (
            <Link
              className="button primary"
              href={`/engagements/${engagementId}/points/new`}
            >
              + Raise Point
            </Link>
          )}
      </div>
      <div className="client-owner-strip">
        {Object.entries({
          Total: s.total,
          Open: s.open,
          "Awaiting Response": s.awaitingResponse,
          Resolved: s.resolved,
          Blocking: s.blocking,
          Overdue: s.overdue,
        }).map(([label, value]) => (
          <span key={label}>
            {label}
            <strong>{value}</strong>
          </span>
        ))}
      </div>
      <p className="muted">
        Summary follows filters. Open includes all unresolved actionable points.
        Calendar-day aging in {options.timezone}, from the original raised date.
      </p>
      <div className="actions">
        {Object.entries(s.aging).map(([bucket, count]) => (
          <span key={bucket}>
            Open {bucket} days: <strong>{count}</strong>
          </span>
        ))}
      </div>
      <form className="card detail-card" method="get">
        <input type="hidden" name="tab" value="queries" />
        <div className="form-grid">
          <Field label="Search points">
            <input name="q" maxLength={200} defaultValue={f.q} />
          </Field>
          <Field label="Point type">
            <select name="pointType" defaultValue={f.pointType}>
              <option value="">All types</option>
              {POINT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {pointLabel(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={f.status}>
              <option value="">All statuses</option>
              {POINT_STATUSES.map((t) => (
                <option key={t} value={t}>
                  {pointLabel(t)}
                </option>
              ))}
            </select>
          </Field>
          {(["assignedToUserId", "raisedByUserId"] as const).map((key) => (
            <Field
              key={key}
              label={key === "assignedToUserId" ? "Assigned to" : "Raised by"}
            >
              <select name={key} defaultValue={f[key] ?? ""}>
                <option value="">All employees</option>
                {options.participants.map((u) => (
                  <option key={u.id} value={u.id}>
                    {person(u)}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="Priority">
            <select name="priority" defaultValue={f.priority}>
              <option value="">All priorities</option>
              {POINT_PRIORITIES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input name="dueDate" type="date" defaultValue={f.dueDate ?? ""} />
          </Field>
          <Field label="Blocking">
            <select name="blocking" defaultValue={f.blocking}>
              <option value="">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="View">
            <select name="view" defaultValue={f.view}>
              <option value="">All points</option>
              <option value="open">Open actionable</option>
              <option value="overdue">Overdue actionable</option>
              <option value="blocking">Unresolved blocking</option>
            </select>
          </Field>
          <Field label="Workflow stage">
            <select
              name="workflowStageId"
              defaultValue={f.workflowStageId ?? ""}
            >
              <option value="">All stages</option>
              {options.stages.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Checklist item">
            <select
              name="checklistItemId"
              defaultValue={f.checklistItemId ?? ""}
            >
              <option value="">All items</option>
              {options.checklistItems.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.itemTitle}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="actions">
          <button className="button secondary">Apply filters</button>
          <Link href={`?tab=queries`}>Clear filters</Link>
        </div>
      </form>
      <PointTable data={data} />
      <p>
        {s.total} points · Page {f.page}
      </p>
      <div className="actions">
        {f.page > 1 && <Link href={url(f.page - 1)}>Previous points</Link>}
        {f.page * 25 < s.total && (
          <Link href={url(f.page + 1)}>Next points</Link>
        )}
      </div>
    </section>
  );
}
export async function PointOverview({
  engagementId,
}: {
  engagementId: string;
}) {
  const s = await pointSummary(await sessionToken(), engagementId);
  return (
    <section className="card detail-card">
      <h2>Points</h2>
      <div className="client-owner-strip">
        {(
          [
            ["Open Points", s.open, "open"],
            ["Blocking Points", s.blocking, "blocking"],
            ["Overdue Points", s.overdue, "overdue"],
          ] as const
        ).map(([label, count, view]) => (
          <Link
            key={view}
            href={`/engagements/${engagementId}?tab=queries&view=${view}`}
          >
            {label}
            <strong> {count}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
export async function MyPoints({ query }: { query: Record<string, string> }) {
  const data = await listPoints(
    await sessionToken(),
    null,
    { page: query.pointsPage ?? 1, view: query.pointsView ?? "open" },
    true,
  );
  const url = (page: number) =>
    `?${new URLSearchParams({ ...query, pointsPage: String(page) })}`;
  return (
    <section className="card detail-card">
      <h2>Points Assigned to Me</h2>
      <p className="muted">
        Point responsibilities do not contribute to planned allocation hours.
        Calendar-day aging in {data.timezone}.
      </p>
      <div className="actions">
        <Link
          href={`?${new URLSearchParams({ ...query, pointsView: "open", pointsPage: "1" })}`}
        >
          Open actionable points
        </Link>
        <Link
          href={`?${new URLSearchParams({ ...query, pointsView: "", pointsPage: "1" })}`}
        >
          All assigned points
        </Link>
      </div>
      <PointTable data={data} mine />
      <p>
        {data.summary.total} points · Page {data.filters.page}
      </p>
      <div className="actions">
        {data.filters.page > 1 && (
          <Link href={url(data.filters.page - 1)}>
            Previous assigned points
          </Link>
        )}
        {data.filters.page * 25 < data.summary.total && (
          <Link href={url(data.filters.page + 1)}>Next assigned points</Link>
        )}
      </div>
    </section>
  );
}
