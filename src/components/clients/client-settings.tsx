"use client";
import { useState } from "react";
import Link from "next/link";
import { Field, MutationForm } from "@/components/form";
import { TextField } from "./fields";
import { FIELD_TYPES } from "@/lib/client-constants";
import type { ClientOptions, Rights } from "./types";
export function ClientSettings({
  options,
  rights,
}: {
  options: ClientOptions;
  rights: Rights;
}) {
  const [kind, setKind] = useState<"entities" | "services" | "fields">(
    rights.configure ? "entities" : "fields",
  );
  const [editing, setEditing] = useState<string | null>(null);
  const records =
    kind === "entities"
      ? options.entityTypes
      : kind === "services"
        ? options.serviceLines
        : options.definitions;
  const selected = records.find((r) => r.id === editing);
  const definition = options.definitions.find((d) => d.id === editing);
  return (
    <>
      <Link className="back-link" href="/clients">
        ← Clients
      </Link>
      <div className="page-heading">
        <p className="eyebrow">FIRM CONFIGURATION</p>
        <h1>Client settings</h1>
        <p className="muted">
          Maintain your firm’s client classifications and additional fields.
        </p>
      </div>
      <div className="tabs">
        {[
          ["entities", "Entity Types"],
          ["services", "Service Lines"],
          ["fields", "Custom Fields"],
        ]
          .filter(([k]) => (k === "fields" ? rights.fields : rights.configure))
          .map(([k, label]) => (
            <button
              key={k}
              className={kind === k ? "active" : ""}
              onClick={() => {
                setKind(k as typeof kind);
                setEditing(null);
              }}
            >
              {label}
            </button>
          ))}
      </div>
      <section className="card table-card">
        <div className="table-toolbar">
          <h2>
            {kind === "entities"
              ? "Entity Types"
              : kind === "services"
                ? "Service Lines"
                : "Custom Fields"}
          </h2>
          <button className="button primary" onClick={() => setEditing("new")}>
            Add{" "}
            {kind === "entities"
              ? "Entity Type"
              : kind === "services"
                ? "Service Line"
                : "Custom Field"}
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              {kind === "fields" && <th>Type / Choices</th>}
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                {kind === "fields" && (
                  <td>
                    {options.definitions.find((d) => d.id === r.id)?.fieldType}
                    <small>
                      {options.definitions
                        .find((d) => d.id === r.id)
                        ?.options.join(", ")}
                    </small>
                  </td>
                )}
                <td>
                  <span
                    className={`status ${r.active ? "active" : "inactive"}`}
                  >
                    {r.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td>
                  <button
                    className="button secondary"
                    onClick={() => setEditing(r.id)}
                  >
                    Edit {r.name}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {editing && (
        <section className="card client-form-section">
          <div className="editor-heading">
            <h2>
              {selected ? "Edit" : "Add"}{" "}
              {kind === "fields"
                ? "custom field"
                : kind === "entities"
                  ? "entity type"
                  : "service line"}
            </h2>
            <button
              className="button secondary"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
          <MutationForm
            key={`${kind}-${editing}`}
            endpoint={`/api/clients/configuration/${kind}${selected ? `/${selected.id}` : ""}`}
            onSaved={() => setEditing(null)}
            transform={(data, form) => ({
              ...data,
              active: form.has("active"),
              ...(kind === "fields"
                ? {
                    options: String(form.get("options") ?? "")
                      .split("\n")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  }
                : {}),
            })}
          >
            <TextField
              label="Name"
              name="name"
              value={selected?.name}
              required
              maxLength={100}
            />
            {kind === "fields" && (
              <>
                <Field label="Field Type">
                  <select
                    name="fieldType"
                    defaultValue={definition?.fieldType ?? "Text"}
                    disabled={!!definition}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t === "Boolean" ? "Yes / No" : t}
                      </option>
                    ))}
                  </select>
                </Field>
                {definition && (
                  <input
                    type="hidden"
                    name="fieldType"
                    value={definition.fieldType}
                  />
                )}
                <Field
                  label="Dropdown choices"
                  hint="One choice per line. Existing choices in use must be retained."
                >
                  <textarea
                    name="options"
                    rows={5}
                    defaultValue={definition?.options.join("\n") ?? ""}
                  />
                </Field>
              </>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                name="active"
                defaultChecked={selected?.active ?? true}
              />
              Active
            </label>
            <p className="muted small">
              Deactivation preserves existing client records and values.
            </p>
          </MutationForm>
        </section>
      )}
    </>
  );
}
