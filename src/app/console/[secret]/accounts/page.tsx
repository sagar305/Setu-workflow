import Link from "next/link";
import { consolePage } from "@/lib/platform-page";
import { listFirms } from "@/lib/platform";
import { ConsoleShell } from "@/components/platform/shell";
import { PlanBadge, shortDate } from "@/components/platform/badges";

const SHOW = [
  ["all", "All accounts"],
  ["trial", "On free trial"],
  ["paid", "Paying"],
  ["expiring", "Ending in 14 days"],
  ["ended", "Plan ended"],
  ["trial-ended", "Trial ended"],
  ["locked", "Locked"],
  ["ongoing", "Ongoing (no plan)"],
] as const;

export default async function Accounts({
  params,
  searchParams,
}: {
  params: Promise<{ secret: string }>;
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const { admin, base } = await consolePage(params);
  const { q = "", show = "all" } = await searchParams;
  const { rows } = await listFirms({ q, filter: show });
  return (
    <ConsoleShell
      base={base}
      admin={admin}
      current="accounts"
      title="Accounts"
      description="Plan, contact and usage only. Firms' clients, engagements and time are never shown here."
    >
      <form className="console-filter-bar">
        <label className="field grow">
          <span>Search</span>
          <input name="q" type="search" defaultValue={q} placeholder="Firm name, owner, email or workspace ID" />
        </label>
        <label className="field">
          <span>Show</span>
          <select name="show" defaultValue={show}>
            {SHOW.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Search</button>
      </form>
      <p className="muted small">
        {rows.length} account{rows.length === 1 ? "" : "s"}
      </p>
      <ul className="account-rows">
        {rows.map((r) => {
          const ends = r.state.licenseEndsAt ?? (r.state.isTrial ? r.state.endsAt : null);
          const left = r.state.licensed ? r.state.licenseDaysRemaining : r.state.isTrial && !r.state.readOnly ? r.state.daysRemaining : null;
          return (
            <li key={r.id}>
              <Link href={`${base}/accounts/${r.id}`} className="card account-row">
                <span className="account-name">
                  <strong>{r.name}</strong>
                  <small>{r.owner ? `${r.owner.name} · ${r.owner.email}` : "No account owner"}</small>
                </span>
                <span className="account-plan">
                  <PlanBadge plan={r.plan} state={r.state} />
                  <span>{r.state.seats ? `${r.state.seats} users` : ""}</span>
                </span>
                <span className="account-meta">
                  <span>
                    {ends ? `${r.state.lapsed || r.state.expired ? "Ended" : "Ends"} ${shortDate(ends)}` : "No end date"}
                    {left !== null ? ` · ${left} d` : ""}
                  </span>
                  <span className={r.state.overSeats ? "error-text" : ""}>
                    {r.state.licensed ? `${r.state.seatsInUse} of ${r.state.seats} users` : `${r.users} user${r.users === 1 ? "" : "s"}`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && <li className="muted">No accounts match.</li>}
      </ul>
    </ConsoleShell>
  );
}
