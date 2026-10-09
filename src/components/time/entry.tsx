"use client";
import { useEffect, useState } from "react";
import { MutationForm, Field } from "@/components/form";
import type { timeOptions } from "@/lib/time";
type Options = Awaited<ReturnType<typeof timeOptions>>;
export type EntryFields = {
  engagementId: string;
  workDate: string;
  hours: string;
  description: string;
  engagementWorkflowStageId: string | null;
  checklistItemId: string | null;
  workAllocationId: string | null;
};
export function TimeEntryForm({
  today,
  initial,
  entryId,
  revision,
  onSaved,
}: {
  today: string;
  initial?: Partial<EntryFields>;
  entryId?: string;
  revision?: number;
  onSaved?: () => void;
}) {
  const [engagement, setEngagement] = useState(initial?.engagementId ?? "");
  const [stage, setStage] = useState(initial?.engagementWorkflowStageId ?? "");
  const [checklist, setChecklist] = useState(initial?.checklistItemId ?? "");
  const [options, setOptions] = useState<Options>({
    engagements: [],
    stages: [],
    checklist: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/time/options?engagementId=${engagement}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Cannot load engagements.");
        return data;
      })
      .then((data) => {
        setOptions(data);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [engagement]);
  return (
    <>
      <h3>{entryId ? "Edit draft" : "Add Time"}</h3>
      {error && <p role="alert">{error}</p>}
      <MutationForm
        endpoint={entryId ? `/api/time/${entryId}` : "/api/time"}
        label="Save Draft"
        onSaved={onSaved}
        transform={(data) => {
          const fields = {
            ...data,
            engagementId: engagement,
            engagementWorkflowStageId: stage || null,
            checklistItemId: checklist || null,
            workAllocationId: initial?.workAllocationId ?? null,
          };
          return entryId
            ? { action: "edit", revision, fields }
            : { ...fields, requestId };
        }}
      >
        <fieldset disabled={loading || !!error}>
          <Field label="Engagement">
            <select
              required
              value={engagement}
              disabled={!!entryId || !!initial?.workAllocationId}
              onChange={(e) => {
                setEngagement(e.target.value);
                setStage("");
                setChecklist("");
                setLoading(true);
              }}
            >
              <option value="">Select engagement</option>
              {options.engagements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.client.displayName} · {e.engagementName}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Work Date">
              <input
                name="workDate"
                type="date"
                required
                defaultValue={initial?.workDate ?? today}
              />
            </Field>
            <Field label="Hours">
              <input
                name="hours"
                type="number"
                min="0.01"
                max="24"
                step="0.01"
                required
                defaultValue={initial?.hours}
                placeholder="2.5"
              />
            </Field>
          </div>
          <Field label="Work Performed">
            <textarea
              name="description"
              required
              maxLength={2000}
              defaultValue={initial?.description}
              rows={2}
            />
          </Field>
          <details
            open={
              !!initial?.engagementWorkflowStageId || !!initial?.checklistItemId
            }
          >
            <summary>Link stage or checklist (optional)</summary>
            <Field label="Workflow Stage">
              <select
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  setChecklist("");
                }}
              >
                <option value="">Engagement level</option>
                {options.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Checklist Item">
              <select
                value={checklist}
                onChange={(e) => {
                  setChecklist(e.target.value);
                  const item = options.checklist.find(
                    (i) => i.id === e.target.value,
                  );
                  if (item) setStage(item.engagementWorkflowStageId);
                }}
              >
                <option value="">None</option>
                {options.checklist
                  .filter(
                    (i) => !stage || i.engagementWorkflowStageId === stage,
                  )
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.itemTitle}
                    </option>
                  ))}
              </select>
            </Field>
          </details>
        </fieldset>
      </MutationForm>
      <p className="muted small">
        Drafts are editable. Submit from My Time to include these hours in
        engagement actuals.
      </p>
    </>
  );
}
export function AddTime({
  today,
  initial,
}: {
  today: string;
  initial?: Partial<EntryFields>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(!open)}>
        {open ? "Cancel" : "+ Add Time"}
      </button>
      {open && (
        <section className="card detail-card">
          <TimeEntryForm
            today={today}
            initial={initial}
            onSaved={() => setOpen(false)}
          />
        </section>
      )}
    </>
  );
}
