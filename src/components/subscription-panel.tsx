"use client";
import { useState, useSyncExternalStore } from "react";

const subscribeHash = (callback: () => void) => {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
};
const readHashKey = () =>
  (new URLSearchParams(window.location.hash.slice(1)).get("key") ?? "").slice(0, 200);
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, UserCheck, UserMinus } from "lucide-react";
import { Field, MutationForm, post } from "./form";
import {
  BUY_URL,
  EXTRA_USER_PRICE,
  INCLUDED_USERS,
  PLAN_PRICES,
  formatPlanPrice,
} from "@/lib/plans";
import type { AccessState } from "@/lib/trial";

type SeatUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  hasSeat: boolean;
  isAccountOwner: boolean;
  role: { roleName: string };
};
type Redemption = {
  id: string;
  days: number;
  seats: number;
  newExpiresAt: string | null;
  createdAt: string;
};
type Props = {
  state: AccessState;
  canManage: boolean;
  keysEnabled: boolean;
  accountOwner: { name: string; email: string } | null;
  users: SeatUser[];
  redemptions: Redemption[];
  timezone: string;
  salesEmail: string;
  firmName: string;
  ownId: string;
};

function date(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: timezone }).format(
    new Date(value),
  );
}

export function SubscriptionPanel(props: Props) {
  const { state, canManage, keysEnabled, accountOwner, users, redemptions, timezone } = props;
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // setutechnology.com's "Redeem" button links here with #key=…; the key stays
  // after the #, which browsers never send to a server.
  const prefill = useSyncExternalStore(subscribeHash, readHashKey, () => "");
  const seatHolders = users.filter((u) => u.hasSeat && u.status !== "Inactive").length;
  const seats = state.seats ?? INCLUDED_USERS;
  const salesHref = `mailto:${props.salesEmail}?subject=${encodeURIComponent(
    `More Setu Workflow users — ${props.firmName}`,
  )}&body=${encodeURIComponent(
    `Firm: ${props.firmName}\nUsers needed: \nPlease send a quote for additional users.`,
  )}`;

  const status = state.licensed
    ? `Active · ${state.licenseDaysRemaining} day${state.licenseDaysRemaining === 1 ? "" : "s"} left`
    : state.lapsed
      ? "Ended"
      : state.plan === "trial"
        ? state.expired
          ? "Trial ended"
          : "Free trial"
        : "Ongoing access";

  async function toggle(user: SeatUser) {
    setBusy(user.id);
    setNotice("");
    try {
      const result = await post(`/api/subscription/seats/${user.id}`, { hasSeat: !user.hasSeat });
      setNotice(result.message ?? "Saved.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="subscription">
      <section className="card subscription-status">
        <div>
          <p className="eyebrow">YOUR PLAN</p>
          <h2>
            Setu Workflow <span className={`status ${state.licensed ? "active" : "invited"}`}>{status}</span>
          </h2>
          <p className="muted">
            {state.licensed && state.licenseEndsAt
              ? `Paid through ${date(state.licenseEndsAt, timezone)} for ${state.seats} users.`
              : state.lapsed && state.licenseEndsAt
                ? `Your subscription ended on ${date(state.licenseEndsAt, timezone)}. Your data is safe; redeem a key to start editing again.`
                : state.plan === "trial"
                  ? state.endsAt
                    ? `Your trial ${state.expired ? "ended" : "ends"} on ${date(state.endsAt, timezone)}. Days on a key you redeem now are added after it.`
                    : "Your trial starts when your administrator activates their account."
                  : "Your firm has ongoing access."}
          </p>
        </div>
        <dl className="subscription-facts">
          <div>
            <dt>Users with access</dt>
            <dd>
              <strong>{seatHolders}</strong>
              {state.licensed ? ` of ${state.seats}` : ""}
            </dd>
          </div>
          <div>
            <dt>Account owner</dt>
            <dd>{accountOwner ? accountOwner.name : "—"}</dd>
          </div>
        </dl>
      </section>

      {state.overSeats && (
        <p className="notice error" role="alert">
          {seatHolders} people have access but your plan covers {state.seats}. Your workspace is
          read-only until {canManage ? "you remove" : "your account owner removes"} access from{" "}
          {seatHolders - (state.seats ?? 0)}.
        </p>
      )}

      <div className="subscription-grid">
        <section className="card subscription-card">
          <span className="icon-tile">
            <KeyRound size={20} />
          </span>
          <h2>Redeem a license key</h2>
          {canManage ? (
            keysEnabled ? (
              <>
                <p className="muted small">
                  Paste the key from your Setu purchase email. Days are added after your current
                  plan or trial ends, or from today if it already has.
                </p>
                <MutationForm
                  endpoint="/api/subscription/redeem"
                  label="Redeem key"
                  onSaved={() => setNotice("")}
                >
                  <Field label="License key">
                    <input
                      key={prefill}
                      defaultValue={prefill}
                      name="key"
                      required
                      maxLength={200}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="SETUWF-XXXXXX-XXXXXX-…"
                      className="license-input"
                    />
                  </Field>
                </MutationForm>
              </>
            ) : (
              <p className="muted small">
                Online license keys are not switched on for this workspace yet. Contact Setu to
                activate your plan.
              </p>
            )
          ) : (
            <p className="muted small">
              Only your firm&rsquo;s account owner{accountOwner ? ` (${accountOwner.name})` : ""} can
              redeem keys and choose who has access.
            </p>
          )}
          <a className="button secondary" href={BUY_URL} target="_blank" rel="noopener noreferrer">
            Buy a key on setutechnology.com
          </a>
        </section>

        <section className="card subscription-card">
          <span className="icon-tile">
            <ShieldCheck size={20} />
          </span>
          <h2>Pricing</h2>
          <p className="muted small">Each plan includes {INCLUDED_USERS} users.</p>
          <table className="price-table">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">India</th>
                <th scope="col">Global</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Monthly</td>
                <td>{formatPlanPrice(PLAN_PRICES.IN.monthly, "INR")}</td>
                <td>{formatPlanPrice(PLAN_PRICES.INTL.monthly, "USD")}</td>
              </tr>
              <tr>
                <td>Yearly</td>
                <td>{formatPlanPrice(PLAN_PRICES.IN.yearly, "INR")}</td>
                <td>{formatPlanPrice(PLAN_PRICES.INTL.yearly, "USD")}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">
            Need more than {INCLUDED_USERS} users? Additional users are{" "}
            {formatPlanPrice(EXTRA_USER_PRICE.monthly, "USD")} per user per month, arranged through
            sales.
          </p>
          <a className="button secondary" href={salesHref}>
            Contact sales
          </a>
        </section>
      </div>

      <section className="card table-card">
        <div className="table-toolbar">
          <div>
            <h2>Who has access</h2>
            <p className="muted small">
              {state.licensed
                ? `Your plan covers ${state.seats} users. Removing access signs that person out; their work stays.`
                : `When your plan starts it covers ${seats} users. During a trial everyone you invite has access.`}
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Account</th>
                <th scope="col">Access</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="person-cell">
                      <span className="avatar">
                        {u.firstName[0]}
                        {u.lastName[0]}
                      </span>
                      <div>
                        <strong>
                          {u.firstName} {u.lastName}
                          {u.id === props.ownId && <span className="you">You</span>}
                          {u.isAccountOwner && <span className="account-owner">Account owner</span>}
                        </strong>
                        <small>{u.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{u.role.roleName}</td>
                  <td>
                    <span className={`status ${u.status.toLowerCase()}`}>{u.status}</span>
                  </td>
                  <td>
                    <span className={`status ${u.hasSeat ? "active" : ""}`}>
                      {u.hasSeat ? "Has access" : "No access"}
                    </span>
                  </td>
                  <td>
                    {canManage && !u.isAccountOwner && (
                      <button
                        className="button secondary seat-button"
                        disabled={busy === u.id}
                        onClick={() => toggle(u)}
                      >
                        {u.hasSeat ? <UserMinus size={16} /> : <UserCheck size={16} />}
                        {u.hasSeat ? "Remove access" : "Give access"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          {seatHolders} with access{state.licensed ? ` · ${state.seats} on your plan` : ""}
        </div>
      </section>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {redemptions.length > 0 && (
        <section className="card table-card">
          <div className="table-toolbar">
            <h2>Keys redeemed</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Redeemed</th>
                  <th scope="col">Added</th>
                  <th scope="col">Users</th>
                  <th scope="col">Paid through</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.id}>
                    <td>{date(r.createdAt, timezone)}</td>
                    <td>{r.days} days</td>
                    <td>{r.seats}</td>
                    <td>{r.newExpiresAt ? date(r.newExpiresAt, timezone) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
