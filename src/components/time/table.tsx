"use client";
import { useState } from "react";
import { MutationForm, Field } from "@/components/form";
import { TimeEntryForm, type EntryFields } from "./entry";
export type TimeRow = EntryFields & {
  id: string;
  revision: number;
  userId: string;
  status: string;
  submittedAt: string | null;
  user: { firstName: string; lastName: string };
  engagement: { engagementName: string; client: { displayName: string } };
  stage: { name: string } | null;
  checklistItem: { itemTitle: string } | null;
};
export function TimeTable({
  rows,
  userId,
  today,
  edit,
  submit,
  correct,
  team = false,
}: {
  rows: TimeRow[];
  userId: string;
  today: string;
  edit: boolean;
  submit: boolean;
  correct: boolean;
  team?: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [employee, setEmployee] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stage, setStage] = useState("");
  const active = rows.find((r) => r.id === editing);
  const filtered = rows.filter(
    (r) =>
      (!employee || r.userId === employee) &&
      (!from || r.workDate.slice(0, 10) >= from) &&
      (!to || r.workDate.slice(0, 10) <= to) &&
      (!stage || r.engagementWorkflowStageId === stage),
  );
  return (
    <>
      {team && (
        <details>
          <summary>Filter time details</summary>
          <div className="form-grid">
            <Field label="Employee">
              <select
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
              >
                <option value="">All employees</option>
                {[
                  ...new Map(rows.map((r) => [r.userId, r.user])).entries(),
                ].map(([id, u]) => (
                  <option key={id} value={id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Field label="Stage">
              <select value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">All stages</option>
                {[
                  ...new Map(
                    rows
                      .filter((r) => r.stage)
                      .map((r) => [
                        r.engagementWorkflowStageId!,
                        r.stage!.name,
                      ]),
                  ).entries(),
                ].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </details>
      )}
      {active && (
        <section className="card detail-card">
          <button className="text-button" onClick={() => setEditing(null)}>
            Cancel edit
          </button>
          <TimeEntryForm
            key={active.id + active.revision}
            today={today}
            initial={{ ...active, workDate: active.workDate.slice(0, 10) }}
            entryId={active.id}
            revision={active.revision}
            onSaved={() => setEditing(null)}
          />
        </section>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Date",
                ...(team ? ["Employee"] : []),
                "Client / Engagement",
                "Work Description",
                "Hours",
                "Status",
                "Actions",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.workDate.slice(0, 10)}</td>
                {team && (
                  <td>
                    {r.user.firstName} {r.user.lastName}
                  </td>
                )}
                <td>
                  {r.engagement.client.displayName}
                  <br />
                  {r.engagement.engagementName}
                </td>
                <td>
                  {r.description}
                  <small>
                    {[r.stage?.name, r.checklistItem?.itemTitle]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </td>
                <td>{r.hours}h</td>
                <td>
                  {r.status}
                  {r.status === "Draft" && r.submittedAt ? " (correction)" : ""}
                </td>
                <td>
                  {r.userId === userId && r.status === "Draft" && (
                    <>
                      {edit && (
                        <button
                          className="text-button"
                          onClick={() => setEditing(r.id)}
                        >
                          Edit Draft
                        </button>
                      )}
                      {submit && (
                        <MutationForm
                          endpoint={`/api/time/${r.id}`}
                          label="Submit"
                          transform={() => ({
                            action: "submit",
                            revision: r.revision,
                          })}
                        >
                          <span className="muted small">
                            Finalize these hours.
                          </span>
                        </MutationForm>
                      )}
                      {edit && !r.submittedAt && (
                        <details>
                          <summary>Delete draft</summary>
                          <MutationForm
                            endpoint={`/api/time/${r.id}`}
                            label="Delete Draft"
                            transform={() => ({
                              action: "delete",
                              revision: r.revision,
                            })}
                          >
                            <p>Remove this unsubmitted draft?</p>
                          </MutationForm>
                        </details>
                      )}
                    </>
                  )}
                  {correct && r.status === "Submitted" && (
                    <details>
                      <summary>Correct time</summary>
                      <MutationForm
                        endpoint={`/api/time/${r.id}`}
                        label="Return to Draft"
                        transform={(d) => ({
                          ...d,
                          action: "correct",
                          revision: r.revision,
                        })}
                      >
                        <Field label="Correction reason">
                          <textarea name="reason" required maxLength={2000} />
                        </Field>
                      </MutationForm>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <p>No time entries in this view.</p>}
    </>
  );
}
