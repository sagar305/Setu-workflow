import { firmDates } from "./engagement-constants";
import { POINT_OPEN_STATUSES } from "./point-validation";
export function actionableOpen(point: { pointType: string; status: string }) {
  return (
    point.pointType !== "KnowledgeInstruction" &&
    (POINT_OPEN_STATUSES as readonly string[]).includes(point.status)
  );
}
export function pointAge(
  point: { pointType: string; status: string; createdAt: Date | string },
  timezone: string,
  now = new Date(),
) {
  if (!actionableOpen(point)) return null;
  const today = firmDates(timezone, now).today,
    raised = firmDates(timezone, new Date(point.createdAt)).today;
  return Math.max(
    0,
    Math.round((Date.parse(today) - Date.parse(raised)) / 86400000),
  );
}
export function ageBucket(age: number | null) {
  return age === null
    ? null
    : age <= 2
      ? "0–2"
      : age <= 5
        ? "3–5"
        : age <= 10
          ? "6–10"
          : "over 10";
}
export function pointOverdue(
  point: { pointType: string; status: string; dueDate: Date | string | null },
  timezone: string,
  now = new Date(),
) {
  const due =
    point.dueDate instanceof Date
      ? point.dueDate.toISOString().slice(0, 10)
      : point.dueDate?.slice(0, 10);
  return actionableOpen(point) && !!due && due < firmDates(timezone, now).today;
}
