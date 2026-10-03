"use client";
import { useState } from "react";
import Link from "next/link";
import { Field, MutationForm } from "@/components/form";
import type { getWorkflow, compatibleTemplates } from "@/lib/workflows";
import type { Serialized } from "../clients/types";
import type { EngagementRecord, EngagementOptions } from "../engagements/types";
type Workflow = NonNullable<
  Serialized<Awaited<ReturnType<typeof getWorkflow>>>
>;
type Templates = Serialized<Awaited<ReturnType<typeof compatibleTemplates>>>;
const name = (u: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName} ${u.lastName}` : "Unassigned";
export function WorkflowPanel({
  workflow: w,
  templates,
  record,
  options,
  permissions,
  canManage,
  userId,
  timezone,
}: {
  workflow: Workflow | null;
  templates: Templates;
  record: EngagementRecord;
  options: EngagementOptions;
  permissions: string[];
  canManage: boolean;
  userId: string;
  timezone: string;
}) {
  const defaultId = record.engagementType.defaultWorkflowTemplateId;
  const [templateId, setTemplate] = useState(
    templates.some((t) => t.id === defaultId) ? (defaultId ?? "") : "",
  );
  const [action, setAction] = useState(""),
    [targetId, setTarget] = useState(""),
    [owner, setOwner] = useState<string | undefined>(undefined);
  const template = templates.find((t) => t.id === templateId);
  const stamp = (v: string | null) =>
    v ? new Date(v).toLocaleString("en-US", { timeZone: timezone }) : "—";
  if (!w)
    return (
      <section className="card detail-card">
        <h2>Apply a Workflow</h2>
        <p className="muted">
          This Engagement has no workflow. Applying a published template creates
          independent stage snapshots.
        </p>
        {canManage &&
        permissions.includes("workflows.apply") &&
        permissions.includes("workflows.start") ? (
          <>
            <Field label="Workflow Template">
              <select
                value={templateId}
                onChange={(e) => setTemplate(e.target.value)}
              >
                <option value="">Select a published workflow</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} – V{t.versionNumber}
                  </option>
                ))}
              </select>
            </Field>
            {template && (
              <div className="workflow-preview">
                <h3>
                  {template.name} – V{template.versionNumber}
                </h3>
                <ol>
                  {template.stages
                    .filter((s) => s.active)
                    .map((s) => (
                      <li key={s.id}>
                        {s.name}{" "}
                        <span className="muted">
                          · {s.defaultOwnerType} ·{" "}
                          {s.targetDays === null
                            ? "No target"
                            : `${s.targetDays} days`}
                        </span>
                      </li>
                    ))}
                </ol>
                <MutationForm
                  endpoint={`/api/workflows/${record.id}/apply`}
                  label="Apply Workflow"
                  transform={() => ({ templateId })}
                >
                  <p>
                    Start at the first stage and resolve its owner from the
                    Engagement team.
                  </p>
                </MutationForm>
              </div>
            )}
          </>
        ) : (
          <p>Ask your Engagement Manager to apply a workflow.</p>
        )}
      </section>
    );
  const current = w.stages.find((s) => s.id === w.currentStageId)!,
    next = w.stages.find((s) => s.sequence > current.sequence);
  const previous = w.stages.filter(
    (s) => s.sequence < current.sequence && !s.isCompletion,
  );
  const target =
    action === "Forward" || action === "Skip"
      ? next
      : action === "Return" || action === "Reopen"
        ? w.stages.find((s) => s.id === targetId)
        : current;
  const resolved = target
    ? target.defaultOwnerType === "SpecificUser"
      ? target.specificUserId
      : (
          {
            Partner: record.partnerId,
            Manager: record.managerId,
            Reviewer: record.reviewerId,
            Preparer: record.preparerId,
            Manual: null,
          } as Record<string, string | null>
        )[target.defaultOwnerType]
    : null;
  const chosen =
    owner === undefined
      ? action === "Reassign"
        ? current.assignedUserId
        : resolved
      : owner;
  const allowed = canManage || current.assignedUserId === userId,
    available = !["OnHold", "Cancelled"].includes(record.status);
  const button = (label: string, a: string, p: string, show = true) =>
    show &&
    allowed &&
    available &&
    permissions.includes(p) && (
      <button
        className="button secondary"
        onClick={() => {
          setAction(a);
          setTarget(
            a === "Return"
              ? (previous.at(-1)?.id ?? "")
              : a === "Reopen"
                ? w.stages.find((s) => s.isStart)!.id
                : "",
          );
          setOwner(undefined);
        }}
      >
        {label}
      </button>
    );
  return (
    <>
      <section className="card detail-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {w.templateNameSnapshot} · VERSION {w.sourceTemplateVersion}
            </p>
            <h2>
              {w.status === "Completed" ? "Workflow Completed" : current.name}
            </h2>
          </div>
          <span className="pill">{w.status}</span>
        </div>
        <dl className="client-details">
          <div>
            <dt>Current Owner</dt>
            <dd>
              {w.status === "Completed"
                ? "No current work"
                : name(current.assignedUser)}
            </dd>
          </div>
          <div>
            <dt>Entered Stage</dt>
            <dd>{stamp(current.enteredAt)}</dd>
          </div>
          <div>
            <dt>Days in Stage</dt>
            <dd>{w.status === "Completed" ? "—" : w.daysInStage}</dd>
          </div>
          <div>
            <dt>Target Days</dt>
            <dd>{current.targetDays ?? "Not set"}</dd>
          </div>
        </dl>
        {w.status === "Active" &&
          current.targetDays !== null &&
          w.daysInStage > current.targetDays && (
            <p className="notice error">Stage target exceeded</p>
          )}
        {record.status === "OnHold" && (
          <p className="notice">
            Engagement is On Hold. Resume through Change Status before moving
            work. Stage age includes hold days.
          </p>
        )}
        <h3>Stage Instructions</h3>
        <p className="workflow-instructions">
          {current.instructions || "No instructions for this stage."}
        </p>
        <div className="actions workflow-actions">
          {button(
            "Move to Next Stage",
            "Forward",
            "workflows.move",
            w.status === "Active" && !!next,
          )}
          {button(
            "Return to Previous Stage",
            "Return",
            "workflows.return",
            w.status === "Active" && previous.length > 0,
          )}
          {button(
            "Reassign Current Stage",
            "Reassign",
            "workflows.reassign",
            w.status === "Active",
          )}
          {button(
            "Skip Optional Stage",
            "Skip",
            "workflows.skip",
            w.status === "Active" && !current.required,
          )}
          {button(
            "Complete Workflow",
            "Complete",
            "workflows.complete",
            w.status === "Active" && current.isCompletion,
          )}
          {button(
            "Reopen Workflow",
            "Reopen",
            "workflows.reopen",
            w.status === "Completed" && canManage,
          )}
        </div>
        <p className="muted small">
          Calendar days in {timezone}. Reassignment does not reset stage age.
        </p>
      </section>
      {action && (
        <section className="card detail-card">
          <h2>{action === "Forward" ? "Move to Next Stage" : action}</h2>
          <MutationForm
            key={action + targetId}
            endpoint={`/api/workflows/${record.id}/transition`}
            label={
              action === "Complete"
                ? "Confirm Completion"
                : "Confirm " + (action === "Forward" ? "Move" : action)
            }
            transform={(data) => ({
              ...data,
              action,
              revision: w.revision,
              currentStageId: current.id,
              targetStageId: target?.id ?? null,
              ...(action === "Complete"
                ? {}
                : { assignedUserId: chosen || null }),
            })}
          >
            <p>
              Current: <strong>{current.name}</strong>
            </p>
            {action === "Return" || action === "Reopen" ? (
              <Field label="Return to Stage">
                <select
                  required
                  value={targetId}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setOwner(undefined);
                  }}
                >
                  {(action === "Return"
                    ? previous
                    : w.stages.filter((s) => !s.isCompletion)
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p>
                Next: <strong>{target?.name}</strong>
              </p>
            )}
            {action !== "Complete" && (
              <Field
                label="Assign To"
                hint="Owner must already have Engagement access through staffing or firm visibility."
              >
                <select
                  value={chosen ?? ""}
                  disabled={!permissions.includes("workflows.reassign")}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  <option value="">Unassigned / Manual</option>
                  {options.users
                    .filter((u) => u.status === "Active" && u.role.active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {name(u)}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field
              label={
                ["Return", "Skip", "Reopen"].includes(action)
                  ? "Reason / Comment *"
                  : "Optional Comment"
              }
            >
              <textarea
                name="comment"
                maxLength={2000}
                required={["Return", "Skip", "Reopen"].includes(action)}
              />
            </Field>
            <button
              type="button"
              className="text-button"
              onClick={() => setAction("")}
            >
              Cancel
            </button>
          </MutationForm>
        </section>
      )}
      <section className="card detail-card">
        <h2>Workflow</h2>
        <ol className="workflow-stage-list">
          {w.stages.map((s) => (
            <li
              key={s.id}
              aria-current={s.state === "Current" ? "step" : undefined}
            >
              <span aria-hidden="true">
                {
                  {
                    Completed: "✓",
                    Current: "●",
                    Skipped: "↷",
                    NotStarted: "○",
                  }[s.state]
                }
              </span>
              <div>
                <strong>{s.name}</strong>
                <small>
                  {s.state.replace("NotStarted", "Not Started")} · {s.category}
                  {s.required ? "" : " · Optional"}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </section>
      {w.lastMove && (
        <section className="card detail-card">
          <h2>Last Move</h2>
          <p>
            {stamp(w.lastMove.movedAt)} ·{" "}
            {w.lastMove.fromStage?.name ?? "Start"} → {w.lastMove.toStage.name}{" "}
            · {w.lastMove.movementType}
          </p>
          <p>
            Moved by {name(w.lastMove.movedBy)} · Assigned to{" "}
            {name(w.lastMove.toUser)}
          </p>
        </section>
      )}
      <section className="card detail-card">
        <h2>Workflow History</h2>
        <p className="muted small">Times shown in {timezone}.</p>
        <ol className="workflow-history">
          {w.movements.map((m) => (
            <li key={m.id}>
              <div className="section-heading">
                <strong>
                  {m.fromStage?.name ?? "Start"} → {m.toStage.name}
                </strong>
                <span className="pill">{m.movementType}</span>
              </div>
              <p>
                From {name(m.fromUser)} → To {name(m.toUser)}
              </p>
              <p className="muted small">
                Moved by {name(m.movedBy)} ·{" "}
                <time dateTime={m.movedAt}>{stamp(m.movedAt)}</time>
              </p>
              {m.comment && <p className="workflow-comment">{m.comment}</p>}
            </li>
          ))}
        </ol>
        <h3>Stage Visits</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Owner</th>
                <th>Entered</th>
                <th>Exited</th>
                <th>Exit</th>
                <th>Duration (hours)</th>
              </tr>
            </thead>
            <tbody>
              {w.visits.map((v) => (
                <tr key={v.id}>
                  <td>{v.stage.name}</td>
                  <td>{name(v.assignedUser)}</td>
                  <td>{stamp(v.enteredAt)}</td>
                  <td>{stamp(v.exitedAt)}</td>
                  <td>{v.exitType ?? "Open"}</td>
                  <td>
                    {v.exitedAt
                      ? (
                          (Date.parse(v.exitedAt) - Date.parse(v.enteredAt)) /
                          3600000
                        ).toFixed(2)
                      : "In progress"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>
            {w.total} movements · {w.visitTotal} visit segments · Page {w.page}
          </span>
          {w.page > 1 && (
            <Link href={`?tab=workflow&page=${w.page - 1}`}>Previous</Link>
          )}
          {w.page * 25 < Math.max(w.total, w.visitTotal) && (
            <Link href={`?tab=workflow&page=${w.page + 1}`}>Next</Link>
          )}
        </div>
      </section>
    </>
  );
}
