import Link from "next/link";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { currentUser, sessionToken } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { REPORTS, reportData, type ReportKind } from "@/lib/reports";
import { ReportTable } from "@/components/report-table";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await currentUser();
  if (
    !hasPermission(actor, "reports.view") ||
    !hasPermission(actor, "engagements.view")
  )
    notFound();
  const query = await searchParams;
  const allowed = (Object.keys(REPORTS) as ReportKind[]).filter((k) =>
    hasPermission(actor, REPORTS[k].permission),
  );
  const input = { ...query, report: query.report ?? allowed[0] };
  let data: Awaited<ReturnType<typeof reportData>>;
  try {
    data = await reportData(await sessionToken(), input);
  } catch (e) {
    if (e instanceof AppError && [403, 404].includes(e.status)) notFound();
    if (e instanceof ZodError || e instanceof AppError)
      return (
        <>
          <h1>Reports</h1>
          <p role="alert">
            {e instanceof ZodError
              ? "Check the selected filters and dates."
              : e.message}
          </p>
          <Link href="/reports">Reset report filters</Link>
        </>
      );
    throw e;
  }
  const url = (changes: Record<string, string>) =>
    `?${new URLSearchParams({ ...input, ...changes })}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Reports</h1>
          <p className="muted">Operational views of records you can access.</p>
        </div>
        <Link href="/dashboard">Dashboard</Link>
      </div>
      <nav className="tabs" aria-label="Operational reports">
        {allowed.map((k) => (
          <Link
            key={k}
            className={data.kind === k ? "active" : ""}
            href={`?report=${k}`}
          >
            {REPORTS[k].title}
          </Link>
        ))}
      </nav>
      <div className="page-heading">
        <div>
          <h2>{data.title}</h2>
          <p className="muted">{data.description}</p>
        </div>
        {data.canExport && (
          <a
            className="button secondary"
            href={`/api/reports/export?${new URLSearchParams(input)}`}
          >
            Export CSV
          </a>
        )}
      </div>
      <details className="card detail-card">
        <summary>Report filters</summary>
        <form className="form-grid">
          <input type="hidden" name="report" value={data.kind} />
          <label>
            {data.kind === "capacity" ? "Employee name" : "Client / Engagement"}
            <input name="q" defaultValue={query.q} />
          </label>
          {data.kind === "capacity" ? (
            <>
              <label>
                Week containing
                <input name="week" type="date" defaultValue={query.week} />
              </label>
              <label>
                Period
                <select name="weeks" defaultValue={query.weeks ?? "1"}>
                  <option value="1">1 Week</option>
                  <option value="2">2 Weeks</option>
                  <option value="4">4 Weeks</option>
                </select>
              </label>
              <label>
                Planned load
                <select name="flag" defaultValue={query.flag ?? "all"}>
                  {["all", "Available", "Near Capacity", "Overloaded"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v === "all" ? "All" : v}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Engagement scope
                <select name="scope" defaultValue={query.scope ?? "active"}>
                  <option value="active">Active engagements</option>
                  <option value="all">All engagements</option>
                  <option value="completed">Completed engagements</option>
                </select>
              </label>
              <label>
                Engagement due from
                <input
                  name="dueFrom"
                  type="date"
                  defaultValue={query.dueFrom}
                />
              </label>
              <label>
                Engagement due to
                <input name="dueTo" type="date" defaultValue={query.dueTo} />
              </label>
            </>
          )}
          {data.kind === "points" && (
            <>
              <label>
                Aging bucket
                <select name="age" defaultValue={query.age ?? "all"}>
                  {["all", "0–2", "3–5", "6–10", "over 10"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Points
                <select name="flag" defaultValue={query.flag ?? "all"}>
                  {["all", "blocking", "overdue", "aged"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {data.kind === "budget" && (
            <label>
              Budget exceptions
              <select name="flag" defaultValue={query.flag ?? "all"}>
                <option value="all">All</option>
                <option value="BUDGET_WARNING">Near limit</option>
                <option value="BUDGET_EXCEEDED">Exceeded</option>
              </select>
            </label>
          )}
          {data.kind === "workflow" && (
            <label>
              Stage exceptions
              <select name="flag" defaultValue={query.flag ?? "all"}>
                <option value="all">All</option>
                <option value="stagnant">Beyond target</option>
              </select>
            </label>
          )}
          {data.kind === "checklist" && (
            <label>
              Checklist exceptions
              <select name="flag" defaultValue={query.flag ?? "all"}>
                {["all", "blocked", "required", "overdue"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          )}
          {Object.entries(query)
            .filter(([k]) =>
              [
                "engagementId",
                "clientId",
                "managerId",
                "serviceLineId",
                "deadline",
                "pipeline",
                "office",
                "role",
                "available",
                "inactive",
              ].includes(k),
            )
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <button className="button secondary">Apply Filters</button>
          <Link href={`?report=${data.kind}`}>Clear Filters</Link>
        </form>
      </details>
      <p className="muted small">
        {data.total} matching rows. CSV includes all matching rows, up to 5,000,
        using these filters.
      </p>
      <section className="card">
        <ReportTable columns={data.columns} rows={data.rows} />
      </section>
      <nav className="pagination" aria-label="Report pages">
        {data.page > 1 && (
          <Link href={url({ page: String(data.page - 1) })}>Previous</Link>
        )}
        <span>
          Page {data.page} of {data.pages}
        </span>
        {data.page < data.pages && (
          <Link href={url({ page: String(data.page + 1) })}>Next</Link>
        )}
      </nav>
    </>
  );
}
