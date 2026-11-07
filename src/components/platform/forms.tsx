"use client";
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, LogOut, X } from "lucide-react";
import { post } from "@/components/form";
import { EXTRA_USER_PRICE, INCLUDED_USERS, PLAN_PRICES, formatPlanPrice } from "@/lib/plans";

type Result = { message?: string; [key: string]: unknown };

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function run(url: string, data: unknown, after?: (r: Result) => void) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = (await post(url, data)) as Result;
      setMessage(result.message ?? "Done.");
      after?.(result);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, message, run, setMessage };
}

function Feedback({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
    </>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

// ----- Sign-in ---------------------------------------------------------------

type Step = { step: "setup"; token: string; secret: string; qr: string } | { step: "code"; token: string };

/** Email + password, then link an authenticator app (first time) or enter its code. */
export function ConsoleLogin({ secret }: { secret: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (!step) {
        const next = (await post("/api/platform/login", {
          routeSecret: secret,
          email: form.get("email"),
          password: form.get("password"),
        })) as unknown as Step;
        setStep(next);
        setBusy(false);
        return;
      }
      await post(step.step === "setup" ? "/api/platform/setup-2fa" : "/api/platform/verify", {
        token: step.token,
        code: form.get("code"),
      });
      router.replace(`/console/${secret}`);
      router.refresh();
    } catch (e) {
      const text = e instanceof Error ? e.message : "Sign-in failed.";
      setError(text);
      if (/too long|Sign in again/.test(text)) setStep(null);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="console-signin">
      {!step && (
        <>
          <Field label="Email">
            <input name="email" type="email" required autoComplete="username" autoFocus />
          </Field>
          <Field label="Password">
            <input name="password" type="password" required autoComplete="current-password" />
          </Field>
        </>
      )}
      {step?.step === "setup" && (
        <div className="totp-setup">
          <p className="small">
            <strong>Link an authenticator app.</strong> Scan this with Google Authenticator, Microsoft
            Authenticator, 1Password or similar, then enter the 6-digit code it shows.
          </p>
          <div className="totp-qr" dangerouslySetInnerHTML={{ __html: step.qr }} />
          <p className="muted small">
            Can&rsquo;t scan? Enter this key: <code>{step.secret.match(/.{1,4}/g)?.join(" ")}</code>
          </p>
        </div>
      )}
      {step && (
        <Field label="6-digit code">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
        </Field>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary wide" disabled={busy}>
        {busy ? "Please wait…" : step ? "Verify" : "Continue"}
      </button>
      {step && (
        <button type="button" className="text-button wide" onClick={() => setStep(null)}>
          Start again
        </button>
      )}
    </form>
  );
}

const subscribeHash = (callback: () => void) => {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
};
const readHash = () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";

/** Invite / reset link: set a password. */
export function AcceptInvite({ secret }: { secret: string }) {
  const token = useSyncExternalStore(subscribeHash, readHash, () => null);
  const [who, setWho] = useState<{ name: string; email: string } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (token === null) return;
    post("/api/platform/invite-details", { token })
      .then((r) => setWho(r as unknown as { name: string; email: string }))
      .catch((e) => setError(e instanceof Error ? e.message : "This link is not valid."));
  }, [token]);
  if (done)
    return (
      <>
        <p className="notice success">Password saved.</p>
        <Link className="button primary wide" href={`/console/${secret}/login`}>
          Sign in
        </Link>
      </>
    );
  if (error && !who) return <p className="notice error">{error}</p>;
  if (!who) return <p className="muted">Checking your link…</p>;
  return (
    <form
      className="console-signin"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setError("");
        try {
          await post("/api/platform/accept", {
            token,
            password: form.get("password"),
            confirmPassword: form.get("confirmPassword"),
          });
          setDone(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="small">
        Welcome, <strong>{who.name}</strong> ({who.email}). Choose a password of at least 12 characters.
      </p>
      <Field label="New password">
        <input name="password" type="password" minLength={12} required autoComplete="new-password" />
      </Field>
      <Field label="Confirm password">
        <input name="confirmPassword" type="password" minLength={12} required autoComplete="new-password" />
      </Field>
      {error && <p className="notice error">{error}</p>}
      <button className="button primary wide" disabled={busy}>
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

export function ConsoleLogout({ base }: { base: string }) {
  const router = useRouter();
  return (
    <button
      className="console-signout"
      onClick={async () => {
        await post("/api/platform/logout", {}).catch(() => undefined);
        router.replace(`${base}/login`);
      }}
    >
      <LogOut size={16} /> Sign out
    </button>
  );
}

// ----- Keys ------------------------------------------------------------------

function KeyResult({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="issued-key">
      <code>{value}</code>
      <button
        type="button"
        className="button secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setCopied(true);
        }}
      >
        <Copy size={15} />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Contact-sales key for one firm: a plan (new / renewal / bigger) or additional users. */
export function IssueKeyForm({ firm, planRunning }: { firm: { id: string; name: string }; planRunning: boolean }) {
  const { busy, error, message, run } = useAction();
  const [kind, setKind] = useState<"plan" | "addon">(planRunning ? "addon" : "plan");
  const [billing, setBilling] = useState<"monthly" | "yearly" | "custom">("yearly");
  const [seats, setSeats] = useState(planRunning ? 1 : INCLUDED_USERS);
  const [key, setKey] = useState("");
  const months = billing === "yearly" ? 12 : 1;
  const extra = kind === "plan" ? Math.max(0, seats - INCLUDED_USERS) : seats;
  const suggestion =
    kind === "plan"
      ? billing === "custom"
        ? `${INCLUDED_USERS} users included; extra users ${formatPlanPrice(EXTRA_USER_PRICE.monthly, "USD")} each per month.`
        : `List price ${formatPlanPrice(PLAN_PRICES.IN[billing], "INR")} / ${formatPlanPrice(PLAN_PRICES.INTL[billing], "USD")}` +
          (extra > 0
            ? ` + ${extra} extra × ${formatPlanPrice(EXTRA_USER_PRICE.monthly, "USD")} × ${months} mo = ${formatPlanPrice(extra * EXTRA_USER_PRICE.monthly * months, "USD")}`
            : "")
      : `${formatPlanPrice(EXTRA_USER_PRICE.monthly, "USD")} per user per month for the rest of the plan.`;

  return (
    <form
      className="issue-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setKey("");
        run(
          "/api/platform/keys",
          {
            kind,
            billing,
            days: form.get("days") ?? undefined,
            seats,
            orderRef: form.get("orderRef"),
            amount: form.get("amount"),
            currency: form.get("currency"),
            note: form.get("note") ?? "",
            firmId: firm.id,
            applyNow: form.get("applyNow") === "on",
          },
          (result) => setKey(typeof result.key === "string" ? result.key : ""),
        );
      }}
    >
      <div className="segmented" role="radiogroup" aria-label="Key type">
        {(["plan", "addon"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            className={kind === k ? "on" : ""}
            onClick={() => {
              setKind(k);
              setSeats(k === "plan" ? INCLUDED_USERS : 1);
            }}
          >
            {k === "plan" ? "Plan (new, renewal, bigger)" : "Additional users"}
          </button>
        ))}
      </div>
      {kind === "addon" && !planRunning && (
        <p className="notice">This firm has no running plan. Additional users can only be added to one.</p>
      )}
      <div className="form-grid">
        {kind === "plan" && (
          <Field label="Period">
            <select value={billing} onChange={(e) => setBilling(e.target.value as typeof billing)}>
              <option value="monthly">Monthly (30 days)</option>
              <option value="yearly">Yearly (365 days)</option>
              <option value="custom">Custom days</option>
            </select>
          </Field>
        )}
        {kind === "plan" && billing === "custom" && (
          <Field label="Days">
            <input name="days" type="number" min={1} max={3660} required />
          </Field>
        )}
        <Field label={kind === "plan" ? "Users on the plan" : "Users to add"} hint={suggestion}>
          <input
            type="number"
            min={1}
            max={1000}
            value={seats}
            onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
            required
          />
        </Field>
        <Field label="Payment / invoice reference" hint="One key per reference, so a payment can't be used twice.">
          <input name="orderRef" required maxLength={100} placeholder="e.g. UPI 4521… or INV-2026-031" />
        </Field>
        <Field label="Amount received">
          <span className="amount">
            <select name="currency" defaultValue="INR" aria-label="Currency">
              <option>INR</option>
              <option>USD</option>
            </select>
            <input name="amount" type="number" min={0} step="0.01" />
          </span>
        </Field>
        <Field label="Note (deal, PO or invoice number)">
          <input name="note" maxLength={500} />
        </Field>
      </div>
      <label className="checkbox">
        <input type="checkbox" name="applyNow" defaultChecked />
        Apply to {firm.name} now (untick to only generate the key and send it)
      </label>
      <Feedback error={error} message={message} />
      {key && <KeyResult value={key} />}
      <div className="form-footer">
        <button className="button primary" disabled={busy}>
          <KeyRound size={16} />
          {busy ? "Working…" : "Issue key"}
        </button>
      </div>
    </form>
  );
}

export function RevealKey({ issueId }: { issueId: string }) {
  const { busy, error, run } = useAction();
  const [key, setKey] = useState("");
  if (key) return <KeyResult value={key} />;
  return (
    <>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => run(`/api/platform/keys/${issueId}/reveal`, {}, (r) => setKey(typeof r.key === "string" ? r.key : ""))}
      >
        Show key
      </button>
      {error && <small className="error-text">{error}</small>}
    </>
  );
}

// ----- Generic actions -------------------------------------------------------

/** A button that posts once, optionally after a confirm. */
export function QuickAction({
  url,
  label,
  confirm,
  danger,
  data,
}: {
  url: string;
  label: string;
  confirm?: string;
  danger?: boolean;
  data?: Record<string, unknown>;
}) {
  const { busy, error, message, run } = useAction();
  return (
    <span className="quick-action">
      <button
        className={`button ${danger ? "danger" : "secondary"}`}
        disabled={busy}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          run(url, data ?? {});
        }}
      >
        {busy ? "Working…" : label}
      </button>
      {(error || message) && <small className={error ? "error-text" : "ok-text"}>{error || message}</small>}
    </span>
  );
}

/** A button that opens a small dialog with fields, posting them on submit. */
export function DialogAction({
  label,
  title,
  url,
  children,
  submitLabel,
  danger,
  data,
  wide,
}: {
  label: string;
  title: string;
  url?: string;
  children: ReactNode;
  submitLabel?: string;
  danger?: boolean;
  data?: Record<string, unknown>;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { busy, error, message, run } = useAction();
  return (
    <>
      <button className={`button ${danger ? "danger" : "secondary"}`} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="console-modal" role="dialog" aria-modal="true" aria-label={title}>
          <div className={`card console-modal-card ${wide ? "wide" : ""}`}>
            <div className="console-modal-head">
              <h2>{title}</h2>
              <button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {url ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  run(url, { ...Object.fromEntries(new FormData(event.currentTarget).entries()), ...data });
                }}
              >
                {children}
                <Feedback error={error} message={message} />
                <div className="form-footer">
                  <button className={`button ${danger ? "danger" : "primary"}`} disabled={busy}>
                    {busy ? "Working…" : (submitLabel ?? label)}
                  </button>
                </div>
              </form>
            ) : (
              children
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function RemindAll() {
  const { busy, error, message, run } = useAction();
  return (
    <form
      className="remind-all"
      onSubmit={(event) => {
        event.preventDefault();
        const days = Number(new FormData(event.currentTarget).get("days"));
        if (!window.confirm(`Email every owner whose plan ends within ${days} days? Anyone reminded in the last 24 hours is skipped.`)) return;
        run("/api/platform/remind-all", { days });
      }}
    >
      <Feedback error={error} message={message} />
      <div className="console-action-row">
        <Field label="Ending within (days)">
          <input name="days" type="number" min={1} max={60} defaultValue={14} required />
        </Field>
        <button className="button secondary" disabled={busy}>
          {busy ? "Sending…" : "Remind them now"}
        </button>
      </div>
    </form>
  );
}

export function InviteStaff() {
  const { busy, error, message, run } = useAction();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formEl = event.currentTarget;
        const form = new FormData(formEl);
        run("/api/platform/team", { name: form.get("name"), email: form.get("email") }, () => formEl.reset());
      }}
    >
      <div className="console-action-row invite-row">
        <Field label="Name">
          <input name="name" required maxLength={100} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required maxLength={254} />
        </Field>
        <button className="button primary" disabled={busy}>
          {busy ? "Sending…" : "Send invite"}
        </button>
      </div>
      <Feedback error={error} message={message} />
    </form>
  );
}

/** Filters that navigate on change (activity page). */
export function FilterSelect({ name, value, options, label }: { name: string; value: string; options: [string, string][]; label: string }) {
  const router = useRouter();
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => {
          const params = new URLSearchParams(window.location.search);
          if (e.target.value) params.set(name, e.target.value);
          else params.delete(name);
          router.push(`?${params.toString()}`);
        }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}
