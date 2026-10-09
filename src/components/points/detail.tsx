"use client";
import Link from "next/link";
import { MutationForm, Field } from "../form";
import { PointFieldsForm, readFields, person } from "./fields";
import { pointLabel } from "@/lib/point-validation";
import type { getPoint, pointOptions } from "@/lib/points";
import type { Serialized } from "../clients/types";
type Data = Serialized<Awaited<ReturnType<typeof getPoint>>>;
const stamp = (v: string | null) =>
  v ? `${v.slice(0, 10)} ${v.slice(11, 19)} UTC` : "—";
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
function History({ data }: { data: Data }) {
  return (
    <section>
      <h2>Status and activity history</h2>
      {data.history.map((h) => {
        const m = object(h.metadata),
          before = object(m.before),
          after = object(m.after);
        return (
          <details key={h.id}>
            <summary>
              {h.action.replace("point.", "").replaceAll("_", " ")} ·{" "}
              {person(h.actor)} · {stamp(h.timestamp)}
            </summary>
            {before.status !== after.status && (
              <p>
                Status: {String(before.status ?? "New")} →{" "}
                {String(after.status ?? "")}
              </p>
            )}
            {before.assignedToUserId !== after.assignedToUserId && (
              <p>
                Assigned to:{" "}
                {String(object(before.assignedTo).firstName ?? "Unassigned")}{" "}
                {String(object(before.assignedTo).lastName ?? "")} →{" "}
                {String(object(after.assignedTo).firstName ?? "")}{" "}
                {String(object(after.assignedTo).lastName ?? "")}
              </p>
            )}
            {typeof m.reason === "string" && <p>Reason: {m.reason}</p>}
            {[
              "title",
              "description",
              "priority",
              "audience",
              "blocking",
              "referenceNumber",
              "referenceAmount",
              "priorYearAmount",
              "dueDate",
            ]
              .filter((k) => before[k] !== after[k])
              .map((k) => (
                <p key={k}>
                  {pointLabel(k)}: {String(before[k] ?? "—")} →{" "}
                  {String(after[k] ?? "—")}
                </p>
              ))}
            {after.resolvedAt !== before.resolvedAt &&
              after.resolvedAt != null && (
                <p>Resolved at: {stamp(String(after.resolvedAt))}</p>
              )}
          </details>
        );
      })}
    </section>
  );
}
export function PointDetail({
  data,
  options,
}: {
  data: Data;
  options: Awaited<ReturnType<typeof pointOptions>>;
}) {
  const p = data.point,
    info = p.pointType === "KnowledgeInstruction",
    terminal = ["Resolved", "Closed", "Archived"].includes(p.status),
    can = (key: string) => data.permissions.includes(`points.${key}`),
    endpoint = `/api/points/${p.id}`;
  const action = (kind: "resolve" | "reopen" | "close", label: string) => (
    <MutationForm
      key={kind}
      endpoint={endpoint}
      label={label}
      transform={(d) => ({ ...d, action: kind, revision: p.revision })}
    >
      <Field label={`${label} reason`}>
        <textarea name="reason" required maxLength={4000} />
      </Field>
    </MutationForm>
  );
  return (
    <>
      <Link
        className="back-link"
        href={`/engagements/${p.engagementId}?tab=queries`}
      >
        ← Engagement Queries
      </Link>
      <div className="page-heading">
        <p className="eyebrow">{p.pointNumber}</p>
        <h1>{p.title}</h1>
        <p>
          {p.engagement.client.displayName} · {p.engagement.engagementName}
        </p>
      </div>
      <section className="card detail-card">
        <p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p>
        <dl className="client-details">
          {Object.entries({
            Type: pointLabel(p.pointType),
            Status: pointLabel(p.status),
            Priority: p.priority,
            "Raised by": person(p.raisedBy),
            "Assigned to": person(p.assignedTo),
            "Created at": stamp(p.createdAt),
            "Due date": p.dueDate?.slice(0, 10) ?? "—",
            Age:
              p.age === null
                ? "Not currently aging"
                : `${p.age} calendar days (${data.timezone})`,
            Blocking: p.blocking ? "Yes" : "No",
            Classification: pointLabel(p.audience),
            "Reference number": p.referenceNumber || "—",
            "Reference amount": p.referenceAmount ?? "—",
            "Prior-year amount": p.priorYearAmount ?? "—",
            "Resolved by": person(p.resolvedBy),
            "Resolved at": stamp(p.resolvedAt),
            "Closed / archived at": stamp(p.closedAt),
          }).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>
          Stage:{" "}
          {p.stage ? (
            <Link href={`/engagements/${p.engagementId}?tab=workflow`}>
              {p.stage.name}
            </Link>
          ) : (
            "Engagement-wide"
          )}{" "}
          · Checklist:{" "}
          {p.checklistItem ? (
            <Link href={`/engagements/${p.engagementId}?tab=checklist`}>
              {p.checklistItem.itemTitle}
            </Link>
          ) : (
            "None"
          )}
        </p>
        {p.overdue && <p className="notice error">This point is overdue.</p>}
      </section>
      <section className="card detail-card">
        <h2>Conversation</h2>
        {data.responses.length === 0 && <p>No responses yet.</p>}
        {data.responses.map((r) => (
          <article key={r.id} className="detail-card">
            <p>
              <strong>{person(r.author)}</strong> · {stamp(r.createdAt)}
            </p>
            {r.parent && (
              <blockquote>
                Reply to {person(r.parent.author)}:{" "}
                {r.parent.commentText.slice(0, 200)}
              </blockquote>
            )}
            <p style={{ whiteSpace: "pre-wrap" }}>{r.commentText}</p>
          </article>
        ))}
        {!terminal && can("reply") && (
          <MutationForm
            endpoint={endpoint}
            label="Send reply"
            transform={(d) => ({
              ...d,
              action: "reply",
              revision: p.revision,
              markResponded: d.markResponded === "on",
            })}
          >
            <Field label="Reply to">
              <select name="parentCommentId">
                <option value="">Point (new response)</option>
                {data.responses.map((r) => (
                  <option key={r.id} value={r.id}>
                    {person(r.author)} — {r.commentText.slice(0, 80)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Response">
              <textarea name="commentText" required maxLength={8000} rows={4} />
            </Field>
            {!info && (
              <label>
                <input name="markResponded" type="checkbox" defaultChecked />{" "}
                Mark Responded (does not resolve)
              </label>
            )}
          </MutationForm>
        )}
      </section>
      <section className="card detail-card">
        <h2>Point actions</h2>
        {!info &&
          !terminal &&
          can("resolve") &&
          action("resolve", "Resolve Point")}
        {terminal &&
          can("reopen") &&
          action("reopen", info ? "Reactivate Instruction" : "Reopen Point")}
        {can("close") &&
          (info ? p.status === "Active" : p.status === "Resolved") &&
          action("close", info ? "Archive Instruction" : "Close Point")}
        {!terminal && !info && can("edit") && (
          <details>
            <summary>Change status</summary>
            <MutationForm
              endpoint={endpoint}
              label="Change status"
              transform={(d) => ({
                ...d,
                action: "status",
                revision: p.revision,
              })}
            >
              <Field label="New status">
                <select name="status" defaultValue="ClarificationRequired">
                  {["Open", "Responded", "ClarificationRequired"].map((s) => (
                    <option key={s} value={s}>
                      {pointLabel(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status change reason">
                <textarea name="reason" required maxLength={4000} />
              </Field>
            </MutationForm>
          </details>
        )}
        {can("assign") && (
          <details>
            <summary>Reassign point</summary>
            <MutationForm
              endpoint={endpoint}
              label="Confirm reassignment"
              transform={(d) => ({
                ...d,
                action: "assign",
                revision: p.revision,
              })}
            >
              <Field label="New assignee">
                <select
                  name="assignedToUserId"
                  required
                  defaultValue={p.assignedToUserId}
                >
                  {options.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {person(u)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reassignment reason">
                <textarea name="reason" required maxLength={4000} />
              </Field>
            </MutationForm>
          </details>
        )}
        {!terminal && can("edit") && (
          <details>
            <summary>Edit point</summary>
            <MutationForm
              endpoint={endpoint}
              label="Save point"
              transform={(d) => ({
                action: "edit",
                revision: p.revision,
                reason: d.reason,
                fields: readFields(d),
              })}
            >
              <PointFieldsForm
                options={options}
                info={info}
                value={{ ...p, dueDate: p.dueDate?.slice(0, 10) ?? null }}
              />
              <Field label="Edit reason">
                <textarea name="reason" required maxLength={4000} />
              </Field>
            </MutationForm>
          </details>
        )}
      </section>
      <section className="card detail-card">
        <h2>Attachments</h2>
        <p className="notice">
          Persistent secure storage is not configured. Point and response
          uploads/downloads are unavailable.
        </p>
        {can("attach") && (
          <button className="button secondary" disabled>
            Attach file — unavailable
          </button>
        )}
        {data.attachments.map((a) => (
          <p key={a.id}>
            {a.fileName} · {a.byteSize} bytes{" "}
            {a.responseId ? "(Response attachment)" : ""}
          </p>
        ))}
      </section>
      <section className="card detail-card">
        <History data={data} />
        <p>
          Page {data.page} · {data.responseCount} responses ·{" "}
          {data.historyCount} activity events. Responses oldest first; history
          newest first.
        </p>
        <div className="actions">
          {data.page > 1 && (
            <Link href={`?page=${data.page - 1}`}>
              Previous conversation/history
            </Link>
          )}
          {Math.max(data.responseCount, data.historyCount) > data.page * 25 && (
            <Link href={`?page=${data.page + 1}`}>
              Next conversation/history
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
