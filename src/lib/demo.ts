import { AppError } from "./errors";

/**
 * Public demo deployment. A separate Vercel project with its own database sets
 * DEMO_MODE=true; the production app never does. In demo mode:
 *  - the login page lists the demo accounts and their shared, public password;
 *  - sign-up, password resets, invitations and all outgoing email are off;
 *  - the owner console is off;
 *  - /api/cron/demo-reset wipes the database and reseeds it (every 12 hours,
 *    see src/lib/demo-reset.ts).
 */
export const DEMO_FIRMS = [
  { name: "Demo CPA Firm", domain: "demo.setu.test" },
  { name: "Sample Accounting LLP", domain: "sample.setu.test" },
] as const;
export const DEMO_ROLES = ["admin", "partner", "manager", "senior", "associate"] as const;
export const DEMO_RESET_HOURS = 12;

export function isDemo() {
  return process.env.DEMO_MODE === "true";
}

export function demoPassword() {
  const value = process.env.DEMO_PASSWORD;
  if (!value || value.length < 12) throw new Error("Demo mode needs DEMO_PASSWORD (12+ characters).");
  return value;
}

/** Blocks actions that would email someone or let a visitor lock others out. */
export function assertNotDemo(action: string) {
  if (isDemo()) throw new AppError(`${action} is turned off in the demo.`, 403);
}

/** Resets run at 00:00 and 12:00 UTC (see .github/workflows/demo-reset.yml). */
export function nextDemoReset(now = new Date()) {
  const period = DEMO_RESET_HOURS * 3600_000;
  return new Date(Math.floor(now.getTime() / period) * period + period);
}

export function demoAccounts() {
  return DEMO_FIRMS.map((firm) => ({
    firm: firm.name,
    accounts: DEMO_ROLES.map((role) => `${role}@${firm.domain}`),
  }));
}
