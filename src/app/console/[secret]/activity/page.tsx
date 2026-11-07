import Link from "next/link";
import { consolePage } from "@/lib/platform-page";
import { activity } from "@/lib/platform";
import { listTeam } from "@/lib/platform-auth";
import { ConsoleShell } from "@/components/platform/shell";
import { FilterSelect } from "@/components/platform/forms";
import { ACTIVITY_GROUPS, describe } from "@/components/platform/describe";

const when = (v: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(v));

export default async function Activity({
  params,
  searchParams,
}: {
  params: Promise<{ secret: string }>;
  searchParams: Promise<{ what?: string; who?: string }>;
}) {
  const { admin, base } = await consolePage(params);
  const { what = "", who = "" } = await searchParams;
  const [rows, team] = await Promise.all([activity({ what, who }), listTeam()]);
  return (
    <ConsoleShell base={base} admin={admin} current="activity" title="Activity" description="Everything the Setu team did, and the daily reminder job. Newest first.">
      <div className="console-filter-bar">
        <FilterSelect name="what" label="What" value={what} options={ACTIVITY_GROUPS} />
        <FilterSelect name="who" label="Who" value={who} options={[["", "Everyone"], ...team.map((t) => [t.id, t.name] as [string, string])]} />
      </div>
      <ul className="card console-feed">
        {rows.map((r) => (
          <li key={r.id}>
            <strong>{describe(r.action, r.metadata)}</strong>
            <small>
              {r.who} · {when(r.createdAt)}
              {r.firm && (
                <>
                  {" · "}
                  <Link className="firm-link" href={`${base}/accounts/${r.firm.id}`}>
                    {r.firm.name}
                  </Link>
                </>
              )}
              {r.ip ? ` · ${r.ip}` : ""}
            </small>
          </li>
        ))}
        {rows.length === 0 && <li className="muted">Nothing yet.</li>}
      </ul>
    </ConsoleShell>
  );
}
