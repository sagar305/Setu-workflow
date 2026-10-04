"use client";
import { useState } from "react";
import { MutationForm, Field } from "../form";
import {
  CHECKLIST_STATUSES,
  checklistProgress,
} from "@/lib/checklist-validation";
import type { getChecklist, checklistDetail } from "@/lib/checklists";
import type { Serialized } from "../clients/types";
type Data = Serialized<Awaited<ReturnType<typeof getChecklist>>>;
type Item = Data["items"][number];
type Detail = Serialized<Awaited<ReturnType<typeof checklistDetail>>>;
const name = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName} ${u.lastName}` : "Unassigned";
const stamp = (value: string) =>
  value.slice(0, 10) + " " + value.slice(11, 19) + " UTC";
const label = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2");
function ActivityDetails({
  metadata,
}: {
  metadata: Detail["history"][number]["metadata"];
}) {
  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const data = object(metadata),
    before = object(data.before),
    after = object(data.after);
  const value = (v: unknown) =>
    v === null || v === undefined
      ? "Not set"
      : typeof v === "boolean"
        ? v
          ? "Yes"
          : "No"
        : String(v);
  const employee = (v: unknown) => {
    const u = object(v);
    return u.firstName ? `${u.firstName} ${u.lastName}` : "Unassigned";
  };
  const keys = {
    itemTitle: "Title",
    status: "Status",
    instructionsSnapshot: "Instructions",
    description: "Description",
    dueDate: "Due date",
    estimatedHours: "Estimated hours",
    isRequired: "Required",
    evidenceRequired: "Evidence required",
    completedAt: "Completed at",
  };
  return (
    <div>
      {Object.entries(keys)
        .filter(([key]) => before[key] !== after[key])
        .map(([key, title]) => (
          <p key={key}>
            <strong>{title}:</strong> {value(before[key])} → {value(after[key])}
          </p>
        ))}
      {before.assignedUserId !== after.assignedUserId && (
        <p>
          <strong>Assigned employee:</strong> {employee(before.assignedUser)} →{" "}
          {employee(after.assignedUser)}
        </p>
      )}
      {typeof data.reason === "string" && (
        <p>
          <strong>Reason:</strong> {data.reason}
        </p>
      )}
      {typeof data.commentText === "string" && <p>{data.commentText}</p>}
      {typeof data.instructions === "string" && (
        <p>
          <strong>Original instructions:</strong> {data.instructions}
        </p>
      )}
    </div>
  );
}
function Fields({ item }: { item?: Item }) {
  return (
    <div className="form-grid">
      <Field label="Item title">
        <input
          name="itemTitle"
          required
          maxLength={200}
          defaultValue={item?.itemTitle}
        />
      </Field>
      <Field label="Item code">
        <input name="itemCode" maxLength={60} defaultValue={item?.itemCode} />
      </Field>
      <Field label="Description">
        <textarea
          name="description"
          maxLength={4000}
          defaultValue={item?.description}
        />
      </Field>
      <Field label="Instructions">
        <textarea
          name="instructions"
          maxLength={8000}
          defaultValue={item?.instructionsSnapshot}
        />
      </Field>
      <Field label="Due date">
        <input
          name="dueDate"
          type="date"
          defaultValue={item?.dueDate?.slice(0, 10)}
        />
      </Field>
      <Field label="Estimated hours (not scheduled hours)">
        <input
          name="estimatedHours"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={item?.estimatedHours ?? ""}
        />
      </Field>
      <label>
        <input
          name="isRequired"
          type="checkbox"
          defaultChecked={item?.isRequired ?? true}
        />{" "}
        Required
      </label>
      <label>
        <input
          name="evidenceRequired"
          type="checkbox"
          defaultChecked={item?.evidenceRequired ?? false}
        />{" "}
        Evidence required
      </label>
    </div>
  );
}
const fields = (d: Record<string, unknown>) => ({
  ...d,
  isRequired: d.isRequired === "on",
  evidenceRequired: d.evidenceRequired === "on",
});
function Employee({
  users,
  value,
}: {
  users: Data["users"];
  value?: string | null;
}) {
  return (
    <Field label="Assigned employee">
      <select name="assignedUserId" defaultValue={value ?? ""}>
        <option value="">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {name(u)}
          </option>
        ))}
      </select>
    </Field>
  );
}
function ItemRow({
  item,
  users,
  permissions,
}: {
  item: Item;
  users: Data["users"];
  permissions: string[];
}) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState("");
  const can = (p: string) => permissions.includes(`checklist.${p}`);
  const editable = ["Current", "NotStarted"].includes(item.stage.state);
  const terminal = ["Completed", "NotApplicable"].includes(item.status);
  const endpoint = `/api/checklists/${item.id}`;
  async function load() {
    setError("");
    try {
      const r = await fetch(endpoint);
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <details
      className="card detail-card"
      onToggle={(e) => {
        if (e.currentTarget.open && !detail) void load();
      }}
    >
      <summary>
        <strong>{item.itemTitle}</strong> · {name(item.assignedUser)} ·{" "}
        {item.dueDate?.slice(0, 10) ?? "No due date"} · {label(item.status)}{" "}
        {item.isRequired ? "· Required" : ""}
      </summary>
      <p>{item.description}</p>
      <p style={{ whiteSpace: "pre-wrap" }}>
        {item.instructionsSnapshot || "No additional instructions."}
      </p>
      <p className="muted">
        Stage: {item.stage.name} · Estimate: {item.estimatedHours ?? "—"} hours
        · Evidence: {item.evidenceRequired ? "Required" : "Optional"}
      </p>
      {item.reason && <p>Reason: {item.reason}</p>}
      {item.completedAt && (
        <p>
          Completed by {name(item.completedBy)} at {stamp(item.completedAt)}
        </p>
      )}
      {editable && !terminal && (can("update_status") || can("complete")) && (
        <MutationForm
          endpoint={endpoint}
          label="Update status"
          transform={(d) => ({
            ...d,
            action: "status",
            revision: item.revision,
          })}
        >
          <div className="form-grid">
            <Field label="New status">
              <select
                name="status"
                defaultValue={can("update_status") ? "InProgress" : "Completed"}
              >
                {CHECKLIST_STATUSES.filter((s) =>
                  s === "Completed" ? can("complete") : can("update_status"),
                ).map((s) => (
                  <option key={s} value={s}>
                    {s === "InProgress" ? "Start / In Progress" : label(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason (required for Blocked or Not Applicable)">
              <textarea name="reason" maxLength={2000} />
            </Field>
          </div>
        </MutationForm>
      )}
      {editable && terminal && can("reopen") && (
        <MutationForm
          endpoint={endpoint}
          label="Reopen"
          transform={(d) => ({
            ...d,
            action: "reopen",
            revision: item.revision,
          })}
        >
          <Field label="Reopening reason">
            <textarea name="reason" required maxLength={2000} />
          </Field>
        </MutationForm>
      )}
      {editable && can("assign") && (
        <details>
          <summary>Reassign employee</summary>
          <MutationForm
            endpoint={endpoint}
            label="Confirm reassignment"
            transform={(d) => ({
              ...d,
              action: "assign",
              revision: item.revision,
            })}
          >
            <Employee users={users} value={item.assignedUserId} />
            <Field label="Reassignment reason">
              <textarea name="reason" required maxLength={2000} />
            </Field>
          </MutationForm>
        </details>
      )}
      {editable && !terminal && can("edit") && (
        <details>
          <summary>Edit item</summary>
          <MutationForm
            endpoint={endpoint}
            label="Save item"
            transform={(d) => ({
              action: "edit",
              revision: item.revision,
              fields: fields(d),
            })}
          >
            <Fields item={item} />
          </MutationForm>
        </details>
      )}
      {!editable && (
        <p className="muted">
          Return or reopen this workflow stage to change this item.
        </p>
      )}
      <h4>Comments</h4>
      {detail?.comments.map((c) => (
        <p key={c.id}>
          <strong>{name(c.author)}</strong> · {stamp(c.createdAt)}
          <br />
          {c.commentText}
        </p>
      ))}
      {can("comment") && (
        <MutationForm
          endpoint={endpoint}
          label="Add comment"
          transform={(d) => ({
            ...d,
            action: "comment",
            revision: item.revision,
          })}
        >
          <Field label="Comment">
            <textarea name="commentText" required maxLength={8000} />
          </Field>
        </MutationForm>
      )}
      <h4>Attachments</h4>
      <p className="notice">
        Persistent file storage is not configured. Uploads and downloads are
        unavailable; evidence-required items cannot be completed.
      </p>
      {can("attach") && (
        <button className="button secondary" disabled>
          Attach supporting file — unavailable
        </button>
      )}
      {detail?.attachments.map((a) => (
        <p key={a.id}>
          {a.fileName} · {a.byteSize} bytes
        </p>
      ))}
      <h4>Activity history</h4>
      {error && (
        <p role="alert">
          {error} <button onClick={() => void load()}>Retry</button>
        </p>
      )}
      {!detail && !error && <p>Loading activity…</p>}
      {detail?.history.map((h) => (
        <details key={h.id}>
          <summary>
            {label(h.action.replace("checklist.", "").replaceAll("_", " "))} ·{" "}
            {name(h.actor)} · {stamp(h.timestamp)}
          </summary>
          <ActivityDetails metadata={h.metadata} />
        </details>
      ))}
    </details>
  );
}
export function ChecklistPanel({
  data,
  engagementId,
}: {
  data: Data;
  engagementId: string;
}) {
  const p = data.progress;
  return (
    <section>
      <h2>Engagement Checklist</h2>
      <div className="client-owner-strip">
        <span>
          Total<strong>{p.total}</strong>
        </span>
        <span>
          Completed<strong>{p.completed}</strong>
        </span>
        <span>
          In Progress<strong>{p.inProgress}</strong>
        </span>
        <span>
          Blocked<strong>{p.blocked}</strong>
        </span>
        <span>
          Not Started<strong>{p.notStarted}</strong>
        </span>
        <span>
          Completion<strong>{p.percent}%</strong>
        </span>
      </div>
      <p className="muted">
        {p.completed} / {p.applicable} applicable items completed;{" "}
        {p.notApplicable} Not Applicable excluded.{" "}
        {p.applicable === 0 ? "No applicable items." : ""} Estimates do not
        create planned allocations.
      </p>
      {!data.workflow && (
        <p>Apply a published workflow in the Workflow tab to begin.</p>
      )}
      {data.workflow?.stages.map((s) => {
        const items = data.items.filter(
            (i) => i.engagementWorkflowStageId === s.id,
          ),
          progress = checklistProgress(items);
        return (
          <section key={s.id}>
            <h3>
              {s.name} — {progress.completed}/{progress.applicable} completed (
              {progress.percent}%)
            </h3>
            <p className="muted">
              Required outstanding: {progress.requiredOutstanding} · Blocked:{" "}
              {progress.blocked}
            </p>
            {items.length === 0 && <p>No checklist items in this stage.</p>}
            {items.map((item) => (
              <ItemRow
                key={item.id + ":" + item.revision}
                item={item}
                users={data.users}
                permissions={data.permissions}
              />
            ))}
          </section>
        );
      })}
      {data.workflow?.status === "Active" &&
        data.permissions.includes("checklist.create") && (
          <details className="card detail-card">
            <summary>Add engagement-specific checklist item</summary>
            <MutationForm
              endpoint={`/api/checklists/engagement/${engagementId}`}
              label="Add checklist item"
              transform={(d) => ({
                ...fields(d),
                workflowRevision: data.workflow!.revision,
              })}
            >
              <Field label="Workflow stage">
                <select name="stageId" required>
                  <option value="">Select stage</option>
                  {data.workflow.stages
                    .filter((s) => ["Current", "NotStarted"].includes(s.state))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Fields />
              {data.permissions.includes("checklist.assign") && (
                <Employee users={data.users} />
              )}
            </MutationForm>
          </details>
        )}
    </section>
  );
}
