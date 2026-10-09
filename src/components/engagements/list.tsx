"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Field, post } from "@/components/form";
import { TextField } from "@/components/clients/fields";
import {
  ENGAGEMENT_STATUSES,
  PERIODS,
  PRIORITIES,
  STAFF,
  engagementLabel,
} from "@/lib/engagement-constants";
import { personName } from "./form";
import { daysInStage } from "@/lib/workflow-constants";
import type {
  EngagementList,
  EngagementOptions,
  EngagementRights,
  ClientChoice,
} from "./types";
const baseColumns = [
  "Client / Engagement",
  "Current Stage",
  "Current Owner",
  "Due Date",
  "Status",
];
const extraColumns = [
  "Client",
  "Engagement",
  "Service",
  "Owner / Preparer",
  "Manager",
  "Priority",
  "Budget Hours",
  "Days in Stage",
  "Last Move",
  "Engagement Code",
  "Office",
  "Partner",
  "Reviewer",
  "Period",
  "Allocation Date",
  "Planned Start",
  "Created Date",
  "Updated Date",
];
export function EngagementListPanel({
  data,
  options,
  rights,
  clientContext,
  userId,
}: {
  data: EngagementList;
  options: EngagementOptions;
  rights: EngagementRights;
  clientContext?: string;
  userId?: string;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(baseColumns);
  const [selected, setSelected] = useState<string[]>([]);
  const [field, setField] = useState(
    rights.assign ? "managerId" : rights.status ? "status" : "priority",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [clients, setClients] = useState<ClientChoice[]>([]);
  const [search, setSearch] = useState("");
  const f = data.filters;
  const secondaryCount = Object.entries(f).filter(
    ([key, value]) =>
      ![
        "q",
        "status",
        "workflowStage",
        "page",
        "pageSize",
        "sort",
        "direction",
      ].includes(key) &&
      !(clientContext && key === "clientId") &&
      value !== "" &&
      value != null &&
      !(key === "scope" && value === "all"),
  ).length;
  const changeResult = (name: string, value: string) => {
    const params = new URLSearchParams(query(1));
    params.set(name, value);
    router.push(`${route}?${params}`);
  };
  const query = (page?: number, scope?: string) => {
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (v !== null && v !== "") params.set(k, String(v));
    });
    if (page) params.set("page", String(page));
    if (scope) {
      params.set("scope", scope);
      params.set("page", "1");
    }
    if (clientContext) params.set("tab", "engagements");
    return params.toString();
  };
  const route = clientContext ? `/clients/${clientContext}` : "/engagements";
  const choice = (
    name: string,
    label: string,
    rows: { id: string; name: string }[],
  ) => (
    <Field label={label}>
      <select
        name={name}
        defaultValue={String(f[name as keyof typeof f] ?? "")}
      >
        <option value={name === "scope" ? "all" : ""}>All</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </Field>
  );
  const cell = (r: EngagementList["items"][number], column: string) => {
    switch (column) {
      case "Client / Engagement":
        return (
          <>
            <Link className="client-name" href={`/engagements/${r.id}`}>
              {r.engagementName}
            </Link>
            <div className="muted small">
              {rights.clientView ? (
                <Link href={`/clients/${r.client.id}`}>
                  {r.client.displayName}
                </Link>
              ) : (
                r.client.displayName
              )}
            </div>
          </>
        );
      case "Current Stage":
        return r.workflow?.currentStage?.name ?? "—";
      case "Current Owner":
        return r.workflow?.status === "Active" &&
          r.workflow.currentStage?.assignedUser
          ? `${r.workflow.currentStage.assignedUser.firstName} ${r.workflow.currentStage.assignedUser.lastName}`
          : "—";
      case "Days in Stage":
        return r.workflow?.status === "Active"
          ? daysInStage(r.workflow.currentStage?.enteredAt, data.timezone)
          : "—";
      case "Last Move": {
        const m = r.workflow?.movements[0];
        return m
          ? `${new Date(m.movedAt).toLocaleString("en-US", { timeZone: data.timezone })} · ${m.fromStage?.name ?? "Start"} → ${m.toStage.name} · ${m.movedBy.firstName} ${m.movedBy.lastName} → ${m.toUser ? m.toUser.firstName + " " + m.toUser.lastName : "Unassigned"}`
          : "—";
      }
      case "Client":
        return rights.clientView ? (
          <Link href={`/clients/${r.client.id}`}>{r.client.displayName}</Link>
        ) : (
          r.client.displayName
        );
      case "Engagement":
        return (
          <Link className="client-name" href={`/engagements/${r.id}`}>
            {r.engagementName}
          </Link>
        );
      case "Service":
        return r.serviceLine.name;
      case "Owner / Preparer":
        return personName(r.preparer);
      case "Manager":
        return personName(r.manager);
      case "Partner":
        return personName(r.partner);
      case "Reviewer":
        return personName(r.reviewer);
      case "Status":
        return (
          <span className={`status ${r.status.toLowerCase()}`}>
            {engagementLabel(r.status)}
          </span>
        );
      case "Priority":
        return (
          <span className={`priority ${r.priority.toLowerCase()}`}>
            {r.priority}
          </span>
        );
      case "Due Date":
        return (
          <>
            {r.dueDate?.slice(0, 10) ?? "—"}
            {r.overdue && <strong className="overdue-label">Overdue</strong>}
          </>
        );
      case "Budget Hours":
        return r.budgetHours === null ? "—" : `${r.budgetHours}h`;
      case "Engagement Code":
        return r.engagementCode;
      case "Office":
        return r.office.officeName;
      case "Period":
        return `${engagementLabel(r.periodType)} ${r.reportingYear ?? ""} ${r.periodStartDate?.slice(0, 10) ?? ""} ${r.periodEndDate ? "– " + r.periodEndDate.slice(0, 10) : ""}`;
      case "Allocation Date":
        return r.allocationDate?.slice(0, 10) ?? "—";
      case "Planned Start":
        return r.plannedStartDate?.slice(0, 10) ?? "—";
      case "Created Date":
        return r.createdAt.slice(0, 10);
      case "Updated Date":
        return r.updatedAt.slice(0, 10);
    }
  };
  return (
    <>
      <div className="page-heading client-heading">
        <div>
          <h1>{clientContext ? "Client Engagements" : "Engagements"}</h1>
        </div>
        <div className="actions">
          {rights.create && (
            <Link
              className="button primary"
              href={`/engagements/new${clientContext ? "?clientId=" + clientContext : ""}`}
            >
              + New Engagement
            </Link>
          )}
        </div>
      </div>
      {!clientContext && (
        <nav className="tabs" aria-label="Engagement quick views">
          {[
            {
              label: "All",
              params: {},
              active: f.scope === "all" && !f.status && !f.preparerId,
            },
            {
              label: "My Engagements",
              params: { preparerId: userId ?? "" },
              active: !!userId && f.preparerId === userId,
              title: "Engagements where you are the preparer",
            },
            {
              label: "Due Soon",
              params: { scope: "week" },
              active: f.scope === "week",
              title: "Due this week",
            },
            {
              label: "Overdue",
              params: { scope: "overdue" },
              active: f.scope === "overdue",
            },
            {
              label: "Waiting",
              params: { status: "OnHold" },
              active: f.status === "OnHold",
              title: "Engagements on hold",
            },
          ].map((view) => {
            const params = new URLSearchParams(query(1));
            params.set("scope", "all");
            params.delete("status");
            params.delete("preparerId");
            Object.entries(view.params).forEach(([key, value]) => {
              if (value) params.set(key, value);
            });
            return (
              <Link
                key={view.label}
                title={view.title}
                className={view.active ? "active" : ""}
                href={`${route}?${params}`}
              >
                {view.label}
              </Link>
            );
          })}
        </nav>
      )}
      {clientContext && (
        <nav className="tabs">
          {["active", "completed", "all"].map((scope) => (
            <Link
              key={scope}
              className={f.scope === scope ? "active" : ""}
              href={`${route}?${query(1, scope)}`}
            >
              {scope[0].toUpperCase() + scope.slice(1)}
            </Link>
          ))}
        </nav>
      )}
      <section className="card client-filter-card">
        <form action={route} id="engagement-filters">
          <input type="hidden" name="sort" value={f.sort} />
          <input type="hidden" name="direction" value={f.direction} />
          <input type="hidden" name="pageSize" value={f.pageSize} />
          {clientContext && (
            <>
              <input type="hidden" name="tab" value="engagements" />
              <input type="hidden" name="clientId" value={clientContext} />
            </>
          )}
          <div className="client-filters">
            <TextField label="Search engagements" name="q" value={f.q} />
            {choice(
              "status",
              "Status",
              ENGAGEMENT_STATUSES.map((s) => ({
                id: s,
                name: engagementLabel(s),
              })),
            )}
            {rights.workflowView && (
              <Field label="Current Stage">
                <input
                  name="workflowStage"
                  defaultValue={f.workflowStage}
                  placeholder="Exact stage name"
                />
              </Field>
            )}
            <button
              type="button"
              className="button secondary"
              aria-expanded={filtersOpen}
              aria-controls="engagement-secondary-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              Filters{secondaryCount ? ` (${secondaryCount})` : ""}
            </button>
          </div>
          <div id="engagement-secondary-filters" hidden={!filtersOpen}>
            <div className="client-filters spaced">
              {choice(
                "priority",
                "Priority",
                PRIORITIES.map((s) => ({ id: s, name: s })),
              )}
              {choice("serviceLineId", "Service Line", options.serviceLines)}
              {rights.workflowView && (
                <>
                  {choice(
                    "workflowTemplateId",
                    "Workflow Template",
                    options.workflowTemplates.map((t) => ({
                      id: t.id,
                      name: `${t.name} – V${t.versionNumber}`,
                    })),
                  )}
                  {choice(
                    "workflowOwnerId",
                    "Current Owner",
                    options.users.map((u) => ({
                      id: u.id,
                      name: personName(u),
                    })),
                  )}
                </>
              )}
              {choice("engagementTypeId", "Engagement Type", options.types)}
              {choice(
                "officeId",
                "Office",
                options.offices.map((o) => ({ id: o.id, name: o.officeName })),
              )}
              {STAFF.map((key) => (
                <div key={key}>
                  {choice(
                    key,
                    key[0].toUpperCase() + key.slice(1, -2),
                    options.users.map((u) => ({
                      id: u.id,
                      name: personName(u),
                    })),
                  )}
                </div>
              ))}
              {choice(
                "periodType",
                "Period Type",
                PERIODS.map((p) => ({ id: p, name: engagementLabel(p) })),
              )}
              <TextField
                label="Period From"
                name="periodFrom"
                type="date"
                value={f.periodFrom}
              />
              <TextField
                label="Period To"
                name="periodTo"
                type="date"
                value={f.periodTo}
              />
              <TextField
                label="Due From"
                name="dueFrom"
                type="date"
                value={f.dueFrom}
              />
              <TextField
                label="Due To"
                name="dueTo"
                type="date"
                value={f.dueTo}
              />
              {choice("recurring", "Recurring", [
                { id: "true", name: "Yes" },
                { id: "false", name: "No" },
              ])}
              {choice("scope", "Due / Lifecycle", [
                { id: "active", name: "Active" },
                { id: "completed", name: "Completed" },
                { id: "overdue", name: "Overdue" },
                { id: "week", name: "Due This Week" },
              ])}
            </div>
            {!clientContext && (
              <details className="spaced">
                <summary>Filter by Client</summary>
                <div className="eng-client-search">
                  <Field label="Find Client">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </Field>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={async () => {
                      try {
                        const response = await fetch(
                          "/api/engagements/clients?q=" +
                            encodeURIComponent(search),
                        );
                        const body = await response.json();
                        if (!response.ok) throw new Error(body.error);
                        setClients(body);
                      } catch (e) {
                        setMessage(
                          e instanceof Error ? e.message : "Search failed.",
                        );
                      }
                    }}
                  >
                    Search Clients
                  </button>
                </div>
                <Field label="Client">
                  <select name="clientId" defaultValue={f.clientId ?? ""}>
                    <option value="">All Clients</option>
                    {f.clientId &&
                      !clients.some((c) => c.id === f.clientId) && (
                        <option value={f.clientId}>Selected Client</option>
                      )}
                    {clients.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.displayName} · {c.clientCode}
                      </option>
                    ))}
                  </select>
                </Field>
              </details>
            )}
          </div>
          <div className="filter-actions">
            <button className="button primary">Apply filters</button>
            <Link
              className="button secondary"
              href={route + (clientContext ? "?tab=engagements" : "")}
            >
              Clear
            </Link>
          </div>
        </form>
      </section>
      {selected.length > 0 && (
        <section className="card bulk-panel">
          <h2>Update {selected.length} selected engagements</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              const form = new FormData(e.currentTarget);
              try {
                const result = await post("/api/engagements/bulk", {
                  ids: selected,
                  field,
                  value: form.get("value") || null,
                  allocationDate: form.get("allocationDate") || null,
                  completedDate: form.get("completedDate") || null,
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
              <Field label="Bulk action">
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                >
                  {rights.assign && (
                    <>
                      <option value="managerId">Change Manager</option>
                      <option value="preparerId">Change Preparer</option>
                    </>
                  )}
                  {rights.status && (
                    <option value="status">Change Status</option>
                  )}
                  {rights.edit && (
                    <>
                      <option value="priority">Change Priority</option>
                      <option value="dueDate">Change Due Date</option>
                    </>
                  )}
                </select>
              </Field>
              <Field label="New value">
                {field === "dueDate" ? (
                  <input name="value" type="date" />
                ) : (
                  <select name="value" key={field}>
                    {field.endsWith("Id") ? (
                      <>
                        <option value="">Not assigned</option>
                        {options.users
                          .filter((u) => u.status === "Active" && u.role.active)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {personName(u)}
                            </option>
                          ))}
                      </>
                    ) : (
                      (field === "status"
                        ? ENGAGEMENT_STATUSES
                        : PRIORITIES
                      ).map((s) => (
                        <option key={s} value={s}>
                          {engagementLabel(s)}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </Field>
              {field === "preparerId" && (
                <TextField
                  label="New Allocation Date"
                  name="allocationDate"
                  type="date"
                />
              )}
              {field === "status" && (
                <TextField
                  label="Completed Date (for Completed)"
                  name="completedDate"
                  type="date"
                />
              )}
            </div>
            <label className="checkbox">
              <input type="checkbox" name="confirmed" required />I confirm this
              change to {selected.length} engagements.
            </label>
            <button className="button primary" disabled={busy}>
              Apply bulk change
            </button>
          </form>
        </section>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <section className="card">
        <div className="table-toolbar">
          <strong>{data.total} matching engagements</strong>
          <div className="actions">
            {" "}
            <Field label="Sort by">
              <select
                name="sort"
                defaultValue={f.sort}
                onChange={(e) => changeResult("sort", e.target.value)}
              >
                {[
                  ["dueDate", "Due Date"],
                  ["engagementName", "Engagement Name"],
                  ["engagementCode", "Engagement Code"],
                  ["status", "Status"],
                  ["priority", "Priority"],
                  ["budgetHours", "Budget"],
                  ["createdAt", "Created Date"],
                  ["updatedAt", "Updated Date"],
                ].map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Order">
              <select
                name="direction"
                defaultValue={f.direction}
                onChange={(e) => changeResult("direction", e.target.value)}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </Field>
          </div>
          <div className="actions">
            <details className="column-picker">
              <summary className="button secondary">Table options</summary>
              <div>
                {(rights.configure || rights.fields) && (
                  <Link
                    className="button secondary"
                    href="/engagements/settings"
                  >
                    Engagement settings
                  </Link>
                )}
                {rights.import && (
                  <Link className="button secondary" href="/engagements/import">
                    Import Engagements
                  </Link>
                )}
                {[...baseColumns, ...extraColumns].map((c) => (
                  <label className="checkbox" key={c}>
                    <input
                      type="checkbox"
                      checked={columns.includes(c)}
                      disabled={c === "Client / Engagement"}
                      onChange={() =>
                        setColumns(
                          columns.includes(c)
                            ? columns.filter((x) => x !== c)
                            : [...columns, c],
                        )
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
            </details>
            {rights.export && (
              <a
                className="button secondary"
                href={`/api/engagements/export?${query()}`}
                download
              >
                Export CSV
              </a>
            )}
          </div>
        </div>
        <div className="table-scroll">
          <table className="engagement-table">
            <thead>
              <tr>
                {(rights.edit || rights.assign || rights.status) && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all engagements on page"
                      checked={
                        data.items.length > 0 &&
                        selected.length === data.items.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? data.items.map((r) => r.id) : [],
                        )
                      }
                    />
                  </th>
                )}
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  {(rights.edit || rights.assign || rights.status) && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.engagementCode}`}
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, r.id]
                              : selected.filter((id) => id !== r.id),
                          )
                        }
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c}>{cell(r, c)}</td>
                  ))}
                  <td>
                    <Link
                      href={`/engagements/${r.id}`}
                      aria-label={`Open ${r.engagementName}`}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.items.length && (
            <p className="empty">No engagements match these filters.</p>
          )}
        </div>
        <div className="pagination">
          {" "}
          <Field label="Rows per page">
            <select
              name="pageSize"
              defaultValue={f.pageSize}
              onChange={(e) => changeResult("pageSize", e.target.value)}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
          <span>
            Page {f.page} of {Math.max(1, Math.ceil(data.total / f.pageSize))}
          </span>
          <div className="actions">
            {f.page > 1 && (
              <Link href={`${route}?${query(f.page - 1)}`}>Previous</Link>
            )}
            {f.page * f.pageSize < data.total && (
              <Link href={`${route}?${query(f.page + 1)}`}>Next</Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
