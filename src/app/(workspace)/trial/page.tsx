import Link from "next/link";
import { currentUser } from "@/lib/session";
import { trialState } from "@/lib/trial";
import { hasPermission } from "@/lib/auth";
export default async function TrialPage() {
  const user = await currentUser(),
    state = trialState(user.firm);
  const support = process.env.TRIAL_CONTACT_EMAIL ?? "hello@setutechnology.com";
  const contact =
    support && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(support) ? support : null;
  return (
    <>
      <h1>Your firm’s trial</h1>
      <section className="card detail-card">
        <h2>{user.firm.displayName}</h2>
        <p>
          {!state.isTrial
            ? "Your firm has ongoing access."
            : state.expired
              ? "Your trial has ended. Your workspace is read-only and your data is preserved."
              : state.pending
                ? "Activate your administrator invitation to start your 15 days."
                : `${state.daysRemaining} days remaining in your 15-day trial.`}
        </p>
        {state.endsAt && (
          <p>
            Trial ends:{" "}
            {new Intl.DateTimeFormat("en", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: user.firm.timezone,
            }).format(new Date(state.endsAt))}{" "}
            ({user.firm.timezone}).
          </p>
        )}
        {state.isTrial && (
          <>
            <h3>Contact us to continue</h3>
            {contact ? (
              <a
                className="button primary"
                href={`mailto:${contact}?subject=${encodeURIComponent(`Continue Setu trial — ${user.firm.displayName}`)}&body=${encodeURIComponent(`Firm: ${user.firm.displayName}\nWorkspace reference: ${user.firmId}\nPlease help us continue using Setu.`)}`}
              >
                Contact Setu
              </a>
            ) : (
              <p>
                Contact the Setu representative who shared this trial with you.
                Include your firm name and workspace reference below.
              </p>
            )}
            <p className="muted small">Workspace reference: {user.firmId}</p>
            <p>
              Inviting more users, resetting passwords or changing your timezone
              does not restart the firm’s trial.
            </p>
          </>
        )}
        {!state.readOnly && (
          <>
            <h3>Get started</h3>
            <p>
              Create your office, invite colleagues, add a client and create
              your first engagement.
            </p>
            <div className="actions">
              {hasPermission(user, "offices.manage") && (
                <Link href="/admin/offices">Set up an office</Link>
              )}
              {hasPermission(user, "users.manage") && (
                <Link href="/admin/users">Invite your team</Link>
              )}
              <Link href="/clients">Clients</Link>
              <Link href="/engagements">Engagements</Link>
            </div>
          </>
        )}
        <Link href="/dashboard">Return to dashboard</Link>
      </section>
    </>
  );
}
