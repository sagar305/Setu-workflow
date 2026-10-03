export const ENGAGEMENT_STATUSES = [
  "Draft",
  "Planned",
  "Assigned",
  "InProgress",
  "OnHold",
  "Completed",
  "Cancelled",
] as const;
export const PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
export const PERIODS = [
  "Monthly",
  "Quarterly",
  "Annual",
  "TaxYear",
  "Custom",
  "NotApplicable",
] as const;
export const STAFF = [
  "partnerId",
  "managerId",
  "reviewerId",
  "preparerId",
] as const;
export const DATE_FIELDS = [
  "periodStartDate",
  "periodEndDate",
  "allocationDate",
  "plannedStartDate",
  "actualStartDate",
  "dueDate",
  "completedDate",
] as const;
export const engagementLabel = (value: string) =>
  ({
    InProgress: "In Progress",
    OnHold: "On Hold",
    TaxYear: "Tax Year",
    NotApplicable: "Not Applicable",
  })[value] ?? value;
export const ENGAGEMENT_TYPES = [
  "Monthly Bookkeeping",
  "Monthly Close",
  "Quarterly Close",
  "Annual Close",
  "Individual Tax Return",
  "Partnership Tax Return",
  "S Corporation Tax Return",
  "C Corporation Tax Return",
  "Trust Tax Return",
  "1099",
  "Sales Tax",
  "Payroll",
  "Financial Statement Audit",
  "Review",
  "Compilation",
  "Advisory",
  "FP&A",
  "Other",
];

// Calendar arithmetic uses UTC only after deriving the firm's local calendar date.
export function firmDates(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const monday = new Date(today + "T00:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return {
    today,
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}
export function isOverdue(
  record: { dueDate: Date | string | null; status: string },
  today: string,
) {
  const date =
    record.dueDate instanceof Date
      ? record.dueDate.toISOString().slice(0, 10)
      : record.dueDate?.slice(0, 10);
  return Boolean(
    date && date < today && !["Completed", "Cancelled"].includes(record.status),
  );
}
