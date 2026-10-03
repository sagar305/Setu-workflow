import type { ClientCustomFieldDefinition } from "@prisma/client";
import { invariant } from "./errors";
import { dateOnly } from "./client-validation";
export function typedValue(
  def: ClientCustomFieldDefinition,
  value: string | number | boolean,
) {
  const blank = {
    textValue: null as string | null,
    numberValue: null as number | null,
    dateValue: null as Date | null,
    booleanValue: null as boolean | null,
  };
  switch (def.fieldType) {
    case "Text":
      invariant(typeof value === "string", `${def.name}: enter text.`);
      return { ...blank, textValue: value };
    case "Dropdown":
      invariant(
        typeof value === "string" && def.options.includes(value),
        `${def.name}: select a configured choice.`,
      );
      return { ...blank, textValue: value };
    case "Number":
      invariant(
        typeof value === "number" && Number.isFinite(value),
        `${def.name}: enter a number.`,
      );
      return { ...blank, numberValue: value };
    case "Boolean":
      invariant(typeof value === "boolean", `${def.name}: select Yes or No.`);
      return { ...blank, booleanValue: value };
    case "Date":
      invariant(
        typeof value === "string" && dateOnly.safeParse(value).success,
        `${def.name}: enter a valid date.`,
      );
      return { ...blank, dateValue: new Date(value + "T00:00:00Z") };
  }
}
