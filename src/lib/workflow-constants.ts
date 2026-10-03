import { firmDates } from "./engagement-constants";
// Firm-local midnight boundaries; DST does not turn a calendar day into 23/25 hours.
export function daysInStage(
  entered: string | Date | null | undefined,
  timezone: string,
  now = new Date(),
) {
  if (!entered) return 0;
  return Math.max(
    0,
    Math.round(
      (Date.parse(firmDates(timezone, now).today) -
        Date.parse(firmDates(timezone, new Date(entered)).today)) /
        86400000,
    ),
  );
}
export const workflowPerson = {
  select: { id: true, firstName: true, lastName: true },
} as const;
