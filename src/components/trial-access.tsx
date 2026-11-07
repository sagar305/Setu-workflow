"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccessState } from "@/lib/trial";
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
export function TrialBanner({ state }: { state: AccessState }) {
  const router = useRouter();
  // Refresh when access ends, so the read-only state shows without a reload.
  const endsAt = state.licensed ? state.licenseEndsAt : state.isTrial ? state.endsAt : null;
  useEffect(() => {
    if (state.readOnly || !endsAt) return;
    const remaining = new Date(endsAt).getTime() - Date.now();
    const timer = setTimeout(
      () => router.refresh(),
      Math.min(Math.max(remaining + 100, 1000), 2147483647),
    );
    return () => clearTimeout(timer);
  }, [state.readOnly, endsAt, router]);
  if (state.licensed) {
    if (state.overSeats)
      return (
        <aside className="notice error" aria-label="Subscription">
          <strong>More people have access than your plan&rsquo;s {state.seats} users.</strong>{" "}
          The workspace is read-only until access is removed from {(state.seatsInUse ?? 0) - (state.seats ?? 0)}.{" "}
          <Link href="/admin/subscription">Manage access</Link>
        </aside>
      );
    // Only nag in the last week.
    if ((state.licenseDaysRemaining ?? 99) > 7) return null;
    return (
      <aside className="notice" aria-label="Subscription">
        <strong>
          Your Setu Workflow plan ends in {state.licenseDaysRemaining} day
          {state.licenseDaysRemaining === 1 ? "" : "s"}.
        </strong>{" "}
        <Link href="/admin/subscription">Renew with a license key</Link>
      </aside>
    );
  }
  if (state.lapsed)
    return (
      <aside className="notice error" aria-label="Subscription">
        <strong>Your Setu Workflow subscription has ended.</strong> Your data is preserved. You can
        view and export permitted records, but cannot make changes.{" "}
        <Link href="/admin/subscription">Renew with a license key</Link>
      </aside>
    );
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
      <Link href="/admin/subscription">Buy a plan</Link> ·{" "}
      <Link href="/trial">Trial details</Link>
    </aside>
  );
}
