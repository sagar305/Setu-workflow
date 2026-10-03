import { z } from "zod";
import { id } from "./validation";
import {
  CLIENT_STATUSES,
  CONTACT_TYPES,
  FIELD_TYPES,
} from "./client-constants";
const text = (max = 250) => z.string().trim().max(max).default("");
const nullableId = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  id.nullable(),
);
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date.");
const optionalDate = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  dateOnly.nullable(),
);
const optionalNumber = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().int().nullable(),
);
export const addressInput = z.object({
  addressLine1: text(),
  addressLine2: text(),
  city: text(100),
  stateProvince: text(100),
  postalCode: text(30),
  country: text(100),
});
const contactBase = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  jobTitle: text(100),
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().email().max(254)])
    .default(""),
  phone: text(50),
  mobile: text(50),
  contactType: z.enum(CONTACT_TYPES).default("Other"),
  isPrimary: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: text(2000),
});
export const primaryContactInput = contactBase.extend({
  email: z.string().trim().toLowerCase().min(1, 'Primary contact email is required.').email('Enter a valid primary contact email.').max(254),
  phone: z.string().trim().min(1, 'Primary contact phone is required.').max(50)
    .refine(v => (v.match(/\d/g) ?? []).length >= 6, 'Enter a phone number with at least six digits.'),
});
export const contactInput = contactBase.superRefine((value, ctx) => {
  if (value.isPrimary && value.active) {
    const result = primaryContactInput.safeParse(value);
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({...issue});
  }
});
export const clientInput = z
  .object({
    clientCode: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
        "Use letters, digits, dots, slashes, underscores or hyphens.",
      )
      .transform((v) => v.toUpperCase()),
    legalName: z.string().trim().min(1).max(250),
    displayName: text(),
    entityTypeId: id,
    status: z.enum(CLIENT_STATUSES),
    primaryOfficeId: id,
    responsiblePartnerId: nullableId,
    responsibleManagerId: nullableId,
    industry: text(100),
    website: text(500).refine(
      (v) => !v || (/^https?:\/\//i.test(v) && URL.canParse(v)),
      "Website must be an http or https URL.",
    ),
    taxYearEndMonth: optionalNumber,
    taxYearEndDay: optionalNumber,
    onboardingDate: optionalDate,
    terminationDate: optionalDate,
    internalNotes: text(10000),
    address: addressInput.default({
      addressLine1: "",
      addressLine2: "",
      city: "",
      stateProvince: "",
      postalCode: "",
      country: "",
    }),
    serviceLineIds: z.array(id).max(100).default([]),
    customFields: z
      .record(
        id,
        z.union([
          z.string().max(4000),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .default({}),
    primaryContact: primaryContactInput.optional(),
    acknowledgeDuplicate: z.boolean().default(false),
    version: z.number().int().positive().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.taxYearEndDay === null) !== (v.taxYearEndMonth === null))
      ctx.addIssue({
        code: "custom",
        message: "Enter both year-end month and day.",
        path: ["taxYearEndDay"],
      });
    if (v.taxYearEndMonth !== null && v.taxYearEndDay !== null) {
      const d = new Date(
        Date.UTC(2000, v.taxYearEndMonth - 1, v.taxYearEndDay),
      );
      if (
        d.getUTCMonth() + 1 !== v.taxYearEndMonth ||
        d.getUTCDate() !== v.taxYearEndDay
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid tax year-end date.",
          path: ["taxYearEndDay"],
        });
    }
    if (
      v.onboardingDate &&
      v.terminationDate &&
      v.terminationDate < v.onboardingDate
    )
      ctx.addIssue({
        code: "custom",
        message: "Termination cannot be before onboarding.",
        path: ["terminationDate"],
      });
  });
export type ClientInput = z.infer<typeof clientInput>;
export const catalogInput = z.object({
  name: z.string().trim().min(1).max(100),
  active: z.boolean().default(true),
});
export const definitionInput = catalogInput
  .extend({
    fieldType: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  })
  .superRefine((v, ctx) => {
    if (
      v.fieldType === "Dropdown" &&
      (!v.options.length ||
        new Set(v.options.map((o) => o.toLowerCase())).size !==
          v.options.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Dropdown choices must be nonempty and unique.",
        path: ["options"],
      });
  });
export const listInput = z.object({
  q: text(200),
  status: z.union([z.literal(""), z.enum(CLIENT_STATUSES)]).default(""),
  entityTypeId: nullableId,
  serviceLineId: nullableId,
  officeId: nullableId,
  partnerId: nullableId,
  managerId: nullableId,
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  sort: z
    .enum([
      "clientCode",
      "legalName",
      "displayName",
      "status",
      "createdAt",
      "updatedAt",
    ])
    .default("displayName"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});
export type ClientFilters = z.infer<typeof listInput>;
