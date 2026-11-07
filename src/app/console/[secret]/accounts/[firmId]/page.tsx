import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { consolePage } from "@/lib/platform-page";
import { firmDetail } from "@/lib/platform";
import { AppError } from "@/lib/errors";
import { ConsoleShell, Section } from "@/components/platform/shell";
import { PlanBadge, shortDate } from "@/components/platform/badges";
import { DialogAction, IssueKeyForm, QuickAction, RevealKey } from "@/components/platform/forms";
import { describe } from "@/components/platform/describe";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="console-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : null;
  return (
    <div className="usage">
      <div>
        <span>{label}</span>
        <span className={max && used > max ? "error-text" : ""}>
          {used}
          {max ? ` of ${max}` : ""}
        </span>
      </div>
      {pct !== null && (
        <span className="usage-bar">
          <span style={{ width: `${pct}%` }} className={used > (max ?? 0) ? "over" : ""} />
        </span>
      )}
    </div>
  );
}
const when = (v: string | Date) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(v));

export default async function AccountPage({ params }: { params: Promise<{ secret: string; firmId: string }> }) {
  const { admin, base } = await consolePage(params);
  const { firmId } = await params;
  let detail;
  try {
    detail = await firmDetail(firmId);
  } catch (error) {
    if (error instanceof AppError && error.status < 500) notFound();
    throw error;
  }
  const { firm, state, users, redemptions, issues, events, reminders, usage } = detail;
  const owner = users.find((u) => u.isAccountOwner);
  const plan = firm.status === "Suspended" ? "suspended" : state.plan;
  const api = `/api/platform/firms/${firm.id}`;
  return (
    <ConsoleShell base={base} admin={admin} current="accounts" title={firm.name} description={firm.registeredName !== firm.name ? firm.registeredName : undefined}>
      <Link href={`${base}/accounts`} className="back-link">
        <ArrowLeft size={15} /> Accounts
      </Link>
      <div className="console-actions">
        <PlanBadge plan={plan} state={state} />
        <QuickAction url={`${api}/remind`} label="Send plan reminder" />
        <DialogAction label="Add free days" title="Add free days" url={`${api}/days`} submitLabel="Add days">
          <p className="muted small">
            Added to the {state.licenseEndsAt ? "plan" : "trial"}, after it ends{state.lapsed || state.expired ? " (counted from today, as it has already ended)" : ""}.
          </p>
          <label className="field">
            <span>Days</span>
            <input name="days" type="number" min={1} max={365} defaultValue={7} required />
            <small>1 to 365.</small>
          </label>
          <label className="field">
            <span>Reason</span>
            <input name="reason" maxLength={500} required />
          </label>
        </DialogAction>
        <DialogAction label="Issue contact-sales key" title="Issue contact-sales key" wide>
          <IssueKeyForm firm={{ id: firm.id, name: firm.name }} planRunning={state.licensed} />
        </DialogAction>
        {owner?.status === "Active" && (
          <QuickAction url={`${api}/reset`} label="Send password reset" confirm={`Email a password reset link to ${owner.email}?`} />
        )}
        {firm.status === "Active" ? (
          <DialogAction label="Lock account" title="Lock account" url={`${api}/status`} data={{ status: "Suspended" }} danger>
            <p className="muted small">Everyone in {firm.name} is signed out and can&rsquo;t sign in until you unlock it. Their data is kept.</p>
            <label className="field">
              <span>Reason</span>
              <input name="reason" maxLength={500} required autoFocus />
            </label>
          </DialogAction>
        ) : (
          <DialogAction label="Unlock account" title="Unlock account" url={`${api}/status`} data={{ status: "Active" }}>
            <label className="field">
              <span>Note (optional)</span>
              <input name="reason" maxLength={500} />
            </label>
          </DialogAction>
        )}
      </div>

      <div className="console-two">
        <Section title="Owner & contact">
          <dl className="console-dl">
            <Row label="Account owner">{owner ? `${owner.firstName} ${owner.lastName}` : "—"}</Row>
            <Row label="Email">{owner ? <a href={`mailto:${owner.email}`}>{owner.email}</a> : "—"}</Row>
            <Row label="Signed up">{shortDate(firm.createdAt)}</Row>
            <Row label="Last sign-in">{owner?.lastLoginAt ? when(owner.lastLoginAt) : "—"}</Row>
            <Row label="Time zone">{firm.timezone}</Row>
            <Row label="Workspace ID">
              <code>{firm.id}</code>
            </Row>
          </dl>
        </Section>
        <Section title="Plan & usage">
          <dl className="console-dl">
            <Row label="Plan">
              {state.licensed ? `Paid · ${state.seats} users` : state.lapsed ? "Ended" : state.isTrial ? "Free trial" : "Ongoing access"}
            </Row>
            <Row label={state.licenseEndsAt ? (state.lapsed ? "Ended" : "Paid through") : "Trial ends"}>
              {shortDate(state.licenseEndsAt ?? state.endsAt)}
              {state.licensed ? ` · ${state.licenseDaysRemaining} d left` : state.isTrial && !state.readOnly && !state.licenseEndsAt ? ` · ${state.daysRemaining} d left` : ""}
            </Row>
          </dl>
          <Usage label="Users with access" used={state.seatsInUse ?? 0} max={state.licensed ? state.seats : null} />
          <Usage label="Users (not deactivated)" used={usage.users} max={null} />
          <Usage label="Clients" used={usage.clients} max={null} />
          <Usage label="Engagements" used={usage.engagements} max={null} />
        </Section>
      </div>

      <Section title="Users" empty={!users.length}>
        <ul className="console-rows">
          {users.map((u) => (
            <li key={u.id}>
              <span>
                <strong>
                  {u.firstName} {u.lastName}
                  {u.isAccountOwner && <span className="account-owner">Account owner</span>}
                </strong>
                <small>
                  {u.email} · {u.role.roleName}
                </small>
              </span>
              <span className="row-end">
                <span className={`status ${u.status.toLowerCase()}`}>{u.status}</span>
                <span className="muted small">{u.hasSeat ? "Has access" : "No access"}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Keys redeemed" empty={!redemptions.length}>
        <ul className="console-rows">
          {redemptions.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.revoked ? "Cancelled key" : r.days === 0 ? `+${r.seats} users` : `${r.days} days · ${r.seats} users`}</strong>
                <small>
                  {when(r.createdAt)} · {r.userId ? "redeemed by the account owner" : r.revoked ? "refund" : "applied by Setu"}
                </small>
              </span>
              <span className="row-end">{r.newExpiresAt ? `Paid through ${shortDate(r.newExpiresAt)}` : ""}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Contact-sales keys issued" empty={!issues.length}>
        <ul className="console-rows">
          {issues.map((i) => (
            <li key={i.id}>
              <span>
                <strong>{i.kind === "addon" ? `+${i.seats} users` : `${i.days} days · ${i.seats} users`}</strong>
                <small>
                  {i.orderRef}
                  {i.amount ? ` · ${i.currency} ${i.amount.toString()}` : ""}
                  {i.note ? ` · ${i.note}` : ""} · {i.issuedBy?.name ?? "CLI"} · {shortDate(i.createdAt)}
                </small>
              </span>
              <span className="row-end">
                <span className={`status ${i.redeemed ? "active" : "trial"}`}>{i.redeemed ? "Used" : "Not used"}</span>
                {!i.redeemed && (
                  <>
                    <RevealKey issueId={i.id} />
                    <QuickAction url={`/api/platform/keys/${i.id}/cancel`} label="Cancel" danger confirm="Cancel this key? It will no longer redeem." />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Plan reminders sent" empty={!reminders.length}>
        <ul className="console-rows">
          {reminders.map((r) => (
            <li key={r.id}>
              <span>
                <strong>{r.kind === "auto" ? `Automatic · ${r.daysBefore} days before` : "Sent by Setu"}</strong>
                <small>
                  {when(r.createdAt)} · {r.sentTo}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Setu team activity" empty={!events.length}>
        <ul className="console-rows">
          {events.map((e) => (
            <li key={e.id}>
              <span>
                <strong>{describe(e.action, e.metadata as Record<string, unknown>)}</strong>
                <small>
                  {e.admin?.name ?? "Setu"} · {when(e.createdAt)}
                  {e.ip ? ` · ${e.ip}` : ""}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </ConsoleShell>
  );
}
