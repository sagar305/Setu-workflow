import { Prisma } from "@prisma/client";
import { firmDates } from "./engagement-constants";
export const dateKey = (d: Date) => d.toISOString().slice(0, 10);
export function shiftDate(value: string, days: number) {
  const d = new Date(value + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return dateKey(d);
}
export function capacityPeriod(
  timezone: string,
  week?: string,
  weeks = 1,
  now = new Date(),
) {
  const today = firmDates(timezone, now).today;
  const start = week
    ? firmDates("UTC", new Date(week + "T00:00:00Z")).weekStart
    : firmDates(timezone, now).weekStart;
  return {
    today,
    start,
    end: shiftDate(start, weeks * 7 - 1),
    weeks,
    previous: shiftDate(start, -7),
    next: shiftDate(start, 7),
  };
}
type Adjustment = {
  startDate: Date;
  endDate: Date;
  hoursReduction: Prisma.Decimal;
};
export function dailyCapacity(
  weekly: number,
  start: string,
  days: number,
  adjustments: Adjustment[],
  active = true,
) {
  // Split into hundredths; place any remainder on the earliest weekdays so daily totals equal the weekly default.
  const units = new Prisma.Decimal(String(weekly)).mul(100).round();
  const base = units.div(5).floor();
  const remainder = units.minus(base.mul(5)).toNumber();
  return Array.from({ length: days }, (_, i) => {
    const date = shiftDate(start, i),
      weekday = new Date(date).getUTCDay();
    const normal =
      active && weekday >= 1 && weekday <= 5
        ? base.plus(weekday <= remainder ? 1 : 0).div(100)
        : new Prisma.Decimal(0);
    const reduction =
      weekday >= 1 && weekday <= 5
        ? adjustments
            .filter(
              (a) => date >= dateKey(a.startDate) && date <= dateKey(a.endDate),
            )
            .reduce((s, a) => s.plus(a.hoursReduction), new Prisma.Decimal(0))
        : new Prisma.Decimal(0);
    return { date, capacity: Prisma.Decimal.max(0, normal.minus(reduction)) };
  });
}
export function capacityMetrics(
  capacity: Prisma.Decimal,
  planned: Prisma.Decimal,
) {
  const load = capacity.gt(0) ? planned.div(capacity).mul(100) : null;
  return {
    capacity: capacity.toFixed(2),
    planned: planned.toFixed(2),
    available: capacity.minus(planned).toFixed(2),
    load: load?.toFixed(1) ?? null,
    status: planned.gt(capacity)
      ? "Overloaded"
      : capacity.eq(0)
        ? "No capacity"
        : load!.gte(80)
          ? "Near Capacity"
          : "Available",
  };
}
