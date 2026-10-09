import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, sessionToken } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { myTime } from "@/lib/time";
import { businessDate } from "@/lib/time-validation";
import { AddTime } from "@/components/time/entry";
import { TimeTable } from "@/components/time/table";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await currentUser();
  if (
    !hasPermission(actor, "time.view_own") ||
    !hasPermission(actor, "engagements.view")
  )
    notFound();
  const query = await searchParams,
    view = ["today", "week", "previous"].includes(query.view)
      ? query.view
      : "week";
  if (query.weekOf && !businessDate.safeParse(query.weekOf).success) notFound();
  const data = await myTime(
    await sessionToken(),
    view,
    query.weekOf || undefined,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>My Time</h1>
          <p>
            Today: {data.today}h · This Week: {data.week}h
          </p>
          <p className="muted small">
            Recorded totals include drafts and submitted time. Only submitted
            time counts toward engagement actuals.
          </p>
        </div>
      </div>
      {hasPermission(actor, "time.create") && (
        <AddTime today={data.dates.today} />
      )}
      <nav className="tabs" aria-label="Time periods">
        {[
          ["today", "Today"],
          ["week", "This Week"],
          ["previous", "Previous Week"],
        ].map(([value, label]) => (
          <Link
            key={value}
            className={!data.selected && view === value ? "active" : ""}
            href={`?view=${value}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <details>
        <summary>Find another week</summary>
        <form>
          <label>
            Work date in week{" "}
            <input
              name="weekOf"
              type="date"
              required
              defaultValue={query.weekOf}
            />
          </label>
          <button className="button secondary">Show Week</button>
        </form>
      </details>
      <section className="card detail-card">
        <h2>
          {data.selected
            ? `Week ${data.selected.weekStart} – ${data.selected.weekEnd}`
            : view === "today"
              ? "Today's time"
              : "Weekly time"}{" "}
          · {data.total}h
        </h2>
        <TimeTable
          key={query.weekOf || view}
          rows={data.items.map((e) => ({
            ...e,
            hours: e.hours.toFixed(2),
            workDate: e.workDate.toISOString(),
            submittedAt: e.submittedAt?.toISOString() ?? null,
          }))}
          userId={actor.id}
          today={data.dates.today}
          edit={hasPermission(actor, "time.edit_own")}
          submit={hasPermission(actor, "time.submit")}
          correct={false}
        />
      </section>
    </>
  );
}
