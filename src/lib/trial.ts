import { invariant } from "./errors";
export const TRIAL_DURATION_MS = 15 * 24 * 3600_000;
type TrialFirm = {
  isTrial: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
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
export function assertTrialWritable(firm: TrialFirm, now = new Date()) {
  invariant(
    !trialState(firm, now).readOnly,
    "Your firm's trial is not active. Your workspace is read-only; view Trial details to continue.",
    403,
  );
}
