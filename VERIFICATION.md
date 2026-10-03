# Build 01 verification

Validated locally on Windows with Node.js 24.19, PostgreSQL 18, Next.js 16.3.6, and Prisma 6.19.3.

| Check | Result |
| --- | --- |
| Prisma schema validation and client generation | Passed |
| Initial migration against development database | Passed |
| Initial migration against separate test database | Passed |
| Migration redeployment | Passed; no pending migrations |
| Seed two firms, five roles/users per firm, two offices per firm | Passed |
| Seed rerun | Passed; existing firms safely skipped |
| Strict TypeScript check | Passed |
| ESLint across source, tests, scripts, Prisma seed, and configuration | Passed |
| PostgreSQL security integration tests | **16 passed** |
| Chrome browser tests | **6 passed** |
| Optimized production build | Passed |
| Production dependency audit | No known vulnerabilities reported |
| Desktop and mobile screenshot inspection | Passed |

The database tests verify anonymous rejection; ordinary-user permission rejection; normalized email login and logout; inactive-user rejection; tenant A/B read and write isolation; composite foreign-key protection; custom-role isolation; privilege escalation protection; invitation expiry and concurrent single use; password-reset expiry, single use, and session revocation; generic reset responses; firm suspension; audit creation without secrets; and shared rate limiting.

Browser tests verify protected-page redirects, admin navigation/login/logout, ordinary-user restrictions, Origin validation, office/role creation, invitations, employee password creation/login, account deactivation/reactivation, password resets, and mobile navigation without viewport overflow.

The invitation/reset browser journeys use the private local mail directory. Live SMTP delivery was **not** tested because no SMTP account was supplied. No external deployment was performed. HTTPS, SMTP, production database access grants, backups, monitoring, and operational retention/cleanup must be configured before commercial deployment; see README for the security assumptions and limitations.

No Build 02+ workflow functionality was implemented. The operational navigation destinations are placeholders.
