"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Download, Upload, SlidersHorizontal } from "lucide-react";
import { CLIENT_STATUSES, statusLabel } from "@/lib/client-constants";
import { Field, post } from "@/components/form";
import type { ClientList, ClientOptions, Rights } from "./types";
const columns = [
  "Client Code",
  "Client Name",
  "Entity Type",
  "Service Lines",
  "Partner",
  "Manager",
  "Office",
  "Status",
  "Industry",
  "Onboarding Date",
  "Year End",
  "Primary Contact",
  "Created Date",
  "Updated Date",
];
const initialColumns = columns.slice(0, 8);
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("setu-columns", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("setu-columns", cb);
  };
};
export function ClientListPanel({
  data,
  options,
  rights,
  userId,
}: {
  data: ClientList;
  options: ClientOptions;
  rights: Rights;
  userId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [field, setField] = useState("status");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const saved = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(`setu.client-columns.${userId}`);
      } catch {
        return null;
      }
    },
    () => null,
  );
  let visible: string[] = initialColumns;
  try {
    const parsed = JSON.parse(saved ?? "null");
    if (Array.isArray(parsed))
      visible = [
        ...new Set([
          "Client Name",
          ...parsed.filter((c) => columns.includes(c)),
        ]),
      ];
  } catch {
    /* Use accessible defaults for a damaged preference. */
  }
  const toggle = (column: string) => {
    try {
      localStorage.setItem(
        `setu.client-columns.${userId}`,
        JSON.stringify(
          visible.includes(column)
            ? visible.filter((c) => c !== column)
            : [...visible, column],
        ),
      );
      window.dispatchEvent(new Event("setu-columns"));
    } catch {
      setMessage("Column preferences could not be saved in this browser.");
    }
  };
  const query = (page?: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(data.filters))
      if (v !== null && v !== "") q.set(k, String(v));
    if (page) q.set("page", String(page));
    return q.toString();
  };
  const cell = (c: ClientList["items"][number], column: string) => {
    switch (column) {
      case "Client Code":
        return <span className="client-code">{c.clientCode}</span>;
      case "Client Name":
        return (
          <Link className="client-name" href={`/clients/${c.id}`}>
            {c.displayName}
            <small>
              {c.legalName !== c.displayName ? c.legalName : c.industry || "—"}
            </small>
          </Link>
        );
      case "Entity Type":
        return c.entityType.name;
      case "Service Lines":
        return (
          <div className="client-tags">
            {c.services.slice(0, 2).map((s) => (
              <span className="pill" key={s.serviceLineId}>
                {s.serviceLine.name}
              </span>
            ))}
            {c.services.length > 2 && (
              <span
                title={c.services.map((s) => s.serviceLine.name).join(", ")}
              >
                +{c.services.length - 2}
              </span>
            )}
          </div>
        );
      case "Partner":
        return c.responsiblePartner
          ? `${c.responsiblePartner.firstName} ${c.responsiblePartner.lastName}`
          : "—";
      case "Manager":
        return c.responsibleManager
          ? `${c.responsibleManager.firstName} ${c.responsibleManager.lastName}`
          : "—";
      case "Office":
        return c.primaryOffice.officeName;
      case "Status":
        return (
          <span className={`status ${c.status.toLowerCase()}`}>
            {statusLabel(c.status)}
          </span>
        );
      case "Industry":
        return c.industry || "—";
      case "Onboarding Date":
        return c.onboardingDate?.slice(0, 10) ?? "—";
      case "Year End":
        return c.taxYearEndMonth
          ? `${c.taxYearEndMonth}/${c.taxYearEndDay}`
          : "—";
      case "Primary Contact":
        return c.contacts[0]
          ? `${c.contacts[0].firstName} ${c.contacts[0].lastName}`
          : "—";
      case "Created Date":
        return c.createdAt.slice(0, 10);
      case "Updated Date":
        return c.updatedAt.slice(0, 10);
    }
  };
  return (
    <>
      <div className="page-heading client-heading">
        <div>
          <p className="eyebrow">CLIENT MASTER</p>
          <h1>Clients</h1>
          <p className="muted">Your firm’s relationships, in one place.</p>
        </div>
        <div className="actions">
          {rights.configure || rights.fields ? (
            <Link className="button secondary" href="/clients/settings">
              Client settings
            </Link>
          ) : null}
          {rights.import && (
            <Link className="button secondary" href="/clients/import">
              <Upload size={16} />
              Import Clients
            </Link>
          )}
          {rights.create && (
            <Link className="button primary" href="/clients/new">
              <Plus size={17} />
              New Client
            </Link>
          )}
        </div>
      </div>
      <div className="client-stats">
        {[
          [
            "Total Clients",
            Object.values(data.stats).reduce((a, b) => a + b, 0),
          ],
          ["Active", data.stats.Active ?? 0],
          ["Onboarding", data.stats.Onboarding ?? 0],
          ["On Hold", data.stats.OnHold ?? 0],
          ["Inactive", data.stats.Inactive ?? 0],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="card client-filters">
        <form action="/clients">
          <Field label="Search clients">
            <input
              name="q"
              defaultValue={data.filters.q}
              placeholder="Client code or name"
            />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={data.filters.status}>
              <option value="">All statuses</option>
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entity Type">
            <select
              name="entityTypeId"
              defaultValue={data.filters.entityTypeId ?? ""}
            >
              <option value="">All types</option>
              {options.entityTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Service Line">
            <select
              name="serviceLineId"
              defaultValue={data.filters.serviceLineId ?? ""}
            >
              <option value="">All services</option>
              {options.serviceLines.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Office">
            <select name="officeId" defaultValue={data.filters.officeId ?? ""}>
              <option value="">All offices</option>
              {options.offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.officeName}
                </option>
              ))}
            </select>
          </Field>
          {[
            ["partnerId", "Partner"],
            ["managerId", "Manager"],
          ].map(([key, label]) => (
            <Field label={label} key={key}>
              <select
                name={key}
                defaultValue={data.filters[key as "partnerId"] ?? ""}
              >
                <option value="">All {label.toLowerCase()}s</option>
                {options.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="Sort by">
            <select name="sort" defaultValue={data.filters.sort}>
              {[
                ["displayName", "Client name"],
                ["clientCode", "Client code"],
                ["legalName", "Legal name"],
                ["status", "Status"],
                ["createdAt", "Created date"],
                ["updatedAt", "Updated date"],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Order">
            <select name="direction" defaultValue={data.filters.direction}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </Field>
          <Field label="Rows per page">
            <select name="pageSize" defaultValue={data.filters.pageSize}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <div className="filter-actions">
            <button className="button primary">Apply filters</button>
            <Link href="/clients" className="button secondary">
              Clear
            </Link>
          </div>
        </form>
      </section>
      <section className="card table-card">
        <div className="table-toolbar">
          <strong>{data.total} matching clients</strong>
          <div className="actions">
            <details className="column-picker">
              <summary className="button secondary">
                <SlidersHorizontal size={15} />
                Customize Columns
              </summary>
              <div className="column-options">
                {columns.map((c) => (
                  <label className="checkbox" key={c}>
                    <input
                      type="checkbox"
                      checked={visible.includes(c)}
                      disabled={c === "Client Name"}
                      onChange={() => toggle(c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </details>
            {rights.export && (
              <a
                className="button secondary"
                href={`/api/clients/export?${query()}`}
              >
                <Download size={16} />
                Export CSV
              </a>
            )}
          </div>
        </div>
        <div className="table-scroll">
          <table className="client-table">
            <thead>
              <tr>
                {rights.edit && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all clients on this page"
                      checked={
                        !!data.items.length &&
                        selected.length === data.items.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? data.items.map((c) => c.id) : [],
                        )
                      }
                    />
                  </th>
                )}
                {columns
                  .filter((c) => visible.includes(c))
                  .map((c) => (
                    <th key={c}>{c}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id}>
                  {rights.edit && (
                    <td>
                      <input
                        aria-label={`Select ${c.clientCode}`}
                        type="checkbox"
                        checked={selected.includes(c.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, c.id]
                              : selected.filter((id) => id !== c.id),
                          )
                        }
                      />
                    </td>
                  )}
                  {columns
                    .filter((col) => visible.includes(col))
                    .map((col) => (
                      <td key={col}>{cell(c, col)}</td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!data.items.length && (
            <div className="client-empty">
              <h2>No clients found</h2>
              <p className="muted">
                Adjust your filters or add your first client.
              </p>
            </div>
          )}
        </div>
        <div className="table-footer pagination">
          <span>
            Page {data.filters.page} of{" "}
            {Math.max(1, Math.ceil(data.total / data.filters.pageSize))}
          </span>
          <div className="actions">
            {data.filters.page > 1 && (
              <Link
                className="button secondary"
                href={`/clients?${query(data.filters.page - 1)}`}
              >
                Previous
              </Link>
            )}
            {data.filters.page * data.filters.pageSize < data.total && (
              <Link
                className="button secondary"
                href={`/clients?${query(data.filters.page + 1)}`}
              >
                Next
              </Link>
            )}
          </div>
        </div>
      </section>
      {selected.length > 0 && rights.edit && (
        <section className="card bulk-panel">
          <h2>Update {selected.length} selected clients</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              const form = new FormData(e.currentTarget);
              try {
                const result = await post("/api/clients/bulk", {
                  ids: selected,
                  field,
                  value: form.get("value") || null,
                  confirmed: form.has("confirmed"),
                });
                setMessage(result.message ?? "Updated.");
                setSelected([]);
                router.refresh();
              } catch (err) {
                setMessage(
                  err instanceof Error ? err.message : "Update failed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <Field label="Change field">
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                >
                  <option value="status">Status</option>
                  <option value="responsibleManagerId">Manager</option>
                  <option value="responsiblePartnerId">Partner</option>
                  <option value="primaryOfficeId">Office</option>
                </select>
              </Field>
              <Field label="New value">
                <select name="value" key={field}>
                  {field === "status" ? (
                    CLIENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))
                  ) : field === "primaryOfficeId" ? (
                    options.offices
                      .filter((o) => o.active)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.officeName}
                        </option>
                      ))
                  ) : (
                    <>
                      <option value="">Not assigned</option>
                      {options.users
                        .filter((u) => u.status === "Active")
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName}
                          </option>
                        ))}
                    </>
                  )}
                </select>
              </Field>
            </div>
            <label className="checkbox">
              <input type="checkbox" name="confirmed" required />I confirm this
              change for the {selected.length} selected clients.
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "Applying…" : "Apply bulk change"}
            </button>
          </form>
        </section>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </>
  );
}
