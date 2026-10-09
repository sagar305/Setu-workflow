"use client";
import { useState } from "react";
import { Field, MutationForm } from "../form";
import {
  POINT_TYPES,
  POINT_PRIORITIES,
  pointLabel,
} from "@/lib/point-validation";
import type { pointOptions, PointFields } from "@/lib/points";
type Options = Awaited<ReturnType<typeof pointOptions>>;
export const person = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName} ${u.lastName}` : "—";
export function readFields(data: Record<string, unknown>) {
  return { ...data, blocking: data.blocking === "on" };
}
export function PointFieldsForm({
  options,
  value,
  info = false,
}: {
  options: Options;
  value?: Partial<PointFields>;
  info?: boolean;
}) {
  const [stage, setStage] = useState(value?.workflowStageId ?? ""),
    [item, setItem] = useState(value?.checklistItemId ?? "");
  return (
    <div className="form-grid">
      <Field label="Title *">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={value?.title}
        />
      </Field>
      <Field label="Description *">
        <textarea
          name="description"
          required
          maxLength={8000}
          rows={4}
          defaultValue={value?.description}
        />
      </Field>
      <Field label="Priority">
        <select name="priority" defaultValue={value?.priority ?? "Normal"}>
          {POINT_PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
      <Field label="Due date">
        <input name="dueDate" type="date" defaultValue={value?.dueDate ?? ""} />
      </Field>
      <Field label="Workflow stage">
        <select
          name="workflowStageId"
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            setItem("");
          }}
        >
          <option value="">Engagement-wide</option>
          {options.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Checklist item">
        <select
          name="checklistItemId"
          value={item}
          onChange={(e) => {
            setItem(e.target.value);
            const selected = options.checklistItems.find(
              (i) => i.id === e.target.value,
            );
            if (selected) setStage(selected.engagementWorkflowStageId);
          }}
        >
          <option value="">None</option>
          {options.checklistItems
            .filter((i) => !stage || i.engagementWorkflowStageId === stage)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.itemTitle}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Reference number">
        <input
          name="referenceNumber"
          maxLength={150}
          defaultValue={value?.referenceNumber}
        />
      </Field>
      <Field label="Reference amount">
        <input
          name="referenceAmount"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={value?.referenceAmount ?? ""}
        />
      </Field>
      <Field label="Prior-year amount">
        <input
          name="priorYearAmount"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={value?.priorYearAmount ?? ""}
        />
      </Field>
      <Field label="Classification">
        <select name="audience" defaultValue={value?.audience ?? "Internal"}>
          <option value="Internal">Internal</option>
          <option value="External">Client-facing / External</option>
        </select>
      </Field>
      <label>
        <input
          name="blocking"
          type="checkbox"
          disabled={info}
          defaultChecked={value?.blocking ?? false}
        />{" "}
        Blocking — prevents normal workflow movement
      </label>
      {info && (
        <p className="muted">
          Instructions use Active / Archived and never block workflow movement.
        </p>
      )}
      <p className="muted">
        Classification is a label only. All conversation remains internal to
        authenticated firm employees.
      </p>
    </div>
  );
}
export function PointCreateForm({
  engagementId,
  options,
  checklistItemId,
}: {
  engagementId: string;
  options: Options;
  checklistItemId?: string;
}) {
  const [pointType, setType] = useState<string>("Question");
  const item = options.checklistItems.find((i) => i.id === checklistItemId);
  return (
    <MutationForm
      endpoint={`/api/points/engagement/${engagementId}`}
      label="Raise Point"
      redirectTo={`/engagements/${engagementId}?tab=queries`}
      transform={(d) => ({ ...readFields(d), pointType })}
    >
      <div className="form-grid">
        <Field label="Point type *">
          <select value={pointType} onChange={(e) => setType(e.target.value)}>
            {POINT_TYPES.map((t) => (
              <option key={t} value={t}>
                {pointLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assign to *">
          <select
            name="assignedToUserId"
            required
            defaultValue={options.userId}
          >
            <option value="">Choose employee</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {person(u)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <PointFieldsForm
        options={options}
        info={pointType === "KnowledgeInstruction"}
        value={{
          checklistItemId: item?.id,
          workflowStageId: item?.engagementWorkflowStageId,
        }}
      />
      <p className="notice">
        Attachments are unavailable until persistent secure storage is
        configured.
      </p>
      <button type="button" className="button secondary" disabled>
        Attach file — unavailable
      </button>
    </MutationForm>
  );
}
