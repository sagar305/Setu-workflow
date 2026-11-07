import { invariant } from "./errors";
export const TRIAL_DURATION_MS = 15 * 24 * 3600_000;
type TrialFirm = {
  isTrial: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
};
/** A firm as access decisions see it. License fields are optional for callers that only know the trial. */
export type AccessFirm = TrialFirm & {
  licenseExpiresAt?: Date | null;
  licensedSeats?: number | null;
  /** Seat holders (Active or Invited users with a seat), when the caller loaded them. */
  _count?: { users: number };
};
export function trialState(firm: TrialFirm, now = new Date()) {
  const pending = firm.isTrial && (!firm.trialStartedAt || !firm.trialEndsAt);
  const expired = firm.isTrial && !!firm.trialEndsAt && now >= firm.trialEndsAt;
  return {
    isTrial: firm.isTrial,
    pending,
    expired,
    readOnly: pending || expired,
    endsAt: firm.trialEndsAt?.toISOString() ?? null,
    daysRemaining:
      firm.isTrial && firm.trialEndsAt
        ? Math.max(
            0,
            Math.ceil((firm.trialEndsAt.getTime() - now.getTime()) / 86400000),
          )
        : null,
  };
}
/**
 * The firm's overall access. A redeemed license takes over from the trial:
 *
 * - licensed: the subscription is running. Writable while seat holders fit
 *   the plan; over the limit the workspace is read-only until the account owner
 *   removes access from someone.
 * - lapsed: a subscription existed and ended. Read-only until a key is redeemed.
 * - trial: no license yet; the 15-day trial rules apply.
 * - ongoing: an older firm with neither trial nor license keeps full access.
 */
export function accessState(firm: AccessFirm, now = new Date()) {
  const trial = trialState(firm, now);
  const licenseEnd = firm.licenseExpiresAt ?? null;
  const licensed = !!licenseEnd && now < licenseEnd;
  const lapsed = !!licenseEnd && !licensed;
  const seats = firm.licensedSeats ?? null;
  const seatsInUse = firm._count?.users ?? null;
  const overSeats = licensed && seats !== null && seatsInUse !== null && seatsInUse > seats;
  const plan = licensed ? "licensed" : lapsed ? "lapsed" : firm.isTrial ? "trial" : "ongoing";
  return {
    ...trial,
    plan,
    licensed,
    lapsed,
    licenseEndsAt: licenseEnd?.toISOString() ?? null,
    licenseDaysRemaining: licensed
      ? Math.max(0, Math.ceil((licenseEnd!.getTime() - now.getTime()) / 86400000))
      : null,
    seats,
    seatsInUse,
    overSeats,
    readOnly: licensed ? overSeats : lapsed ? true : trial.readOnly,
  } as const;
}
export type AccessState = ReturnType<typeof accessState>;
export function assertTrialWritable(firm: AccessFirm, now = new Date()) {
  const state = accessState(firm, now);
  if (!state.readOnly) return;
  invariant(
    false,
    state.overSeats
      ? `More people have access than your plan's ${state.seats} users. Your workspace is read-only until your account owner removes access in Admin → Subscription.`
      : state.lapsed
        ? "Your firm's Setu Workflow subscription has ended. Your workspace is read-only; your account owner can redeem a license key in Admin → Subscription."
        : "Your firm's trial is not active. Your workspace is read-only; view Trial details to continue.",
    403,
  );
}
