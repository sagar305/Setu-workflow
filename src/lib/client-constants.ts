export const CLIENT_STATUSES = [
  "Prospect",
  "Onboarding",
  "Active",
  "OnHold",
  "Inactive",
  "Terminated",
] as const;
export const statusLabel = (value: string) =>
  value === "OnHold" ? "On Hold" : value;
export const ENTITY_TYPES = [
  "Individual",
  "Sole Proprietorship",
  "Partnership",
  "LLC",
  "S Corporation",
  "C Corporation",
  "Trust",
  "Estate",
  "Nonprofit",
  "Government",
  "Other",
];
export const SERVICE_LINES = [
  "CAS / Client Accounting Services",
  "Bookkeeping",
  "Month-End Close",
  "Tax",
  "Audit",
  "Review",
  "Compilation",
  "Payroll",
  "Sales Tax",
  "1099",
  "Advisory",
  "FP&A",
  "Other",
];
export const CONTACT_TYPES = [
  "Primary",
  "Accounting",
  "Tax",
  "Payroll",
  "Billing",
  "Executive",
  "Other",
] as const;
export const FIELD_TYPES = [
  "Text",
  "Number",
  "Date",
  "Boolean",
  "Dropdown",
] as const;
export const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
