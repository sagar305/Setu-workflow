# Setu Workflow — Build 07: Queries / Open Points

Build #7 adds a unified Points Engine with questions, review points, instructions and internal issues; threaded replies; explicit resolution/reopening; calendar-day aging; workflow blocking/overrides; checklist links; overview counts; and Points Assigned to Me. Existing tenant visibility, audit history and planned-hour calculations are preserved. Persistent attachments remain explicitly unavailable. See [Build #7 guide](BUILD7.md) and [Build #7 verification](BUILD7-VERIFICATION.md). The clean pre-build checkpoint is `3405afe`, tagged `setu-build-6-checkpoint`.

Build #6 adds stage checklist definitions, independent engagement snapshots, ownership, completion/reopening history, comments, required-item workflow gates and a separate My Checklist Items queue. Tenant visibility, revision checks and AuditLog are reused. File uploads/downloads are explicitly unavailable until secure persistent storage is configured. See [Build #6 architecture and manual guide](BUILD6.md) and [Build #6 verification](BUILD6-VERIFICATION.md). The pre-build checkpoint is `a31066e`; Builds #1–#5 remain in this application.

Build #5 adds dated planned work allocations, multi-date and multi-engagement previews, explicit reassignment and cancellation, audit history, budget acknowledgement, configured weekly capacity warnings, operational `/my-work`, and `/team/assignments`. Engagement detail has an Assignments tab. Planned hours remain separate from stage ownership and actual time. See [Build #5 architecture](BUILD5.md) and [Build #5 verification](BUILD5-VERIFICATION.md). Builds #1–#4 documentation is preserved below.

Build #4 adds versioned Workflow Templates at `/templates`, independent Engagement workflow snapshots, auditable forward/return/reassign/skip/complete/reopen transitions, repeated stage visits, current-owner queues at `/my-work`, and transactional stale-transition protection. Read [Build #4 architecture and operating guide](BUILD4.md) and [Build #4 verification report](BUILD4-VERIFICATION.md).

Build #3 adds Engagement Master at `/engagements`, with Client integration, staffing and lifecycle history, budgets, firm-timezone due indicators, record-level visibility, CSV import/export, and engagement custom fields. Read [Build #3 architecture and operating guide](BUILD3.md) and [Build #3 verification report](BUILD3-VERIFICATION.md).

Build #2 extends the existing foundation with clients, contacts, service associations, ownership, typed custom fields, activity history, CSV import/export, and controlled bulk updates. Start at `/clients`. See [Build #2 architecture and operating guide](BUILD2.md) and [Build #2 verification report](BUILD2-VERIFICATION.md). The original Build #1 documentation below and `VERIFICATION.md` remain available as historical foundation documentation; Clients is now implemented.

A local, production-oriented SaaS foundation for independent CPA firms. Next.js App Router, React, strict TypeScript, Tailwind CSS, PostgreSQL, and Prisma. This project is independent of Setu Invoice OCR.

## Original Build #1 scope

Implemented: email/password login and logout, password resets, invitation acceptance/resending, users, offices, custom roles, firm settings, permission checks, audit events, tenant isolation, migrations, two demo firms, and a responsive application shell. Dashboard, My Work, Engagements, Clients, Team, Templates, and Reports are placeholders. There is no accounting, AI, billing, SSO, or workflow engine.

## Prerequisites and installation

