// Demo data is for a developer's own machine only. Deployed environments get
// their users through the database: firm sign-up (/signup), email invitations
// from Admin → Users, and Setu staff accounts in the owner console. There is
// no environment-variable switch that seeds shared demo logins anywhere else.
export function assertLocalSeeding() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV)
    throw new Error("Demo seeding is development-only and never runs on a deployment.");
  const url = process.env.DATABASE_URL;
  const host = url ? new URL(url).hostname : "";
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host))
    throw new Error(`Demo seeding only runs against a local database (DATABASE_URL host is "${host || "unset"}").`);
}
