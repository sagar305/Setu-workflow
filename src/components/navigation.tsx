"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  BriefcaseBusiness,
  Building2,
  Users,
  Layers,
  ChartNoAxesCombined,
  Settings2,
  PanelLeftClose,
  Menu,
} from "lucide-react";
import { useState } from "react";
const items = [
  ["Dashboard", "/dashboard", LayoutDashboard],
  ["My Work", "/my-work", CheckSquare],
  ["My Time", "/my-time", CheckSquare],
  ["Engagements", "/engagements", BriefcaseBusiness],
  ["Clients", "/clients", Building2],
  ["Team", "/team", Users],
  ["Templates", "/templates", Layers],
  ["Reports", "/reports", ChartNoAxesCombined],
] as const;
export function Navigation({ adminHref, assignments = false, time = false, capacity = false, reports = false }: { adminHref?: string; assignments?: boolean; time?: boolean; capacity?: boolean; reports?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="mobile-menu"
        aria-label="Toggle navigation"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Menu size={20} />
      </button>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">s</span>
          <span>
            setu<span className="brand-sub">WORKFLOW</span>
          </span>
        </Link>
        <div className="workspace-label">
          FIRM WORKSPACE <PanelLeftClose size={15} />
        </div>
        <nav aria-label="Main navigation">
          {items.filter(([,href]) => (href !== "/my-time" || time) && (href !== "/reports" || reports) && (href !== "/team" || capacity || assignments)).map(([label, href, Icon]) => (
            <Link
              key={href}
              href={href === "/team" && capacity ? "/team/capacity" : href === "/team" && assignments ? "/team/assignments" : href}
              onClick={() => setOpen(false)}
              className={
                pathname === href || pathname.startsWith(href + "/")
                  ? "nav-link selected"
                  : "nav-link"
              }
              aria-current={
                pathname === href || pathname.startsWith(href + "/")
                  ? "page"
                  : undefined
              }
            >
              <Icon size={19} />
              {href === "/team" && capacity ? "Team Capacity" : label}
            </Link>
          ))}
          {adminHref && (
            <div className="nav-admin">
              <Link
                href={adminHref}
                className={`nav-link ${pathname.startsWith("/admin") ? "selected" : ""}`}
                onClick={() => setOpen(false)}
              >
                <Settings2 size={19} />
                Admin
              </Link>
            </div>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="foundation-tag">SETU V1</span>
          <p>Your firm. Your work.</p>
          <small>Setu Workflow</small>
        </div>
      </aside>
    </>
  );
}
