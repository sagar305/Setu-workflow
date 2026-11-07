import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { ConsoleLogout } from "./forms";

const NAV = [
  ["dashboard", "Dashboard", ""],
  ["accounts", "Accounts", "/accounts"],
  ["keys", "Keys", "/keys"],
  ["activity", "Activity", "/activity"],
  ["team", "Team", "/team"],
] as const;
export type ConsoleTab = (typeof NAV)[number][0];

/** The Setu team's area: a dark header so it never looks like a firm's screens. */
export function ConsoleShell({
  base,
  admin,
  current,
  title,
  description,
  children,
}: {
  base: string;
  admin: { name: string };
  current: ConsoleTab;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="console-bar">
        <div className="console-bar-top">
          <span className="console-mark">
            <LogoMark size={20} />
          </span>
          <span className="console-title">
            Setu Workflow <span>Admin</span>
          </span>
          <span className="console-who">{admin.name}</span>
          <ConsoleLogout base={base} />
        </div>
        <nav aria-label="Admin">
          {NAV.map(([key, label, path]) => (
            <Link
              key={key}
              href={`${base}${path}`}
              className={current === key ? "active" : ""}
              aria-current={current === key ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="console-main">
        <div className="console-heading">
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
        {children}
      </main>
    </>
  );
}

export function Stat({ label, value, href, active }: { label: string; value: number | string; href?: string; active?: boolean }) {
  const body = (
    <>
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</strong>
    </>
  );
  return href ? (
    <Link href={href} className={`card console-stat link ${active ? "active" : ""}`}>
      {body}
    </Link>
  ) : (
    <div className="card console-stat">{body}</div>
  );
}

export function Section({ title, empty, children, action }: { title: string; empty?: boolean; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card console-section">
      <div className="console-section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {empty ? <p className="muted">None yet.</p> : children}
    </section>
  );
}