- Node.js 22.13+ or 24 LTS and npm (or pnpm).
- PostgreSQL 16+; alternatively the development runner below supplies PostgreSQL 18 on supported platforms.
- Google Chrome for browser tests (or change Playwright's channel and install its browser).

```sh
npm install
```

The committed `pnpm-lock.yaml` is the reproducible package lock for this checkout. With pnpm 11+, use `pnpm install --frozen-lockfile`. `pnpm-workspace.yaml` explicitly allows required dependency setup scripts. Prisma is deliberately pinned to 6.19.3 for its conventional PostgreSQL migration/client architecture; upgrade its major version as a separate reviewed change.

Dependency overrides pin Prisma's transitive `deepmerge-ts` to patched 8.0.2 for both pnpm and npm. Prisma generate/migrate/build are verified with this override. Prefer pnpm for the exact verified dependency tree.

## Quick local start

In terminal 1:

```sh
npm run db:local
```

On the first run, this generates `.env` with random local database and seed passwords, initializes PostgreSQL in `.local/postgres`, and creates `setu` and `setu_test`. It binds **only to 127.0.0.1:55432**. Keep this terminal running. Ctrl+C stops it without deleting data. This runner is development-only and does not install a system service.

In terminal 2:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://127.0.0.1:3000. Use the exact origin in `APP_URL`; `localhost` is a different origin and is rejected for mutations when APP_URL uses 127.0.0.1.

### Existing PostgreSQL instead

Copy `.env.example` to `.env`. Create a development database and a separate test database whose name ends in `_test`. Set DATABASE_URL, TEST_DATABASE_URL if needed, APP_URL, DEV_MAIL, and a development SEED_PASSWORD of at least 12 characters. Run the same generate/migrate/seed/dev commands. Do not run `db:local` against a remote URL.

### Demo credentials

Both firms have five users and two offices. The password for **all demo accounts** is the locally generated `SEED_PASSWORD` in `.env`. It is deliberately not committed or hard-coded. Open `.env` locally to retrieve it. Never use these accounts or this password in production.

| Role | Demo CPA Firm | Sample Accounting LLP |
| --- | --- | --- |
| Firm Admin | admin@demo.setu.test | admin@sample.setu.test |
| Partner | partner@demo.setu.test | partner@sample.setu.test |
| Manager | manager@demo.setu.test | manager@sample.setu.test |
| Senior / Reviewer | senior@demo.setu.test | senior@sample.setu.test |
| Associate / Preparer | associate@demo.setu.test | associate@sample.setu.test |

Seeding skips a firm whose seed administrator already exists; it does not reset existing passwords. `NODE_ENV=production` disables demo seeding and the embedded database runner.

## Environment

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | PostgreSQL connection URI. Use a dedicated least-privilege runtime account in production. |
| TEST_DATABASE_URL | Optional isolated test database; defaults to DATABASE_URL with database `setu_test`. Must end in `_test`. |
| APP_URL | Canonical application origin. HTTPS required in production. |
| SEED_PASSWORD | Development-only password, at least 12 characters. |
| DEV_MAIL | `true` writes development messages under `.local/mail`. Ignored in production. |
| SMTP_HOST / SMTP_PORT | Production SMTP endpoint; port 587 by default, 465 for implicit TLS. |
| SMTP_USER / SMTP_PASSWORD | SMTP credentials, if needed. |
| MAIL_FROM | Verified sending address. Required for SMTP. |
| TRUST_PROXY | Leave unset unless a trusted ingress strips and overwrites X-Forwarded-For. |

Session tokens are high-entropy random opaque values and do not need a signing key. Never commit `.env` or `.local`; both are ignored. No database or authentication credentials are embedded in source.

## Invitations and password resets

In Admin → Users, choose **Invite user**. The user receives a single-use invitation valid for 48 hours. The invitation screen displays the firm name and asks for a matching password pair. Active users can request a reset from the login page; reset links last 30 minutes. A successful reset invalidates all sessions and other unused reset links.

For local development, inspect the newest `.txt` file in `.local/mail` and copy its link. Files are not served over HTTP. Links put the token in the URL fragment so it does not enter server access logs or referrers; the browser sends it only in the relevant POST body. Protect your local account and delete old development mail when finished. Never use DEV_MAIL as a production delivery mechanism. SMTP delivery errors on invitations tell the admin to correct configuration and resend; resetting an unknown email returns the same message as resetting a registered email.

## Architecture and security decisions

- **Tenant identity comes only from the server-side session**, never a submitted firm ID. Administrative services authenticate and check permissions on every operation. Tenant reads use `firmId` filters; writes use composite `(firmId, id)` selectors. Explicit DTOs keep password hashes out of browser responses.
- **Relational isolation:** composite foreign keys prevent users from referencing another firm's roles, offices, or managers, and tie tokens/sessions/audit actors to the correct firm. Global permissions are a non-tenant catalog. Rate limits are global security infrastructure and store hashed identifiers. A firm record is itself the tenant root.
- **Email identity:** one user belongs to one firm in V1, so normalized email is globally unique. Both input normalization and a database lowercase constraint enforce this. Supporting people across several firms later requires a deliberate identity/membership split.
- **Authentication:** salted scrypt (N=32768, r=8, p=3), 256-bit random session and link tokens, SHA-256 token hashes at rest. Cookies are HttpOnly, SameSite=Lax, eight-hour absolute expiry; production adds Secure and a `__Host-` prefix. Server checks active user, role, and firm on every request. Logout deletes the database session.
- **Mutation protection:** exact canonical Origin checks on all JSON POST routes, bounded body streams, Zod validation, no GET mutations. Login/reset throttles live in PostgreSQL, not per-process memory. Unknown email login still performs password derivation.
- **Authorization:** independent permission keys, seeded default roles, and tenant-specific custom roles. Default roles are immutable. Role/user administrators cannot grant or manipulate permissions beyond their own. Users cannot change their own role or deactivate themselves. At least one active default Firm Admin is retained.
- **Transactions:** administrative mutations lock the firm row and revalidate the session inside the transaction. Token redemption uses the same lock and an atomic unused/unexpired condition. This protects against concurrent reuse and administrative races. Audit records commit with the mutation. Never put passwords/tokens into audit metadata.
- **Auditing:** append-only application API; no audit editing/deleting endpoints. Events capture before/after data for administrative updates. Provisioning, login/logout, invitation, activation, and reset events are recorded. A complete audit-history UI is intentionally deferred.
- **Provisioning:** `src/lib/provision.ts` is an internal service that seeds every firm's default roles. There is no public registration or tenant-accessible firm creation endpoint. Future Setu administration can call this behind its own authorization boundary.
- **Offices:** the current optional `primaryOfficeId` is separate from tenancy. A future `UserOffice(firmId,userId,officeId)` join table can add multi-office membership without replacing the user identity. Deactivated offices remain in history and cannot be newly assigned.
- **Future SSO:** sessions are independent of password verification. A future identity-provider callback can create the same sessions after verified identity mapping. No social-login UI exists today.

The application follows the Next.js guidance to enforce authorization at each server entry point, not only in navigation/layouts ([authentication guide](https://nextjs.org/docs/app/guides/authentication)). Migration commands follow the pinned Prisma 6 workflow ([migration guide](https://docs.prisma.io/docs/orm/v6/prisma-migrate/getting-started)).

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
# With the local app and seeded database running:
npm run test:e2e
```

`npm test` applies the committed migrations to the dedicated test database, then executes real PostgreSQL integration tests. Tests cover unauthorized access, inactive users, foreign tenant read/write attempts, cross-tenant foreign keys, custom roles, privilege escalation, expiry, concurrent invitation reuse, reset reuse/session revocation, audit events, and shared rate limits. Tests create uniquely named fixtures in `setu_test`; they do not delete application data. Periodically recreate the disposable test database if needed.

Browser tests cover anonymous redirects, login/logout, administration pages, restricted user access, cross-origin POST rejection, office/custom-role creation, invitation acceptance, password reset, deactivation/reactivation, and mobile navigation. They create uniquely named test records in the selected development database and deactivate them on success, preserving audit history. Use a separate seeded development database when a pristine demo is required. Playwright may retain screenshots/traces under ignored test directories; treat these as local data. The UI is checked at desktop and mobile widths.

## Database changes and deployment

```sh
# Author a future migration against a development database:
npx prisma migrate dev --name descriptive_change
# Apply committed migrations to staging/production:
npm run db:migrate
npm run build
npm run start
```

Do not use `db push` as a deployment substitute. Use a separate migration database account and a restricted runtime account. Back up data before migration. Configure TLS to PostgreSQL, an HTTPS reverse proxy, SMTP, secret management, monitoring, and backup/restore procedures before production launch. `start` binds to loopback by default, suitable for a reverse proxy. Configure proxy trust explicitly; without it, the client-level limiter is shared across users in addition to per-email throttles.

## Structure

```text
prisma/                   schema, committed migrations, development seed
scripts/                  local database and test migration runners
src/app/(auth)/           login, forgot, invitation, reset
src/app/(workspace)/      protected shell, placeholders, profile, admin
src/app/api/[...path]/    authenticated JSON boundary and origin checks
src/components/           navigation, reusable forms, admin UI
src/lib/                  database, authentication, authorization, services
tests/                    PostgreSQL integration/security tests
e2e/                      browser journey tests
```

## Known limitations and future builds

This is a foundation, not an independently certified production release. No billing, Setu super-admin UI, MFA, email-change verification, long-lived sessions, full audit viewer, or operational workflow scopes are implemented. Firm/managed-team/assigned-work visibility permissions are reserved for later modules; they grant no workflow capabilities now. Profile details are read-only; administrators edit basic user data. Email is intentionally immutable after invitation.

Tenant isolation is application-enforced with composite foreign-key protection; PostgreSQL row-level security is not enabled. Never import raw Prisma into future routes to bypass the scoped services. Database credentials can access multiple tenants and must remain server-only. Database owners can change audit rows; append-only database grants/archival storage and retention policies belong in production hardening. SMTP is synchronous with explicit resend after failure; a durable encrypted outbox/retry worker is deferred. Expired sessions and limiter rows require scheduled cleanup in a deployed environment. Rate limiting is a baseline; internet-facing deployments should also have ingress abuse protection. A nonce-based Content Security Policy remains a deployment hardening task.

For subsequent builds, keep tenant-scoped composite relations, check permissions in every server entry point, redact secrets from DTOs/audits, and add adversarial cross-tenant tests for every new resource. Do not build Clients, Engagements, Templates, Checklists, Queries, Budget/Actual Hours, or Team Capacity as part of Build 01.

Build #8 adds My Time, quick allocation time entry and engagement Budget & Hours. See [BUILD8.md](BUILD8.md) and [BUILD8-VERIFICATION.md](BUILD8-VERIFICATION.md).

Build #9 adds Team Capacity, dated capacity reductions and adjustment-aware allocation warnings. See [BUILD9.md](BUILD9.md) and [BUILD9-VERIFICATION.md](BUILD9-VERIFICATION.md).

Build #10 completes the V1 Management Dashboard, My Day, deterministic attention rules and six operational CSV reports. See [BUILD10.md](BUILD10.md) and [BUILD10-VERIFICATION.md](BUILD10-VERIFICATION.md) for behavior, security and validation. Earlier build-status statements above are historical.
