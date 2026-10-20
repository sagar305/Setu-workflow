"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { trialState } from "@/lib/trial";
const ReadOnly = createContext(false);
export const useTrialReadOnly = () => useContext(ReadOnly);
export function TrialAccess({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: ReactNode;
}) {
  return <ReadOnly.Provider value={readOnly}>{children}</ReadOnly.Provider>;
}
export function TrialBanner({
  state,
}: {
  state: ReturnType<typeof trialState>;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!state.isTrial || state.readOnly || !state.endsAt) return;
    const remaining = new Date(state.endsAt).getTime() - Date.now();
    const timer = setTimeout(
      () => router.refresh(),
      Math.min(Math.max(remaining + 100, 1000), 2147483647),
    );
    return () => clearTimeout(timer);
  }, [state.isTrial, state.readOnly, state.endsAt, router]);
  if (!state.isTrial) return null;
  return (
    <aside className="notice" aria-label="Firm trial">
      <strong>
        {state.expired
          ? "Your 15-day trial has ended."
          : state.pending
            ? "Your trial is awaiting activation."
            : `15-day firm trial · ${state.daysRemaining} day${state.daysRemaining === 1 ? "" : "s"} remaining.`}
      </strong>{" "}
      {state.readOnly
        ? "Your data is preserved. You can view and export permitted records, but cannot make changes. "
        : "Explore your workspace and invite your team. "}
      <Link href="/trial">Trial details / Contact us to continue</Link>
    </aside>
  );
}
