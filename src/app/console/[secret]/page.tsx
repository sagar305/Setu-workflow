import { consolePage } from "@/lib/platform-page";
import { dashboard, REMINDER_DAYS } from "@/lib/platform";
import { ConsoleShell, Section, Stat } from "@/components/platform/shell";
import { RemindAll } from "@/components/platform/forms";

export default async function Dashboard({ params }: { params: Promise<{ secret: string }> }) {
  const { admin, base } = await consolePage(params);
  const d = await dashboard();
  const a = `${base}/accounts`;
  return (
    <ConsoleShell base={base} admin={admin} current="dashboard" title="Dashboard" description="All Setu Workflow accounts. Times are India time.">
      <div className="console-stats">
        <Stat label="Accounts" value={d.accounts} href={a} />
        <Stat label="On free trial" value={d.trial} href={`${a}?show=trial`} />
        <Stat label="Paying" value={d.paying} href={`${a}?show=paid`} />
        <Stat label="Ending in 14 days" value={d.expiringIn14Days} href={`${a}?show=expiring`} />
        <Stat label="Plan ended" value={d.planEnded} href={`${a}?show=ended`} />
        <Stat label="Trial ended" value={d.trialEnded} href={`${a}?show=trial-ended`} />
        <Stat label="Locked" value={d.locked} href={`${a}?show=locked`} />
        <Stat label="Sign-ups this month" value={d.signupsThisMonth} />
      </div>
      <div className="console-two">
        <Section title="Paying, by plan" empty={!d.paidByPlan.length}>
          <ul className="console-list">
            {d.paidByPlan.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <strong>{p.accounts}</strong>
              </li>
            ))}
          </ul>
          <p className="muted small">{d.paidUsers} paid users in total.</p>
        </Section>
        <Section title="Plan reminders">
          <p className="muted">
            Owners are emailed automatically at {REMINDER_DAYS.join(", ").replace(/, (\d+)$/, " and $1")} days before
            their plan ends. {d.remindersLast7Days} sent in the last 7 days.
          </p>
          <RemindAll />
        </Section>
      </div>
    </ConsoleShell>
  );
}
