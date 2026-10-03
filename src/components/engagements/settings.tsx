"use client";
import { useState } from "react";
import Link from "next/link";
import { MutationForm, Field } from "@/components/form";
import { TextField } from "@/components/clients/fields";
import { FIELD_TYPES } from "@/lib/client-constants";
import type { EngagementOptions, EngagementRights } from "./types";
export function EngagementSettings({
  options,
  rights,
}: {
  options: EngagementOptions;
  rights: EngagementRights;
}) {
  const [kind, setKind] = useState<"types" | "fields">(
    rights.configure ? "types" : "fields",
  );
  const [editing, setEditing] = useState<string | null>(null);
  const record = (kind === "types" ? options.types : options.definitions).find(
    (r) => r.id === editing,
  );
  const def = options.definitions.find((r) => r.id === editing);
  const type = options.types.find((r) => r.id === editing);
  return (
    <>
      <Link className="back-link" href="/engagements">
        ← Engagements
      </Link>
      <div className="page-heading">
        <p className="eyebrow">FIRM CONFIGURATION</p>
        <h1>Engagement settings</h1>
      </div>
      <nav className="tabs">
        {rights.configure && (
          <button
            className={kind === "types" ? "active" : ""}
            onClick={() => {
              setKind("types");
              setEditing(null);
            }}
          >
            Engagement Types
          </button>
        )}
        {rights.fields && (
          <button
            className={kind === "fields" ? "active" : ""}
            onClick={() => {
              setKind("fields");
              setEditing(null);
            }}
          >
            Custom Fields
          </button>
        )}
      </nav>
      <section className="card detail-card">
        <div className="section-heading">
          <h2>{kind === "types" ? "Engagement Types" : "Custom Fields"}</h2>
          <button className="button primary" onClick={() => setEditing("new")}>
            {kind === "types" ? "Add Engagement Type" : "Add Custom Field"}
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>{kind === "types" ? "Service" : "Type / Choices"}</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(kind === "types" ? options.types : options.definitions).map(
                (r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>
                      {"fieldType" in r
                        ? `${r.fieldType} ${r.options.join(", ")}`
                        : (options.serviceLines.find(
                            (s) => s.id === r.serviceLineId,
                          )?.name ?? "Not linked")}
                    </td>
                    <td>{r.active ? "Active" : "Inactive"}</td>
                    <td>
                      <button
                        className="button secondary"
                        onClick={() => setEditing(r.id)}
                      >
                        Edit {r.name}
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <section className="card detail-card spaced">
          <h2>
            {record ? "Edit" : "Add"}{" "}
            {kind === "types" ? "Engagement Type" : "Custom Field"}
          </h2>
          <MutationForm
            key={kind + editing}
            endpoint={`/api/engagements/configuration/${kind}${record ? "/" + record.id : ""}`}
            onSaved={() => setEditing(null)}
            transform={(data, form) => ({
              ...data,
              active: form.has("active"),
              ...(kind === "fields"
                ? {
                    fieldType: def?.fieldType ?? data.fieldType,
                    options: String(data.options ?? "")
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }
                : {}),
            })}
          >
            <TextField name="name" label="Name" value={record?.name} required />
            {kind === "types" ? (
              <Field label="Service Line">
                <select
                  name="serviceLineId"
                  defaultValue={type?.serviceLineId ?? ""}
                >
                  <option value="">Not linked</option>
                  {options.serviceLines
                    .filter((s) => s.active || s.id === type?.serviceLineId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Field Type">
                  <select
                    name="fieldType"
                    disabled={Boolean(def)}
                    defaultValue={def?.fieldType ?? "Text"}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Dropdown choices">
                  <textarea
                    name="options"
                    defaultValue={def?.options.join("\n")}
                    placeholder="One choice per line"
                  />
                </Field>
              </>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                name="active"
                defaultChecked={record?.active ?? true}
              />
              Active
            </label>
            <p className="muted small">
              Deactivation preserves historical records. Existing field types
              and used dropdown choices are protected.
            </p>
          </MutationForm>
          <button className="button secondary" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </section>
      )}
    </>
  );
}
