"use client";
import { useState } from "react";
import Link from "next/link";

import { MutationForm, Field } from "@/components/form";
import { TextField } from "@/components/clients/fields";
import {
  STAFF,
  DATE_FIELDS,
  ENGAGEMENT_STATUSES,
  engagementLabel,
} from "@/lib/engagement-constants";
import { personName } from "./form";
import type {
  EngagementRecord,
  EngagementOptions,
  EngagementRights,
  EngagementActivity,
} from "./types";
function Values({ values }: { values: Record<string, React.ReactNode> }) {
  return (
    <dl className="client-details">
      {Object.entries(values).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function EngagementDetail({
  record: r,
  options,
  rights,
  tab,
  activity,
  workflow,
  allocations,
}: {
  record: EngagementRecord;
  options: EngagementOptions;
  rights: EngagementRights;
  tab: string;
  activity?: EngagementActivity;
  workflow?: React.ReactNode;
  allocations?: React.ReactNode;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [status, setStatus] = useState(r.status);
  return (
    <>
      <Link href="/engagements" className="back-link">
        ← All engagements
      </Link>
      <div className="page-heading client-heading">
        <div>
          <p className="eyebrow">
            {r.client.displayName} · {r.client.clientCode}
          </p>
          <h1>{r.engagementName}</h1>
          <p className="muted">Engagement Code: {r.engagementCode}</p>
        </div>
        <div className="actions">
          {rights.edit && (
            <Link className="button primary" href={`/engagements/${r.id}/edit`}>
              Edit Engagement
            </Link>
          )}
          {rights.status && (
            <button
              className="button secondary"
              onClick={() => setStatusOpen(!statusOpen)}
            >
              Change Status
            </button>
          )}
          {rights.assign && (
            <Link
              className="button secondary"
              href={`/engagements/${r.id}?tab=team`}
            >
              Reassign
            </Link>
          )}
        </div>
      </div>
      <div className="client-owner-strip">
        <span>
          Status<strong>{engagementLabel(r.status)}</strong>
        </span>
        <span>
          Priority<strong>{r.priority}</strong>
        </span>
        <span>
          Due
          <strong>
            {r.dueDate?.slice(0, 10) ?? "Not set"}{" "}
            {r.overdue && <span className="overdue-label">Overdue</span>}
          </strong>
        </span>
        <span>
          Budget
          <strong>
            {r.budgetHours === null ? "Not set" : r.budgetHours + "h"}
          </strong>
        </span>
      </div>
      {statusOpen && (
        <section className="card detail-card">
          <h2>Change Status</h2>
          <MutationForm
            endpoint={`/api/engagements/${r.id}/status`}
            label="Save Status"
            transform={(data) => ({
              ...data,
              status,
              completedDate: status === "Completed" ? data.completedDate : null,
              version: r.version,
            })}
          >
            <div className="form-grid">
              <Field label="New Status">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  {ENGAGEMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {engagementLabel(s)}
                    </option>
                  ))}
                </select>
              </Field>
              {status === "Completed" && (
                <TextField
                  label="Completed Date"
                  name="completedDate"
                  type="date"
                  value={r.completedDate?.slice(0, 10)}
                  required
                />
              )}
            </div>
            <Field label="Status Comment">
              <textarea name="statusComment" maxLength={2000} />
            </Field>
            <p className="muted small">
              Reopening preserves all previous completion events.
            </p>
          </MutationForm>
        </section>
      )}
      <nav className="tabs client-tabs" aria-label="Engagement details">
        {[
          "overview",
          "team",
          "activity",
          ...(rights.allocations ? ["assignments"] : []),
          ...(rights.workflowView ? ["workflow"] : []),
        ].map((t) => (
          <Link
            key={t}
            className={tab === t ? "active" : ""}
            href={`/engagements/${r.id}?tab=${t}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
        {["Checklist", "Queries", "Deliverables", "Time"].map((t) => (
          <button key={t} disabled>
            {t}
          </button>
        ))}
      </nav>
      {tab === "workflow" && workflow}
      {tab === "overview" && (
        <div className="client-overview-grid">
          <section className="card detail-card">
            <h2>Client</h2>
            <Values
              values={{
                "Client Name": rights.clientView ? (
                  <Link href={`/clients/${r.client.id}`}>
                    {r.client.displayName}
                  </Link>
                ) : (
                  r.client.displayName
                ),
                "Client Code": r.client.clientCode,
                "Entity Type": r.client.entityType.name,
              }}
            />
            <h2>Engagement</h2>
            <Values
              values={{
                Name: r.engagementName,
                Code: r.engagementCode,
                Service: r.serviceLine.name,
                Type: r.engagementType.name,
                Period: engagementLabel(r.periodType),
                "Period Start": r.periodStartDate?.slice(0, 10),
                "Period End": r.periodEndDate?.slice(0, 10),
                "Reporting Year": r.reportingYear,
                Recurring: r.recurring ? "Yes" : "No",
                Status: engagementLabel(r.status),
                Priority: r.priority,
              }}
            />
          </section>
          <section className="card detail-card">
            <h2>Ownership</h2>
            <Values
              values={{
                Office: r.office.officeName,
                Partner: personName(r.partner),
                Manager: personName(r.manager),
                Reviewer: personName(r.reviewer),
                Preparer: personName(r.preparer),
              }}
            />
            <h2>Schedule</h2>
            <Values
              values={Object.fromEntries(
                DATE_FIELDS.filter((k) => !k.startsWith("period")).map(
                  (key) => [
                    key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (c) => c.toUpperCase()),
                    r[key]?.slice(0, 10),
                  ],
                ),
              )}
            />
            <h2>Budget</h2>
            <Values
              values={{
                "Budget Hours": r.budgetHours,
                "Actual Hours": "Not available yet",
              }}
            />
          </section>
          <section className="card detail-card">
            <h2>Additional Information</h2>
            <Values
              values={{
                Description: r.description || "—",
                "Internal Notes": r.internalNotes || "—",
              }}
            />
          </section>
          <section className="card detail-card">
            <h2>Custom Fields</h2>
            <Values
              values={Object.fromEntries(
                options.definitions.map((d) => {
                  const v = r.customValues.find((v) => v.definitionId === d.id);
                  return [
                    d.name + (!d.active ? " (inactive)" : ""),
                    v?.textValue ??
                      v?.numberValue ??
                      v?.dateValue?.slice(0, 10) ??
                      (v?.booleanValue === null || v?.booleanValue === undefined
                        ? "—"
                        : v.booleanValue
                          ? "Yes"
                          : "No"),
                  ];
                }),
              )}
            />
            {rights.edit && (
              <Link href={`/engagements/${r.id}/edit`}>Edit custom values</Link>
            )}
          </section>
        </div>
      )}
      {tab === "team" && (
        <section className="card detail-card">
          <h2>Engagement Team</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Assignment</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Office</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(["partner", "manager", "reviewer", "preparer"] as const).map(
                  (key) => (
                    <tr key={key}>
                      <td>{key[0].toUpperCase() + key.slice(1)}</td>
                      <td>{personName(r[key])}</td>
                      <td>{r[key]?.role.roleName ?? "—"}</td>
                      <td>{r[key]?.primaryOffice?.officeName ?? "—"}</td>
                      <td>{r[key]?.status ?? "—"}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {rights.assign && (
            <>
              <h3>Reassign staff</h3>
              <MutationForm
                endpoint={`/api/engagements/${r.id}/assign`}
                label="Save Team"
                redirectTo="/engagements"
                transform={(data) => ({ ...data, version: r.version })}
              >
                <div className="form-grid">
                  {STAFF.map((key) => (
                    <Field
                      key={key}
                      label={"New " + key[0].toUpperCase() + key.slice(1, -2)}
                    >
                      <select name={key} defaultValue={r[key] ?? ""}>
                        <option value="">Not assigned</option>
                        {options.users
                          .filter(
                            (u) =>
                              (u.status === "Active" && u.role.active) ||
                              u.id === r[key],
                          )
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {personName(u)}
                              {u.status !== "Active" ? " (inactive)" : ""}
                            </option>
                          ))}
                      </select>
                    </Field>
                  ))}
                  <TextField
                    label="Allocation Date"
                    name="allocationDate"
                    type="date"
                    value={r.allocationDate?.slice(0, 10)}
                  />
                </div>
                <p className="muted small">
                  Retain or change the allocation date explicitly. Previous
                  preparers and allocation dates remain in history. You will
                  return to the engagement list after saving.
                </p>
              </MutationForm>
            </>
          )}
        </section>
      )}
      {tab === "activity" && activity && (
        <section className="card detail-card">
          <h2>Activity</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Timestamp (UTC)</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {activity.items.map((e) => (
                  <tr key={e.id}>
                    <td>{e.timestamp.replace("T", " ").slice(0, 19)}</td>
                    <td>{e.actor}</td>
                    <td>{e.action}</td>
                    <td>{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {activity.total} events · Page {activity.page}
            </span>
            {activity.page > 1 && (
              <Link href={`?tab=activity&page=${activity.page - 1}`}>
                Previous
              </Link>
            )}
            {activity.page * 25 < activity.total && (
              <Link href={`?tab=activity&page=${activity.page + 1}`}>Next</Link>
            )}
          </div>
        </section>
      )}
      {tab === "assignments" && allocations}
      <p className="muted small below-table">
        Checklist, Queries, Deliverables, and Time are not available yet.
      </p>
    </>
  );
}
