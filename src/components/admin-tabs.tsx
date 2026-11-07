import Link from "next/link";
import { hasPermission, type Principal } from "@/lib/auth";
import { sectionPermission, type Section } from "@/lib/admin";
import { canViewSubscription } from "@/lib/subscription";

export const adminTitles = {
  users: "Users",
  offices: "Offices",
  roles: "Roles",
  firm: "Firm Settings",
} as const satisfies Record<Section, string>;

export function AdminTabs({ user, current }: { user: Principal; current: Section | "subscription" }) {
  const tabs: [string, string][] = (Object.keys(adminTitles) as Section[])
    .filter((s) => hasPermission(user, sectionPermission[s]))
    .map((s) => [s, adminTitles[s]]);
  if (canViewSubscription(user)) tabs.push(["subscription", "Subscription"]);
  return (
    <nav className="tabs" aria-label="Administration">
      {tabs.map(([key, label]) => (
        <Link
          key={key}
          href={`/admin/${key}`}
          className={key === current ? "active" : ""}
          aria-current={key === current ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
