import Link from "next/link";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { currentUser, sessionToken } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { dashboardData } from "@/lib/dashboard";
import { AppError } from "@/lib/errors";
import { ReportTable } from "@/components/report-table";
import { EXCEPTION_TYPES } from "@/lib/insights";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await currentUser();
  if (!hasPermission(actor, "engagements.view"))
    return (
      <>
        <h1>Welcome, {actor.firstName}</h1>
        <p>Your role does not include operational engagement views.</p>
        {hasPermission(actor, "users.manage") && (
          <Link href="/admin/users">Manage users</Link>
        )}
      </>
    );
  const query = await searchParams;
  let data: Awaited<ReturnType<typeof dashboardData>>;
  try {
    data = await dashboardData(await sessionToken(), query);
  } catch (e) {
    if (e instanceof AppError && [403, 404].includes(e.status)) notFound();
    if (e instanceof ZodError || e instanceof AppError)
      return (
        <>
          <h1>Dashboard</h1>
          <p role="alert">
            {e instanceof ZodError ? "Check the selected filters." : e.message}
          </p>
          <Link href="/dashboard">Reset dashboard</Link>
        </>
      );
    throw e;
  }
  const url = (changes: Record<string, string>) =>
    `?${new URLSearchParams({ ...query, ...changes, page: "1" })}`;
  const health = query.view === "health" || query.view === "deadlines";
  const top = data.management
    ? [
        {
          label: "Active Engagements",
          value: data.summary.active,
          href: "?view=health&scope=active",
        },
        {
          label: "Due This Week",
          value: data.summary.week,
          href: "?view=deadlines&deadline=week",
        },
        {
          label: "Overdue",
          value: data.summary.overdue,
          href: "?view=deadlines&deadline=overdue",
        },
        ...(data.rights.points
          ? [
              {
                label: "Blocking Issues",
                value: data.summary.blocking,
                href: "?flag=BLOCKING_POINT",
              },
            ]
          : []),
      ]
    : [
        {
          label: "Due Today",
          value: data.summary.today,
          href: "?view=deadlines&deadline=today",
        },
        {
          label: "Overdue",
          value: data.summary.overdue,
          href: "?view=deadlines&deadline=overdue",
        },
        ...(data.rights.points
          ? [
              {
                label: "Points Assigned to Me",
                value: data.summary.points,
                href: "#my-points",
              },
            ]
          : []),
        ...(data.rights.checklist
          ? [
              {
                label: "Checklist Requiring Attention",
                value: data.summary.checklistAttention,
                href: "#my-checklist",
              },
            ]
          : []),
      ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{data.management ? "Dashboard" : "My Day"}</h1>
          <p className="muted">
            {data.dates.today} ·{" "}
            {data.management
              ? "Your permitted portfolio"
              : "Your assigned work"}{" "}
            · Refreshed on page load
          </p>
        </div>
        {data.reports && <Link href="/reports">Operational Reports</Link>}
      </div>
      <div className="insight-summary">
        {top.map((c) => (
          <Link
            className="card detail-card"
            href={
              c.href.startsWith("?")
                ? url({
                    flag: "all",
                    deadline: "all",
                    pipeline: "",
                    ...Object.fromEntries(new URLSearchParams(c.href.slice(1))),
                  })
                : c.href
            }
            key={c.label}
          >
            <span>{c.label}</span>
            <strong>{c.value}</strong>
          </Link>
        ))}
      </div>
      <nav className="tabs" aria-label="Dashboard views">
        <Link className={!health ? "active" : ""} href="/dashboard">
          Needs Attention
        </Link>
        {data.management && (
          <Link
            className={query.view === "health" ? "active" : ""}
            href="?view=health"
          >
            Engagement Health
          </Link>
        )}
        <Link
          className={query.view === "deadlines" ? "active" : ""}
          href="?view=deadlines&deadline=week"
        >
          Deadlines
        </Link>
      </nav>
      {health ? (
        <section className="card detail-card">
          <h2>
            {query.view === "deadlines" ? "Deadlines" : "Engagement Health"}
          </h2>
          {query.view === "deadlines" && (
            <nav className="tabs">
              {[
                ["today", "Today"],
                ["week", "This Week"],
                ["next7", "Next 7 Days"],
                ["overdue", "Overdue"],
              ].map(([value, label]) => (
                <Link key={value} href={url({ deadline: value })}>
                  {label}
                </Link>
              ))}
            </nav>
          )}
          <ReportTable
            columns={
              data.management
                ? [
                    "Client / Engagement",
                    "Current Stage",
                    "Owner",
                    "Due",
                    "Checklist %",
                    "Open Points",
                    "Budget Used %",
                    "Why Flagged",
                  ]
                : ["Client / Engagement", "Current Stage", "Owner", "Due"]
            }
            rows={data.health.map((r) => ({
              id: r.id,
              href: r.href,
              cells: data.management
                ? [
                    `${r.client} · ${r.engagement}`,
                    r.stage,
                    r.owner,
                    r.due,
                    r.progress?.percent ?? null,
                    r.openPoints,
                    r.hours?.used ?? null,
                    r.exceptions.map((e) => e.reason).join(" ") ||
                      "No exceptions",
                  ]
                : [`${r.client} · ${r.engagement}`, r.stage, r.owner, r.due],
            }))}
            empty="No engagements match this view."
          />
          <p className="muted small">
            {data.healthTotal} engagements. Flags reflect documented rules, not
            a score.
          </p>
        </section>
      ) : (
        <section className="card detail-card">
          <div className="section-heading">
            <h2>Needs Attention</h2>
            <span>{data.exceptionTotal} exceptions</span>
          </div>
          <details>
            <summary>Filter attention list</summary>
            <form className="form-grid">
              <label>
                Exception
                <select name="flag" defaultValue={query.flag ?? "all"}>
                  <option value="all">All exceptions</option>
                  {EXCEPTION_TYPES.map((t) => (
                    <option value={t} key={t}>
                      {t.toLowerCase().replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Client / Engagement
                <input name="q" defaultValue={query.q} />
              </label>
              <button className="button secondary">Apply</button>
            </form>
          </details>
          <ReportTable
            columns={["Priority / Record", "Owner", "Due", "Reason"]}
            rows={data.exceptions.map((e) => ({
              id: e.id,
              href: e.href,
              cells: [`${e.priority} · ${e.subject}`, e.owner, e.due, e.reason],
            }))}
            empty="No records require attention."
          />
        </section>
      )}
      <nav className="pagination" aria-label="Dashboard pages">
        {data.page > 1 && (
          <Link
            href={`?${new URLSearchParams({ ...query, page: String(data.page - 1) })}`}
          >
            Previous
          </Link>
        )}
        <span>Page {data.page}</span>
        {data.page * 25 < (health ? data.healthTotal : data.exceptionTotal) && (
          <Link
            href={`?${new URLSearchParams({ ...query, page: String(data.page + 1) })}`}
          >
            Next
          </Link>
        )}
      </nav>
      {!data.management && (
        <section className="card detail-card">
          <h2>My Work</h2>
          {data.rights.points && (
            <div id="my-points">
              <h3>Points Assigned to Me · {data.ownPoints.length}</h3>
              <ReportTable
                columns={["Point", "Status", "Due"]}
                rows={data.ownPoints.map((p) => ({
                  id: p.id,
                  href: p.href,
                  cells: [
                    p.pointNumber,
                    p.status,
                    p.dueDate?.toISOString().slice(0, 10) ?? null,
                  ],
                }))}
                empty="No open points assigned to you."
              />
            </div>
          )}
          {data.rights.checklist && (
            <div id="my-checklist">
              <h3>
                Checklist Requiring Attention · {data.ownChecklist.length}
              </h3>
              <ReportTable
                columns={["Item", "Status", "Due"]}
                rows={data.ownChecklist.map((c) => ({
                  id: c.id,
                  href: `/engagements/${c.engagementId}?tab=checklist`,
                  cells: [
                    c.itemTitle,
                    c.status,
                    c.dueDate?.toISOString().slice(0, 10) ?? null,
                  ],
                }))}
                empty="No assigned checklist items require attention."
              />
            </div>
          )}
          <p>
            Your assignments, checklist responsibilities and points stay in one
            work queue.
          </p>
          {data.canWork && (
            <Link className="button primary" href="/my-work">
              Open My Work
              {data.work !== null
                ? ` · ${data.work} unfinished allocations`
                : ""}
            </Link>
          )}
          {hasPermission(actor, "time.view_own") && (
            <p>
              <Link href="/my-time">Record or review my time</Link>
            </p>
          )}
        </section>
      )}
      {data.management && (
        <>
          {!!data.pipeline.length && (
            <details className="card detail-card">
              <summary>Workflow pipeline</summary>
              <div className="actions">
                {data.pipeline.map(([category, count]) => (
                  <Link
                    key={category}
                    href={url({
                      view: "health",
                      deadline: "all",
                      pipeline: category,
                    })}
                  >
                    {category}: {count}
                  </Link>
                ))}
              </div>
              <p className="muted small">
                Current stage categories across active engagements; templates
                may use different stage names.
              </p>
            </details>
          )}
          <details className="card detail-card">
            <summary>Checklist, points and budget summaries</summary>
            {data.rights.checklist && (
              <p>
                Checklist: {data.checklist.completed}/
                {data.checklist.applicable} applicable items complete ·{" "}
                <Link
                  href={url({ view: "attention", flag: "CHECKLIST_BLOCKED" })}
                >
                  {data.checklist.blocked} blocked
                </Link>{" "}
                · {data.checklist.required} required outstanding ·{" "}
                {data.checklist.overdue} overdue{" "}
                {data.reports && (
                  <Link
                    href={`/reports${url({ report: "checklist", flag: "all", deadline: "all", pipeline: "" })}`}
                  >
                    View checklist report
                  </Link>
                )}
              </p>
            )}
            {data.rights.points && (
              <p>
                Points: {data.points.open} open ·{" "}
                <Link href={url({ view: "attention", flag: "BLOCKING_POINT" })}>
                  {data.points.blocking} blocking
                </Link>{" "}
                ·{" "}
                <Link href={url({ view: "attention", flag: "POINT_OVERDUE" })}>
                  {data.points.overdue} overdue
                </Link>{" "}
                · {data.points.aged} older than 5 days{" "}
                {data.reports && (
                  <Link
                    href={`/reports${url({ report: "points", flag: "all", deadline: "all", pipeline: "" })}`}
                  >
                    View aging report
                  </Link>
                )}
              </p>
            )}
            {data.rights.budget && (
              <p>
                Budget:{" "}
                <Link href={url({ view: "attention", flag: "BUDGET_WARNING" })}>
                  {data.budget.warning} near limit
                </Link>{" "}
                ·{" "}
                <Link
                  href={url({ view: "attention", flag: "BUDGET_EXCEEDED" })}
                >
                  {data.budget.exceeded} exceeded
                </Link>{" "}
                {data.reports && (
                  <Link
                    href={`/reports${url({ report: "budget", flag: "all", deadline: "all", pipeline: "" })}`}
                  >
                    View budget report
                  </Link>
                )}
              </p>
            )}
          </details>
          {data.capacity && (
            <details className="card detail-card">
              <summary>Team capacity · this week</summary>
              <p>
                <Link href="/team/capacity?load=Available">
                  {data.capacity.available} available
                </Link>{" "}
                ·{" "}
                <Link href="/team/capacity?load=Near%20Capacity">
                  {data.capacity.near} near capacity
                </Link>{" "}
                ·{" "}
                <Link href="?flag=CAPACITY_OVERLOAD">
                  {data.capacity.overloaded} overloaded
                </Link>
              </p>
              {!data.capacity.overloaded && (
                <p>Team capacity looks balanced this week.</p>
              )}
              <Link href="/team/capacity">Open Team Capacity</Link>
            </details>
          )}
        </>
      )}
      <details className="card detail-card">
        <summary>How attention is determined</summary>
        <p>
          Due soon means within 3 calendar days. Stagnation means time in the
          current stage exceeds its target. Budget warnings begin at 80%;
          exceeded budgets become Critical at 110%. Overdue engagements and
          blocking points near an engagement deadline are Critical. Other
          exceptions need Attention; unscheduled responsibilities are
          Informational. Budget actuals include submitted time only. Capacity
          uses planned hours, not actual time.
        </p>
      </details>
    </>
  );
}
