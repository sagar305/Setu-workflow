"use client";
import { Field } from "@/components/form";
import type { ClientOptions, ClientRecord } from "./types";
export function TextField({
  label,
  name,
  value,
  required,
  type = "text",
  maxLength = 250,
}: {
  label: string;
  name: string;
  value?: string | number | null;
  required?: boolean;
  type?: string;
  maxLength?: number;
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        maxLength={maxLength}
      />
    </Field>
  );
}
export function CustomInputs({
  definitions,
  values = [],
}: {
  definitions: ClientOptions["definitions"];
  values?: Pick<ClientRecord["customValues"][number], "definitionId" | "textValue" | "numberValue" | "dateValue" | "booleanValue">[];
}) {
  return (
    <div className="form-grid">
      {definitions
        .filter((d) => d.active)
        .map((d) => {
          const stored = values.find((v) => v.definitionId === d.id);
          const value =
            stored?.textValue ??
            stored?.numberValue ??
            stored?.dateValue?.slice(0, 10) ??
            stored?.booleanValue ??
            "";
          return (
            <Field label={d.name} key={d.id}>
              {d.fieldType === "Dropdown" || d.fieldType === "Boolean" ? (
                <select name={`custom.${d.id}`} defaultValue={String(value)}>
                  <option value="">Not set</option>
                  {d.fieldType === "Boolean" ? (
                    <>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </>
                  ) : (
                    d.options.map((o) => <option key={o}>{o}</option>)
                  )}
                </select>
              ) : (
                <input
                  name={`custom.${d.id}`}
                  type={
                    d.fieldType === "Number"
                      ? "number"
                      : d.fieldType === "Date"
                        ? "date"
                        : "text"
                  }
                  step={d.fieldType === "Number" ? "any" : undefined}
                  defaultValue={String(value)}
                  maxLength={4000}
                />
              )}
            </Field>
          );
        })}
    </div>
  );
}
export function customFormValues(
  form: FormData,
  definitions: ClientOptions["definitions"],
) {
  return Object.fromEntries(
    definitions
      .filter((d) => d.active)
      .map((d) => {
        const value = String(form.get(`custom.${d.id}`) ?? "");
        return [
          d.id,
          value === ""
            ? null
            : d.fieldType === "Number"
              ? Number(value)
              : d.fieldType === "Boolean"
                ? value === "true"
                : value,
        ];
      }),
  );
}
export function ServiceChoices({
  options,
  selected = [],
  disabled = false,
}: {
  options: ClientOptions["serviceLines"];
  selected?: string[];
  disabled?: boolean;
}) {
  return (
    <div className="service-choices">
      {options
        .filter((s) => s.active || selected.includes(s.id))
        .map((s) => (
          <label className="checkbox" key={s.id}>
            <input
              type="checkbox"
              name="serviceLineIds"
              value={s.id}
              defaultChecked={selected.includes(s.id)}
              disabled={disabled}
            />
            {s.name}
            {!s.active && " (inactive)"}
          </label>
        ))}
    </div>
  );
}
