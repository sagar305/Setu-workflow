"use client";
import { Field } from "../form";
import {
  CHECKLIST_OWNERS,
  checklistDefinition,
} from "@/lib/checklist-validation";
import type { z } from "zod";
type Item = z.infer<typeof checklistDefinition>;
export function ChecklistDefinitions({
  items,
  onChange,
  users,
  editable,
}: {
  items: Item[];
  onChange: (items: Item[]) => void;
  users: { id: string; firstName: string; lastName: string }[];
  editable: boolean;
}) {
  const update = (index: number, patch: Partial<Item>) =>
    onChange(items.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  return (
    <fieldset disabled={!editable}>
      <legend>Stage checklist definitions</legend>
      <p className="muted">
        Copied as independent items when this version is applied. Due offsets
        use calendar days from workflow start.
      </p>
      {items.map((item, i) => (
        <details key={i} className="card detail-card">
          <summary>
            {i + 1}. {item.itemTitle || "New checklist item"}
          </summary>
          <div className="form-grid">
            {(
              [
                ["itemCode", "Item code"],
                ["itemTitle", "Item title"],
                ["description", "Description"],
                ["instructions", "Detailed instructions"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <textarea
                  value={item[key]}
                  required={key === "itemTitle"}
                  maxLength={
                    key === "itemTitle"
                      ? 200
                      : key === "itemCode"
                        ? 60
                        : key === "description"
                          ? 4000
                          : 8000
                  }
                  onChange={(e) => update(i, { [key]: e.target.value })}
                />
              </Field>
            ))}
            <Field label="Default owner">
              <select
                value={item.defaultOwnerType}
                onChange={(e) =>
                  update(i, {
                    defaultOwnerType: e.target
                      .value as Item["defaultOwnerType"],
                    specificUserId: null,
                  })
                }
              >
                {CHECKLIST_OWNERS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            {item.defaultOwnerType === "SpecificUser" && (
              <Field label="Specific employee">
                <select
                  required
                  value={item.specificUserId ?? ""}
                  onChange={(e) =>
                    update(i, { specificUserId: e.target.value })
                  }
                >
                  <option value="">Select employee</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Estimated hours">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={item.estimatedHours ?? ""}
                onChange={(e) =>
                  update(i, {
                    estimatedHours: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </Field>
            <Field label="Due days from workflow start">
              <input
                type="number"
                min="-3650"
                max="3650"
                value={item.relativeDueDays ?? ""}
                onChange={(e) =>
                  update(i, {
                    relativeDueDays: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </Field>
          </div>
          <div className="actions">
            {(["isRequired", "evidenceRequired", "active"] as const).map(
              (key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={item[key]}
                    onChange={(e) => update(i, { [key]: e.target.checked })}
                  />
                  {key === "isRequired"
                    ? "Required"
                    : key === "evidenceRequired"
                      ? "Evidence required"
                      : "Active"}
                </label>
              ),
            )}
            {editable && (
              <>
                <button
                  type="button"
                  className="button secondary"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...items];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    onChange(next);
                  }}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={i === items.length - 1}
                  onClick={() => {
                    const next = [...items];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    onChange(next);
                  }}
                >
                  Move down
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => onChange(items.filter((_, j) => i !== j))}
                >
                  Remove item
                </button>
              </>
            )}
          </div>
        </details>
      ))}
      {editable && (
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            onChange([
              ...items,
              checklistDefinition.parse({ itemTitle: "New checklist item" }),
            ])
          }
        >
          Add checklist item
        </button>
      )}
    </fieldset>
  );
}
