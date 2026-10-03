"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Field, MutationForm } from "@/components/form";
import { OWNER_TYPES, CATEGORIES } from "@/lib/workflow-validation";
import type { z } from "zod";
import type { templateInput } from "@/lib/workflow-validation";
import type { templateOptions, getTemplate } from "@/lib/workflow-templates";
import type { Serialized } from "../clients/types";
type Options = Awaited<ReturnType<typeof templateOptions>>;
type Template = Serialized<Awaited<ReturnType<typeof getTemplate>>>;
type Stage = z.infer<typeof templateInput>["stages"][number];
const emptyStage = (name = ""): Stage => ({
  name,
  description: "",
  category: "Other",
  defaultOwnerType: "Manual",
  specificUserId: null,
  targetDays: null,
  instructions: "",
  required: true,
  isStart: false,
  isCompletion: false,
  active: true,
});
export function TemplateEditor({
  record,
  options,
  permissions,
}: {
  record?: Template;
  options: Options;
  permissions: string[];
}) {
  const router = useRouter(),
    [stages, setStages] = useState<Stage[]>(
      record?.stages ?? [
        { ...emptyStage("Assigned"), isStart: true, category: "Queue" },
        {
          ...emptyStage("Complete"),
          isCompletion: true,
          category: "Completion",
        },
      ],
    );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [publish, setPublish] = useState(false);
  const editable = record
    ? record.status === "Draft" &&
      permissions.includes("workflow_templates.edit")
    : permissions.includes("workflow_templates.create");
  const update = (index: number, patch: Partial<Stage>) =>
    setStages(stages.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const action = async (action: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/templates/${record!.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: record!.revision }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      router.push(`/templates/${data.id}`);
      router.refresh();
      setPublish(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link href="/templates" className="back-link">
        ← Workflow Templates
      </Link>
      <div className="page-heading">
        <p className="eyebrow">WORKFLOW BLUEPRINT</p>
        <h1>
          {record
            ? `${record.name} · V${record.versionNumber}`
            : "New Workflow Template"}
        </h1>
        <p className="muted">
          {record?.status ?? "Draft"} · Published versions preserve their
          definition.
        </p>
      </div>
      {record && (
        <div className="actions workflow-actions">
          {record.status === "Draft" &&
            permissions.includes("workflow_templates.publish") && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => setPublish(true)}
              >
                Publish
              </button>
            )}
          {record.status !== "Draft" &&
            permissions.includes("workflow_templates.edit") && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => action("version")}
              >
                Create New Version
              </button>
            )}
          {permissions.includes("workflow_templates.create") && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => action("duplicate")}
            >
              Duplicate Template
            </button>
          )}
          {record.status !== "Archived" &&
            permissions.includes("workflow_templates.archive") && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => action("archive")}
              >
                Archive
              </button>
            )}
        </div>
      )}
      {publish && (
        <section className="card detail-card">
          <h2>Publish this version?</h2>
          <p>
            Once published, this version will be preserved for historical
            consistency. Future changes will create a new version.
          </p>
          <p>Save any draft changes before publishing.</p>
          <button
            disabled={busy}
            className="button primary"
            onClick={() => action("publish")}
          >
            Confirm Publish
          </button>
          <button
            className="button secondary"
            onClick={() => setPublish(false)}
          >
            Cancel
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            const r = await fetch(
              `/api/templates${record ? "/" + record.id : ""}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...data,
                  revision: record?.revision,
                  stages,
                }),
              },
            );
            const result = await r.json();
            if (!r.ok) throw Error(result.error);
            router.push(`/templates/${result.id}`);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={!editable || busy}>
          <section className="card client-form-section">
            <h2>Template Information</h2>
            <div className="form-grid">
              <Field label="Template Name *">
                <input
                  name="name"
                  required
                  maxLength={150}
                  defaultValue={record?.name}
                />
              </Field>
              <Field label="Service Line *">
                <select
                  name="serviceLineId"
                  required
                  defaultValue={record?.serviceLineId ?? ""}
                >
                  <option value="">Select service</option>
                  {options.serviceLines.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Engagement Type">
                <select
                  name="engagementTypeId"
                  defaultValue={record?.engagementTypeId ?? ""}
                >
                  <option value="">Any compatible type</option>
                  {options.types.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Description">
                <textarea
                  name="description"
                  maxLength={4000}
                  defaultValue={record?.description}
                />
              </Field>
            </div>
          </section>
          <section className="card client-form-section">
            <h2>Stages</h2>
            <p className="muted">
              Mark the first stage as Start and the last as Completion. Use
              arrows to reorder.
            </p>
            {stages.map((s, i) => (
              <div className="workflow-stage-editor" key={i}>
                <div className="section-heading">
                  <h3>
                    {i + 1}. {s.name || "New stage"}
                  </h3>
                  {editable && (
                    <div className="actions">
                      <button
                        type="button"
                        className="button secondary"
                        aria-label={`Move stage ${i + 1} up`}
                        disabled={i === 0}
                        onClick={() => {
                          const next = [...stages];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          setStages(next);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        aria-label={`Move stage ${i + 1} down`}
                        disabled={i === stages.length - 1}
                        onClick={() => {
                          const next = [...stages];
                          [next[i + 1], next[i]] = [next[i], next[i + 1]];
                          setStages(next);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          setStages(stages.filter((_, j) => j !== i))
                        }
                      >
                        Remove Stage {i + 1}
                      </button>
                    </div>
                  )}
                </div>
                <div className="form-grid">
                  <Field label={`Stage ${i + 1} Name *`}>
                    <input
                      required
                      maxLength={150}
                      value={s.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </Field>
                  <Field label={`Stage ${i + 1} Category`}>
                    <select
                      value={s.category}
                      onChange={(e) =>
                        update(i, {
                          category: e.target.value as Stage["category"],
                        })
                      }
                    >
                      {CATEGORIES.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Stage ${i + 1} Default Owner`}>
                    <select
                      value={s.defaultOwnerType}
                      onChange={(e) =>
                        update(i, {
                          defaultOwnerType: e.target
                            .value as Stage["defaultOwnerType"],
                          specificUserId: null,
                        })
                      }
                    >
                      {OWNER_TYPES.map((v) => (
                        <option key={v} value={v}>
                          {v === "Manual"
                            ? "Unassigned / Manual"
                            : v === "SpecificUser"
                              ? "Specific User"
                              : `Engagement ${v}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {s.defaultOwnerType === "SpecificUser" && (
                    <Field label={`Stage ${i + 1} Specific User`}>
                      <select
                        required
                        value={s.specificUserId ?? ""}
                        onChange={(e) =>
                          update(i, { specificUserId: e.target.value })
                        }
                      >
                        <option value="">Select owner</option>
                        {options.users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label={`Stage ${i + 1} Target Days`}>
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      value={s.targetDays ?? ""}
                      onChange={(e) =>
                        update(i, {
                          targetDays:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label={`Stage ${i + 1} Description`}>
                    <textarea
                      maxLength={2000}
                      value={s.description}
                      onChange={(e) =>
                        update(i, { description: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={`Stage ${i + 1} Instructions`}>
                    <textarea
                      maxLength={4000}
                      value={s.instructions}
                      onChange={(e) =>
                        update(i, { instructions: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="actions">
                  {(
                    ["required", "isStart", "isCompletion", "active"] as const
                  ).map((k) => (
                    <label key={k}>
                      <input
                        type="checkbox"
                        checked={s[k]}
                        onChange={(e) => update(i, { [k]: e.target.checked })}
                      />{" "}
                      {
                        {
                          required: "Required",
                          isStart: "Start",
                          isCompletion: "Completion",
                          active: "Active",
                        }[k]
                      }
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {editable && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setStages([...stages, emptyStage()])}
              >
                + Add Stage
              </button>
            )}
          </section>
        </fieldset>
        {editable && (
          <button disabled={busy} className="button primary">
            {busy ? "Saving…" : "Save Draft"}
          </button>
        )}
      </form>
      {record?.status === "Published" &&
        permissions.includes("engagements.configure") && (
          <section className="card detail-card">
            <h2>Default for Engagement Type</h2>
            <p className="muted">
              Preselect this published version when creating compatible
              Engagements. Users can choose another template.
            </p>
            {options.types
              .filter(
                (t) =>
                  (!record.engagementTypeId ||
                    t.id === record.engagementTypeId) &&
                  (!t.serviceLineId ||
                    t.serviceLineId === record.serviceLineId),
              )
              .map((t) => (
                <MutationForm
                  key={t.id}
                  endpoint={`/api/templates/default/${t.id}`}
                  label={
                    t.defaultWorkflowTemplateId === record.id
                      ? `Clear default for ${t.name}`
                      : `Use as default for ${t.name}`
                  }
                  transform={() => ({
                    templateId:
                      t.defaultWorkflowTemplateId === record.id
                        ? null
                        : record.id,
                  })}
                >
                  <span>{t.name}</span>
                </MutationForm>
              ))}
          </section>
        )}
    </>
  );
}
