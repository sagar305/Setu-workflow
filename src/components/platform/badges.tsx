import type { AccessState } from "@/lib/trial";

export function shortDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

export function PlanBadge({ plan, state }: { plan: string; state: AccessState }) {
  const label =
    plan === "licensed"
      ? "Paid"
      : plan === "trial"
        ? state.pending
          ? "Trial · not activated"
          : state.expired
            ? "Trial ended"
            : "Trial"
        : plan === "lapsed"
          ? "Plan ended"
          : plan === "suspended"
            ? "Locked"
            : "Ongoing";
  const tone =
    plan === "licensed" ? "active" : plan === "lapsed" || plan === "suspended" || state.expired ? "ended" : "trial";
  return <span className={`status ${tone}`}>{label}</span>;
}
