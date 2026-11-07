// Plain-English lines for the owner console's activity log.
type Meta = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const users = (n: unknown) => `${s(n)} user${n === 1 ? "" : "s"}`;

export const ACTIVITY_GROUPS: [string, string][] = [
  ["", "Everything"],
  ["account.", "Account changes"],
  ["key.", "Contact-sales keys"],
  ["reminders.", "Reminders"],
  ["admin.", "Team & sign-ins"],
];

export function describe(action: string, meta: Meta = {}): string {
  switch (action) {
    case "admin.signed_in":
      return "Signed in";
    case "admin.signed_out":
      return "Signed out";
    case "admin.sign_in_failed":
      return meta.locked ? "Locked out after too many wrong attempts" : meta.what === "code" ? "Wrong code" : "Wrong password";
    case "admin.two_factor_set_up":
      return "Linked an authenticator app";
    case "admin.invited":
      return `Invited ${s(meta.name)} (${s(meta.email)})`;
    case "admin.reset":
      return `Reset sign-in for ${s(meta.email)}`;
    case "admin.password_set":
      return "Set their password";
    case "admin.enabled":
      return `Enabled ${s(meta.email)}`;
    case "admin.disabled":
      return `Disabled ${s(meta.email)}`;
    case "account.free_days":
      return `Added ${s(meta.days)} free day${meta.days === 1 ? "" : "s"} (${s(meta.to)}): ${s(meta.reason)}`;
    case "account.locked":
      return `Locked the account${meta.reason ? `: ${s(meta.reason)}` : ""}`;
    case "account.unlocked":
      return `Unlocked the account${meta.reason ? `: ${s(meta.reason)}` : ""}`;
    case "account.trial_extended":
      return `Extended the trial by ${s(meta.days)} days`;
    case "account.password_reset_sent":
      return `Sent a password reset to ${s(meta.email)}`;
    case "key.issued":
      return `Issued a key: ${meta.kind === "addon" ? `+${users(meta.seats)}` : `${s(meta.days)} days for ${users(meta.seats)}`} (${s(meta.orderRef)})${meta.applyNow ? ", applied" : ""}`;
    case "key.cancelled":
      return `Cancelled key ${s(meta.orderRef)}`;
    case "key.revealed":
      return `Viewed key ${s(meta.orderRef)}`;
    case "reminders.sent":
      return `Sent a plan reminder to ${s(meta.email)}`;
    case "reminders.auto_sent":
      return `Automatic plan reminder to ${s(meta.email)} (${s(meta.daysLeft)} days left)`;
    default:
      return action;
  }
}
