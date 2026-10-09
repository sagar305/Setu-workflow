"use client";
import { useState } from "react";
import { Field, MutationForm } from "../form";
export type Adjustment = {
  id: string;
  startDate: string;
  endDate: string;
  adjustmentType: string;
  hoursReduction: string;
  reason: string;
  revision: number;
};
export function AdjustCapacity({
  userId,
  start,
  rows,
  canEdit = true,
}: {
  userId: string;
  start: string;
  rows: Adjustment[];
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Adjustment | null>(null);
  return (
    <>
      {canEdit && (
        <button
          className="button secondary"
          onClick={() => {
            setEditing(null);
            setOpen(!open);
          }}
        >
          {open ? "Close Adjustment" : "Adjust Capacity"}
        </button>
      )}
      {open && (
        <section className="card detail-card">
          <h3>{editing ? "Edit capacity adjustment" : "Reduce capacity"}</h3>
          <MutationForm
            key={editing?.id ?? "new"}
            endpoint={`/api/capacity/adjustments${editing ? `/${editing.id}` : ""}`}
            label="Save Adjustment"
            onSaved={() => {
              setOpen(false);
              setEditing(null);
            }}
            transform={(d) => ({ ...d, userId, revision: editing?.revision })}
          >
            <div className="form-grid">
              <Field label="Start Date">
                <input
                  type="date"
                  name="startDate"
                  required
                  defaultValue={editing?.startDate ?? start}
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  name="endDate"
                  required
                  defaultValue={editing?.endDate ?? start}
                />
              </Field>
              <Field
                label="Reduction per working day (hours)"
                hint="Applied Monday–Friday. Overlapping reductions add together; daily capacity cannot fall below zero."
              >
                <input
                  type="number"
                  min="0.01"
                  max="24"
                  step="0.01"
                  name="hoursReduction"
                  required
                  defaultValue={editing?.hoursReduction}
                />
              </Field>
              <Field label="Adjustment Type">
                <select
                  name="adjustmentType"
                  defaultValue={editing?.adjustmentType ?? "Leave"}
                >
                  {["Leave", "Training", "Holiday", "Other"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Reason">
              <textarea
                name="reason"
                required
                maxLength={1000}
                defaultValue={editing?.reason}
              />
            </Field>
          </MutationForm>
        </section>
      )}
      {!!rows.length && (
        <details>
          <summary>Capacity adjustments ({rows.length})</summary>
          {rows.map((a) => (
            <article key={a.id}>
              <p>
                {a.startDate} – {a.endDate} · −{a.hoursReduction}h per working
                day · {a.adjustmentType}
              </p>
              <p>{a.reason}</p>
              {canEdit && (
                <button
                  className="text-button"
                  onClick={() => {
                    setEditing(a);
                    setOpen(true);
                  }}
                >
                  Edit adjustment
                </button>
              )}
              <details>
                <summary>Cancel adjustment</summary>
                <MutationForm
                  endpoint={`/api/capacity/adjustments/${a.id}/cancel`}
                  label="Cancel Adjustment"
                  transform={(d) => ({ ...d, revision: a.revision })}
                >
                  <Field label="Cancellation reason">
                    <input name="reason" required maxLength={1000} />
                  </Field>
                </MutationForm>
              </details>
            </article>
          ))}
        </details>
      )}
    </>
  );
}
