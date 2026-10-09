import { engagementHours, engagementTime } from "@/lib/time";
import { currentUser, sessionToken } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { firmDates } from "@/lib/engagement-constants";
import { TimeTable } from "./table";
export async function BudgetHours({ engagementId }: { engagementId: string }) {
  const actor = await currentUser(),
    token = await sessionToken();
  const budget = hasPermission(actor, "budget.view")
    ? await engagementHours(token, engagementId)
    : null;
  const entries = hasPermission(actor, "time.view_engagement")
    ? await engagementTime(token, engagementId)
    : null;
  return (
    <section className="card detail-card">
      <h2>Budget &amp; Hours</h2>
      {budget && (
        <>
          <dl className="client-details">
            {[
              ["Budget", budget.budget],
              ["Planned", budget.planned],
              ["Actual", budget.actual],
              ["Remaining", budget.remaining],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value === null ? "Not set" : `${value}h`}</dd>
              </div>
            ))}
          </dl>
          <p>
            Budget used:{" "}
            {budget.used === null ? "Not applicable" : `${budget.used}%`}
          </p>
          {budget.used !== null && (
            <progress
              aria-label="Budget used"
              max={100}
              value={Math.min(100, Number(budget.used))}
            />
          )}
          {budget.warnings.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
          <p className="muted small">
            Actual hours include submitted time only. Planned hours include all
            non-cancelled allocations. Difference = planned − actual.
          </p>
          <table>
            <thead>
              <tr>
                {[
                  "Employee",
                  "Engagement Role",
                  "Planned",
                  "Actual",
                  "Difference",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {budget.employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.firstName} {e.lastName}
                  </td>
                  <td>{e.role}</td>
                  <td>{e.planned}h</td>
                  <td>{e.actual}h</td>
                  <td>{e.difference}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {entries && (
        <details>
          <summary>Time entry details</summary>
          <TimeTable
            rows={entries.map((e) => ({
              ...e,
              hours: e.hours.toFixed(2),
              workDate: e.workDate.toISOString(),
              submittedAt: e.submittedAt?.toISOString() ?? null,
            }))}
            userId={actor.id}
            today={firmDates(actor.firm.timezone).today}
            team
            edit={false}
            submit={false}
            correct={hasPermission(actor, "time.correct")}
          />
        </details>
      )}
    </section>
  );
}
