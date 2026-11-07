import { consolePage } from "@/lib/platform-page";
import { listTeam } from "@/lib/platform-auth";
import { ConsoleShell, Section } from "@/components/platform/shell";
import { InviteStaff, QuickAction } from "@/components/platform/forms";

const when = (v: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(v));

export default async function Team({ params }: { params: Promise<{ secret: string }> }) {
  const { admin, base } = await consolePage(params);
  const team = await listTeam();
  return (
    <ConsoleShell base={base} admin={admin} current="team" title="Team" description="Setu staff who can use this admin. Each signs in with a password and an authenticator app.">
      <ul className="team-list">
        {team.map((t) => (
          <li key={t.id} className="card team-row">
            <span>
              <strong>
                {t.name}
                {t.id === admin.id ? " (you)" : ""}
              </strong>
              <small>
                {t.email} · {t.lastLoginAt ? `last sign-in ${when(t.lastLoginAt)}` : "never signed in"}
              </small>
            </span>
            <span className="row-end">
              <span className={`status ${t.status === "Active" ? "active" : t.status === "Disabled" ? "ended" : "trial"}`}>{t.status}</span>
              {t.id !== admin.id && (
                <>
                  <QuickAction
                    url={`/api/platform/team/${t.id}/reset`}
                    label={t.status === "Invited" ? "Resend invite" : "Reset sign-in"}
                    confirm={`Email ${t.email} a new set-password link? Their authenticator app will need linking again.`}
                  />
                  {t.status === "Disabled" ? (
                    <QuickAction url={`/api/platform/team/${t.id}/active`} label="Enable" data={{ active: true }} />
                  ) : (
                    <QuickAction url={`/api/platform/team/${t.id}/active`} label="Disable" danger data={{ active: false }} confirm={`Disable ${t.name}? They are signed out at once.`} />
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Section title="Invite a team member">
        <InviteStaff />
      </Section>
    </ConsoleShell>
  );
}
