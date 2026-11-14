"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "./form";

function countdown(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}

/**
 * "Demo data resets in 3h 12m". The deadline comes from the server and only
 * the time elapsed since the page rendered is measured locally, so a visitor
 * whose device clock is wrong still sees the right countdown.
 */
export function DemoBanner({ next, serverNow, hours }: { next: string; serverNow: string; hours: number }) {
  const [left, setLeft] = useState(() => new Date(next).getTime() - new Date(serverNow).getTime());
  useEffect(() => {
    const renderedAt = Date.now();
    const initial = new Date(next).getTime() - new Date(serverNow).getTime();
    const tick = () => setLeft(initial - (Date.now() - renderedAt));
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [next, serverNow]);
  return (
    <aside className="notice demo-banner" aria-label="Demo">
      <strong>This is a demo workspace.</strong>{" "}
      {left > 0
        ? <>Everything here is reset to the sample data every {hours} hours — the next reset is in about <strong>{countdown(left)}</strong>, and you&rsquo;ll be signed out when it runs.</>
        : <>The sample data is being restored now. You may be signed out for a minute.</>}
    </aside>
  );
}

/** One-click sign-in to each shared demo account. The password is public on purpose. */
export function DemoLogin({ firms, password, hours, signupUrl }: { firms: { firm: string; accounts: string[] }[]; password: string; hours: number; signupUrl?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const signIn = async (email: string) => {
    setBusy(email);
    setError("");
    try {
      await post("/api/auth/login", { email, password });
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setBusy("");
    }
  };
  const [first] = firms;
  return (
    <section className="notice demo-login" aria-label="Demo accounts">
      <strong>This is a demo — pick a role to look around.</strong>
      <p className="small">
        Sample data resets every {hours} hours. Every account uses the password <code>{password}</code>.
      </p>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="demo-accounts">
        {first.accounts.map((email) => (
          <button key={email} type="button" className="button secondary" disabled={!!busy} onClick={() => signIn(email)}>
            {busy === email ? "Signing in…" : email.split("@")[0].replace(/^./, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>
      <details>
        <summary className="small">All demo accounts</summary>
        {firms.map(({ firm, accounts }) => (
          <p key={firm} className="small"><strong>{firm}:</strong> {accounts.join(", ")}</p>
        ))}
      </details>
      {signupUrl && (
        <p className="small demo-trial">
          Ready to use it for real? <a href={signupUrl}>Start a free 15-day trial</a> in your own private workspace.
        </p>
      )}
    </section>
  );
}
