"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, MutationForm, post } from "../form";
import {
  ALLOCATION_STATUSES,
  BLOCK_REASONS,
} from "@/lib/allocation-validation";
import { PRIORITIES, engagementLabel } from "@/lib/engagement-constants";
import type { Serialized } from "../clients/types";
import type {
  listAllocations,
  allocationOptions,
  allocationHistory,
} from "@/lib/allocations";
type Row = Serialized<
  Awaited<ReturnType<typeof listAllocations>>
>["items"][number];
type Options = Serialized<Awaited<ReturnType<typeof allocationOptions>>>;
type History = Serialized<Awaited<ReturnType<typeof allocationHistory>>>;
export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "Request failed.");
  return d;
}
export function AllocationActions({
  row,
  permissions,
}: {
  row: Row;
  permissions: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<Options>();
  const [history, setHistory] = useState<History>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const can = (p: string) => permissions.includes(p);
  const management = row.canManage;
  const update = row.canUpdate;
  async function quick(status: string) {
    setBusy(true);
    setError("");
    try {
      await post(`/api/allocations/${row.id}`, {
        revision: row.revision,
        action: "status",
        status,
      });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(action: string) {
    setError("");
    try {
      if (["edit", "reassign"].includes(action))
        setOptions(
          await getJson<Options>(
            `/api/allocations/${row.engagementId}/options`,
          ),
        );
      if (action === "history") {
        setHistory(
          await getJson<History>(`/api/allocations/${row.id}/history`),
        );
        setHistoryPage(1);
      }
      setMode(action);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="allocation-actions">
      <select
        aria-label="Allocation actions"
        value=""
        disabled={busy}
        onChange={(e) => {
          const action = e.target.value;
          if (action === "start") void quick("InProgress");
          else if (action === "complete") void quick("Completed");
          else if (action) void open(action);
        }}
      >
        <option value="">Actions…</option>
        {row.status !== "Cancelled" && (
          <>
            {update && row.status !== "InProgress" && (
              <option value="start">Start Work</option>
            )}
            {update && <option value="blocked">Mark Blocked</option>}
            {update && row.status !== "Completed" && (
              <option value="complete">Mark Completed</option>
            )}
            {update && <option value="note">Add Progress Note</option>}
            {management && can("allocations.edit") && (
              <option value="status">Change Status</option>
            )}
            {management && can("allocations.edit") && (
              <option value="edit">Edit Allocation</option>
            )}
            {management && can("allocations.reassign") && (
              <option value="reassign">Reassign</option>
            )}
            {management && can("allocations.cancel") && (
              <option value="cancel">Cancel Allocation</option>
            )}
          </>
        )}
        <option value="history">History</option>
      </select>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {mode && (
        <dialog
          className="allocation-editor"
          aria-label="Allocation action"
          ref={(el) => {
            if (el && !el.open) el.showModal();
          }}
          onCancel={() => setMode("")}
        >
          <button className="text-button" onClick={() => setMode("")}>
            Close
          </button>
          {mode === "history" ? (
            <>
              <h3>Allocation History</h3>
              {history.map((h) => (
                <article key={h.id}>
                  <strong>
                    {h.action.replace("allocation.", "")} ·{" "}
                    {new Date(h.timestamp).toLocaleString()}
                  </strong>
                  <p>
                    {h.actor
                      ? `${h.actor.firstName} ${h.actor.lastName}`
                      : "System"}
                  </p>
                  <HistoryDetail metadata={h.metadata} />
                </article>
              ))}
              <div className="actions">
                {historyPage > 1 && (
                  <button
                    onClick={async () => {
                      setHistory(
                        await getJson(
                          `/api/allocations/${row.id}/history?page=${historyPage - 1}`,
                        ),
                      );
                      setHistoryPage(historyPage - 1);
                    }}
                  >
                    Previous history
                  </button>
                )}
                {history.length === 25 && (
                  <button
                    onClick={async () => {
                      setHistory(
                        await getJson(
                          `/api/allocations/${row.id}/history?page=${historyPage + 1}`,
                        ),
                      );
                      setHistoryPage(historyPage + 1);
                    }}
                  >
                    Next history
                  </button>
                )}
              </div>
            </>
          ) : (
            <MutationForm
              endpoint={`/api/allocations/${row.id}`}
              label={
                mode === "cancel"
                  ? "Confirm Cancellation"
                  : mode === "reassign"
                    ? "Confirm Reassignment"
                    : "Save"
              }
              onSaved={() => setMode("")}
              transform={(d) => ({
                revision: row.revision,
                action: mode === "blocked" ? "status" : mode,
                ...(mode === "blocked"
                  ? { status: "Blocked", blockedReason: d.blockedReason }
                  : {}),
                reason: d.reason ?? "",
                ...(mode === "status"
                  ? {
                      status: d.status,
                      blockedReason: d.blockedReason || undefined,
                    }
                  : {}),
                ...(mode === "edit"
                  ? {
                      fields: {
                        ...row,
                        ...d,
                        status: "Assigned",
                        engagementWorkflowStageId: d.engagementWorkflowStageId,
                        plannedStartAt: row.plannedStartAt,
                        plannedEndAt: row.plannedEndAt,
                      },
                      acknowledgeBudget: d.acknowledgeBudget === "on",
                    }
                  : {}),
                ...(mode === "reassign"
                  ? {
                      assignedUserId: d.assignedUserId,
                      changeStageOwner: d.changeStageOwner === "on",
                      workflowRevision: options?.workflow?.revision,
                    }
                  : {}),
              })}
            >
              <h3>
                {mode === "edit"
                  ? "Edit Allocation"
                  : mode === "reassign"
                    ? "Reassign Allocation"
                    : mode === "cancel"
                      ? "Cancel Allocation"
                      : mode === "blocked"
                        ? "Mark Blocked"
                        : "Progress Note"}
              </h3>
              {mode === "status" && (
                <>
                  <Field label="Allocation Status">
                    <select name="status" defaultValue={row.status}>
                      {ALLOCATION_STATUSES.filter((s) => s !== "Cancelled").map(
                        (s) => (
                          <option key={s} value={s}>
                            {engagementLabel(s)}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Blocked reason (required when blocked)">
                    <select name="blockedReason" defaultValue="">
                      <option value="">Select if blocked</option>
                      {BLOCK_REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              {mode === "blocked" && (
                <Field label="Blocked reason">
                  <select name="blockedReason" required>
                    {BLOCK_REASONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
              )}
              {mode === "edit" && (
                <div className="form-grid">
                  <Field label="Allocation Date">
                    <input
                      name="allocationDate"
                      type="date"
                      required
                      defaultValue={row.allocationDate.slice(0, 10)}
                    />
                  </Field>
                  <Field label="Allocated Hours">
                    <input
                      name="allocatedHours"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      defaultValue={row.allocatedHours}
                    />
                  </Field>
                  <Field label="Workflow Stage">
                    <select
                      name="engagementWorkflowStageId"
                      defaultValue={row.engagementWorkflowStageId ?? ""}
                    >
                      <option value="">Engagement level</option>
                      {options?.workflow?.stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select name="priority" defaultValue={row.priority}>
                      {PRIORITIES.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Description">
                    <input
                      name="description"
                      maxLength={1000}
                      defaultValue={row.description}
                    />
                  </Field>
                  <Field label="Notes">
                    <textarea
                      name="allocationNote"
                      maxLength={2000}
                      defaultValue={row.allocationNote}
                    />
                  </Field>
                  <label>
                    <input type="checkbox" name="acknowledgeBudget" /> I
                    acknowledge any planned allocation above engagement budget.
                  </label>
                </div>
              )}
              {mode === "reassign" && (
                <>
                  <Field label="New Employee">
                    <select name="assignedUserId" required defaultValue="">
                      <option value="">Select employee</option>
                      {options?.users
                        .filter((u) => u.id !== row.assignedUserId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <p>
                    Reassigning this dated allocation preserves workflow stage
                    ownership.
                  </p>
                  {options?.workflow?.currentStageId ===
                    row.engagementWorkflowStageId &&
                    can("workflows.reassign") && (
                      <label>
                        <input type="checkbox" name="changeStageOwner" /> Also
                        reassign the current workflow stage (updates stage
                        history).
                      </label>
                    )}
                </>
              )}
              {mode === "cancel" && (
                <p>
                  Cancellation preserves this record and removes its hours from
                  planning totals.
                </p>
              )}
              {mode !== "edit" && (
                <Field
                  label={
                    mode === "blocked"
                      ? "Comments (optional)"
                      : "Reason / Progress Note"
                  }
                >
                  <textarea
                    name="reason"
                    maxLength={2000}
                    required={!["blocked", "status"].includes(mode)}
                  />
                </Field>
              )}
            </MutationForm>
          )}
        </dialog>
      )}
    </div>
  );
}
function HistoryDetail({
  metadata,
}: {
  metadata: History[number]["metadata"];
}) {
  const m = metadata as {
    reason?: string;
    employeeNames?: Record<string, string>;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    changes?: string[];
  };
  const keys = m.changes ?? [
    "assignedUserId",
    "allocationDate",
    "allocatedHours",
    "status",
    "description",
    "allocationNote",
  ];
  return (
    <>
      {m.reason && <p>{m.reason}</p>}
      <dl className="allocation-history">
        {keys
          .filter((k) => !["updatedAt", "revision"].includes(k))
          .map((k) => (
            <div key={k}>
              <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
              <dd>
                {m.before &&
                  `${String(m.employeeNames?.[String(m.before[k])] ?? m.before[k] ?? "—")} → `}
                {String(
                  m.employeeNames?.[String(m.after?.[k])] ??
                    m.after?.[k] ??
                    "—",
                )}
              </dd>
            </div>
          ))}
      </dl>
    </>
  );
}
export { ALLOCATION_STATUSES, engagementLabel };
