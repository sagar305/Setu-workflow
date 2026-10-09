"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "../form";
import { getJson } from "./actions";
import type { allocationOptions } from "@/lib/allocations";
import type { Serialized } from "../clients/types";
type Options = Serialized<Awaited<ReturnType<typeof allocationOptions>>>;
type Draft = {
  engagementId: string;
  assignedUserId: string;
  engagementWorkflowStageId: string;
  allocationDate: string;
  allocatedHours: number;
  priority: string;
  description: string;
  allocationNote: string;
  status: string;
};
type Preview = {
  items: {
    engagement: string;
    employee: string;
    date: string;
    hours: number;
  }[];
  warnings: { kind: string; message: string }[];
};
export function CreateAllocation({
  engagementId,
  today,
  assignedUserId,
  label = "+ Allocate Work",
}: {
  engagementId?: string;
  today: string;
  assignedUserId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<Options>();
  const [selected, setSelected] = useState(engagementId ?? "");
  const [choices, setChoices] = useState<
    { id: string; engagementName: string; status: string }[]
  >([]);
  const [searched, setSearched] = useState(false);
  const [dates, setDates] = useState([{ date: today, hours: "" }]);
  const [rows, setRows] = useState<Draft[]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [ack, setAck] = useState(false);
  async function choose(eid: string) {
    setSelected(eid);
    setError("");
    setOptions(undefined);
    if (eid)
      try {
        const result = await getJson<Options>(
          `/api/allocations/${eid}/options`,
        );
        if (["Completed", "Cancelled"].includes(result.engagement.status)) {
          throw new Error(
            `${result.engagement.engagementName} is ${result.engagement.status.toLowerCase()}. Select an open engagement to allocate work.`,
          );
        }
        setOptions(result);
      } catch (e) {
        setError((e as Error).message);
      }
  }
  async function send(path: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, acknowledgeBudget: ack }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (path.endsWith("preview")) setPreview(d);
      else {
        setRows([]);
        setPreview(undefined);
        setOpen(false);
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card detail-card">
      <button
        className="button primary"
        onClick={() => {
          setOpen(!open);
          if (!open && engagementId) void choose(engagementId);
        }}
      >
        {label}
      </button>
      {open && (
        <>
          <h2>Allocate Work</h2>
          <p className="muted">
            Choose explicit dates and planned hours. Add multiple engagements to
            the batch, then preview before saving.
          </p>
          {!engagementId && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                try {
                  const d = await getJson<{
                    items: {
                      id: string;
                      engagementName: string;
                      status: string;
                    }[];
                  }>(
                    `/api/engagements?scope=all&q=${encodeURIComponent(String(new FormData(e.currentTarget).get("search") ?? ""))}`,
                  );
                  setChoices(d.items);
                  setSearched(true);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Field label="Find Engagement">
                <input name="search" placeholder="Name or code" />
              </Field>
              <button className="button secondary">Search Engagements</button>
              <Field label="Engagement">
                <select
                  value={selected}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="">Select engagement</option>
                  {choices.map((e) => (
                    <option
                      value={e.id}
                      key={e.id}
                      disabled={["Completed", "Cancelled"].includes(e.status)}
                    >
                      {e.engagementName} — {e.status}
                    </option>
                  ))}
                </select>
              </Field>
              <small>
                Search returns up to 25 permitted engagements. Completed and
                cancelled engagements are shown but cannot receive new
                allocations.
              </small>
              {searched && choices.length === 0 && (
                <p role="status">
                  No matching engagements found. Try the client name, engagement
                  name or code, or clear the search to browse.
                </p>
              )}
              {searched &&
                choices.length > 0 &&
                choices.every((e) =>
                  ["Completed", "Cancelled"].includes(e.status),
                ) && (
                  <p role="status">
                    All matching engagements are completed or cancelled. Reopen
                    the relevant engagement through its engagement/workflow
                    controls, or select another engagement.
                  </p>
                )}
            </form>
          )}
          {options && (
            <form
              key={selected}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const extra = dates.map((d) => ({
                  engagementId: selected,
                  assignedUserId: String(f.get("assignedUserId")),
                  engagementWorkflowStageId: String(f.get("stage") ?? ""),
                  allocationDate: d.date,
                  allocatedHours: Number(d.hours),
                  priority: String(f.get("priority")),
                  description: String(f.get("description") ?? ""),
                  allocationNote: String(f.get("note") ?? ""),
                  status: String(f.get("status")),
                }));
                setRows([...rows, ...extra]);
                setPreview(undefined);
                setAck(false);
                setDates([{ date: today, hours: "" }]);
              }}
            >
              <div className="form-grid">
                <Field label="Assign To">
                  <select name="assignedUserId" required defaultValue={options.users.some(u => u.id === assignedUserId) ? assignedUserId : ""}>
                    <option value="">Select employee</option>
                    {options.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Workflow Stage (optional)">
                  <select name="stage">
                    <option value="">Engagement level</option>
                    {options.workflow?.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Priority">
                  <select name="priority" defaultValue="Normal">
                    {["Low", "Normal", "High", "Urgent"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Initial Status">
                  <select name="status">
                    <option>Assigned</option>
                    <option>Planned</option>
                  </select>
                </Field>
                <Field label="Description">
                  <input name="description" maxLength={1000} />
                </Field>
                <Field label="Notes">
                  <textarea name="note" maxLength={2000} />
                </Field>
              </div>
              {dates.map((d, i) => (
                <div className="allocation-date-row" key={i}>
                  <Field label={`Allocation Date ${i + 1}`}>
                    <input
                      type="date"
                      required
                      value={d.date}
                      onChange={(e) =>
                        setDates(
                          dates.map((v, n) =>
                            n === i ? { ...v, date: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label={`Allocated Hours ${i + 1}`}>
                    <input
                      type="number"
                      min="0.01"
                      max="999999.99"
                      step="0.01"
                      required
                      value={d.hours}
                      onChange={(e) =>
                        setDates(
                          dates.map((v, n) =>
                            n === i ? { ...v, hours: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </Field>
                  {dates.length > 1 && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setDates(dates.filter((_, n) => n !== i))}
                    >
                      Remove date {i + 1}
                    </button>
                  )}
                </div>
              ))}
              <div className="actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setDates([...dates, { date: "", hours: "" }])}
                >
                  Add Another Date
                </button>
                <button
                  className="button secondary"
                  disabled={rows.length + dates.length > 100}
                >
                  Add to Batch
                </button>
              </div>
            </form>
          )}
          {!!rows.length && (
            <>
              <h3>Batch · {rows.length} allocations</h3>
              <p>
                {rows.reduce((s, r) => s + r.allocatedHours, 0).toFixed(2)}{" "}
                planned hours. Hours are entered separately for every dated
                record.
              </p>
              {rows.map((r, i) => (
                <p key={i}>
                  {r.allocationDate} · {r.allocatedHours}h{" "}
                  <button
                    className="text-button"
                    onClick={() => {
                      setRows(rows.filter((_, n) => n !== i));
                      setPreview(undefined);
                    }}
                  >
                    Remove row {i + 1}
                  </button>
                </p>
              ))}
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => send("/api/allocations/preview")}
              >
                Preview Allocations
              </button>
            </>
          )}
          {preview && (
            <section className="allocation-editor">
              <h3>Review Allocations</h3>
              {preview.items.map((r, i) => (
                <p key={i}>
                  {r.engagement} → {r.employee} · {r.date.slice(0, 10)} ·{" "}
                  {r.hours}h
                </p>
              ))}
              {preview.warnings.map((w, i) => (
                <p role="status" className="notice" key={i}>
                  {w.message}
                </p>
              ))}
              {preview.warnings.some((w) => w.kind === "budget") && (
                <label>
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                  />{" "}
                  I acknowledge the planned allocation above engagement budget.
                </label>
              )}
              <button
                className="button primary"
                disabled={
                  busy ||
                  (preview.warnings.some((w) => w.kind === "budget") && !ack)
                }
                onClick={() => send("/api/allocations")}
              >
                Confirm Allocations
              </button>
            </section>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
