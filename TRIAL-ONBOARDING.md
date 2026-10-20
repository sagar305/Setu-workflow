# Firm trials and public administrator sign-up

Implemented 20 October 2026. Entry point: `/signup`, linked from `/login`.

## Firm experience

1. A CPA firm administrator enters firm name, their name, email and firm timezone.
2. A separate workspace is created with the existing default roles and configuration catalogs. It starts without client or engagement data. The administrator is Invited and has no password; no session or activation token is returned to the browser.
3. The activation email links to the existing `/invite` password-setting page. The link expires after 48 hours and can be used once. Submitting the signup form again resends an unused activation link and invalidates the previous link; it never overwrites the original firm's details.
4. Activating the administrator starts one firm-wide 15 × 24-hour period. The administrator can log in, create an office, add clients/engagements and invite colleagues. Invitees inherit the same trial end time.
5. The workspace banner shows remaining days. `/trial` shows the precise end time in the firm's timezone, setup links and a continuation email button to **hello@setutechnology.com**.
6. At the end instant, the workspace is read-only. Login/logout, password resets, authorized views and exports remain available. Business changes, imports, invitations and activation of pending teammates are blocked. Data is not deleted.

The banner refreshes at expiry. Common edit forms are disabled when the workspace is read-only; the API and shared mutation boundary also enforce expiry, including for already-open pages and existing sessions. No scheduled job is required.

## Controls and isolation

- Existing firms default to ongoing access (`is_trial=false`); this migration does not place them into a trial.
- Trial dates and status are server-controlled. Firm settings, repeated signup, timezone changes, password reset and team invitations cannot extend or restart the clock.
- All business POST endpoints check trial access. Shared tenant mutations re-check after acquiring the firm lock. Source permissions and tenant isolation remain in force on both reads and writes.
- Signup rate limits: three attempts per email per hour; twenty per client key per hour. Without a trusted, sanitized proxy configuration the client key is shared. Signup preserves the existing API's same-origin, JSON and request-size checks.
- Duplicate email responses are generic. Existing activated accounts are not altered. Unique email constraints and a transaction prevent partially provisioned duplicate workspaces.
- This is workspace-based trial access, not domain ownership verification or billing. No payment information is collected. The existing global email uniqueness policy still means one account per email.

## Local use and production configuration

Migration: `prisma/migrations/202610200001_firm_trials/migration.sql`. Applied to the local app and test databases; Prisma client regenerated.

Local activation mail is written to `.local/mail` with `DEV_MAIL=true`. This directory is ignored by Git and not served by the app. Local signup does not deliver real emails.

For external testers, deploy the application and PostgreSQL, run migrations and generate the Prisma client, configure HTTPS `APP_URL`, RESEND_API_KEY and MAIL_FROM (a verified Resend sender), and set `DEV_MAIL=false`. No hosting was performed in this change. `TRIAL_CONTACT_EMAIL` can override the supplied continuation address; the default is hello@setutechnology.com. Real activation emails require working Resend configuration. If delivery fails after provisioning, the signup form can resend the invitation once mail is fixed; the clock has not started.

## Setu operator access control

There is deliberately no tenant-facing upgrade or extend endpoint. The trusted server operator can use:

```text
node node_modules/tsx/dist/cli.mjs scripts/manage-trial.ts <firm UUID> extend 15
node node_modules/tsx/dist/cli.mjs scripts/manage-trial.ts <firm UUID> ongoing
```

The command requires direct server/database access, accepts only an activated trial, locks the firm and writes an audit event. Extensions accept 1–90 days, added to the later of now or the current end. `ongoing` removes trial restrictions while retaining dates for history. No production firm was changed with this command during implementation.

## Verification

- Six focused integration/service tests passed (`tests/trials.test.ts`): isolated firm provisioning and safe server-selected admin role; activation timing and single use; resend/duplicate protection and throttling; expired-session write denial with login/read preservation; blocked teammate activation; password reset/settings cannot change access; existing firms unaffected; exact cutoff and expired activation behavior.
- One focused browser test passed (`e2e/trials.spec.ts`): login → signup → local activation email → password setup → login → trial banner → setup links/contact email → forced expiry → disabled form/direct API denial → report read → logout.
- TypeScript and ESLint checks passed. Production build result recorded below after completion.
- No full historical browser regression, production SMTP delivery test, deployment or production load test was performed. Operator maintenance commands were type/lint checked but not run against a customer firm.

Production build passed with `/signup` and `/trial` included. ESLint identified one internal link that needed Next.js `Link`; it was corrected and the affected file passed lint. The production build preceded that link-only correction; final TypeScript verification covers it. Local preview was restarted after verification.

