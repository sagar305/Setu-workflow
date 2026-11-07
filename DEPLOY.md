# Deploying to Vercel + Neon

Setu Workflow runs on Vercel (the Next.js app) and Neon (PostgreSQL). Both have free tiers. Vercel Hobby is for non-commercial use; move to Vercel Pro before charging customers.

## 1. Create the Vercel project

1. Push this repository to GitHub.
2. At [vercel.com/new](https://vercel.com/new), import the repository. Vercel detects Next.js and pnpm.
3. Under **Build and Output Settings**, set **Build Command** to `pnpm vercel-build`. Leave the rest as defaults.
4. Deploy. The first build fails because no database exists yet. That's expected.

## 2. Add Neon

1. In the Vercel project, open **Storage → Create Database → Neon (Serverless Postgres)** and choose the **Free** plan. Pick the region closest to your users, and match the project's **Functions region** under Settings → Functions.
2. Connect it to **Production** (and Preview, if wanted). Vercel adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) to the project.
3. Recommended: in the Vercel environment variables, append `&connect_timeout=15` to `DATABASE_URL`. A Neon database that has been idle takes a few seconds to wake up.

## 3. Set environment variables

In **Settings → Environment Variables**, for Production:

| Variable | Value |
| --- | --- |
| `APP_URL` | `https://<your-project>.vercel.app`, or your custom domain. HTTPS is required. |
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com) → **API Keys** ("Sending access" is enough). Needed for invitations and password resets. |
| `MAIL_FROM` | For example `Setu Workflow <noreply@yourdomain.com>`. The domain must be verified in Resend (**Domains** → add the DNS records it shows). Before you verify a domain, `onboarding@resend.dev` works, but it can only send to your own Resend account email. |
| `TRUST_PROXY` | `true`. Vercel overwrites `X-Forwarded-For`, so the login limiter applies per client instead of being shared. |
| `CRON_SECRET` | A random string of 16 or more characters, for example `openssl rand -hex 32`. It authorizes the daily cleanup and plan-reminder job. |
| `WORKFLOW_LICENSE_SECRET` | `openssl rand -hex 32`. Must be **the same value** as `WORKFLOW_LICENSE_SECRET` on setutechnology.com, which sells the keys this app redeems. Changing it later invalidates keys sold but not yet redeemed. |
| `PLATFORM_ROUTE_SECRET` | `openssl rand -hex 16`. The owner console lives only at `/console/<this value>`. Keep it private; without it the console is off. |
| `PLATFORM_SECRET_KEY` | `openssl rand -hex 32`. Encrypts console staff's authenticator secrets, so the console route can be rotated without everyone re-linking their app. |
| `TRIAL_CONTACT_EMAIL` | Optional. Where "Contact sales" and trial emails point. Defaults to `hello@setutechnology.com`. |
| `NEXT_PUBLIC_WORKFLOW_BUY_URL` | Optional. Where "Buy a key" links go. Defaults to `https://setutechnology.com/products/workflow`. |

Do not set `DEV_MAIL`, `TEST_DATABASE_URL`, `SEED_PASSWORD` or `SEED_DEMO_DATA` in Vercel. Nobody gets access through environment variables: every account lives in the database (step 5).

## 4. Redeploy

Open **Deployments**, then **Redeploy** the latest one. `pnpm vercel-build` runs `scripts/migrate-deploy.ts`, which applies pending Prisma migrations over the unpooled connection, then builds the app.

Migrations run **only for production deployments**. Preview deployments skip them, because they share the production database unless Neon preview branching is enabled. If you enable Neon branching for previews, set `MIGRATE_PREVIEWS=true` for the Preview environment.

## 5. Access: everything goes through the database

There are no shared or environment-variable logins in a deployed app. Accounts are created in three ways, all stored in the database:

1. **Setu staff (owner console).** Create the first console user once, from your computer, against the production database:

   ```sh
   DATABASE_URL="<unpooled Neon URL>" APP_URL="https://<your app>" PLATFORM_ROUTE_SECRET="<same as Vercel>" \
     pnpm console:admin create you@setutechnology.com "Your Name"
   ```

   It prints a one-time link to set your password. Your first sign-in at `/console/<PLATFORM_ROUTE_SECRET>` links an authenticator app. Invite the rest of the Setu team from the console's **Team** page.

2. **Firms sign up themselves** at `/signup`. The person who signs up becomes the firm's **account owner**, gets a 15-day trial, and invites colleagues from **Admin → Users**. When they pay, they redeem a key in **Admin → Subscription** (or you issue and apply one from the console).

3. **A firm you set up by hand** (for example a sales-led customer): `pnpm firm:provision --firm "Firm" --email owner@firm.com --timezone Asia/Kolkata` against the production database. It prints a one-time temporary password; the owner signs in and uses **Forgot password** to set their own.

### If demo firms were seeded on this database earlier

Earlier builds could seed two demo firms (`admin@demo.setu.test`, `admin@sample.setu.test`, …) whose accounts all shared one password from `SEED_PASSWORD`. That option is gone. If they exist in production, open each in the owner console (**Accounts** → the firm → **Lock account**). Everyone is signed out and can no longer sign in; nothing is deleted. Then remove `SEED_DEMO_DATA` and `SEED_PASSWORD` from Vercel if they are still there.

## 6. Scheduled cleanup

`vercel.json` schedules `GET /api/cron/cleanup` daily at 03:00 UTC. It deletes expired sessions and rate-limit rows, and emails plan reminders 14, 7 and 1 days before a firm's plan ends. Vercel sends `Authorization: Bearer $CRON_SECRET`. Without a matching secret, the route returns 404.

## 7. Public demo instance (optional)

A separate, public demo that anyone can log in to, with sample data that is **wiped and reseeded every 12 hours** (00:00 and 12:00 UTC). It is a second Vercel project built from the same repository, with **its own Neon database**. Never point it at the production database, and never set `DEMO_MODE` on the production project.

What changes when `DEMO_MODE=true`:

- The login page lists the demo accounts (two firms × Admin, Partner, Manager, Senior, Associate) with one-click sign-in, and shows the shared `DEMO_PASSWORD`. The password is public on purpose.
- Every page in the workspace shows a banner counting down to the next reset.
- Sign-up, password resets, inviting users and deactivating users are off, and no email is ever sent. The sign-up page links to your real app instead (`DEMO_SIGNUP_URL`).
- The owner console is off, even if `PLATFORM_ROUTE_SECRET` is set.
- `POST /api/cron/demo-reset` (with `Authorization: Bearer $CRON_SECRET`) empties every table and reseeds the sample data. On any other deployment this route returns 404.

The reset refuses to run unless `DEMO_MODE=true` **and** the database is either empty or already marked as a demo database (the `demo_instance` table, written by the first reset). A database that holds firms but was never marked as a demo, such as production, is never touched. Two resets never overlap.

### Setting it up

1. **New Neon database.** In Neon (or Vercel → Storage), create a separate database for the demo.
2. **New Vercel project.** Import the same repository again as a second project (for example `setu-workflow-demo`). Set **Build Command** to `pnpm vercel-build` and connect the new database. Migrations run on deploy as usual.
3. **Environment variables** (Production) on the demo project:

   | Variable | Value |
   | --- | --- |
   | `DEMO_MODE` | `true` |
   | `DEMO_PASSWORD` | The password every demo account uses, 12+ characters, for example `SetuDemo-2026`. It is shown on the login page. |
   | `DEMO_SIGNUP_URL` | Optional. Your real app's sign-up page, for example `https://<your app>/signup`. |
   | `APP_URL` | The demo's own URL, for example `https://setu-workflow-demo.vercel.app`. |
   | `CRON_SECRET` | A new random value (`openssl rand -hex 32`), different from production. |
   | `TRUST_PROXY` | `true` |

   Leave out `RESEND_API_KEY`, `MAIL_FROM`, `WORKFLOW_LICENSE_SECRET` and `PLATFORM_*`. The demo sends no email and has no console.
4. **Schedule.** Vercel Hobby only runs crons once a day, so the 12-hour schedule lives in GitHub Actions (`.github/workflows/demo-reset.yml`). In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:
   - `DEMO_APP_URL`: the demo's URL, without a trailing slash.
   - `DEMO_CRON_SECRET`: the same value as the demo project's `CRON_SECRET`.

   Until both secrets exist, the workflow skips itself, so it is harmless in forks or before the demo exists.
5. **First seed.** Open **Actions → Demo reset → Run workflow**. The database is empty at first, so the first run marks it as a demo and seeds it. After that it runs every 12 hours. GitHub emails you if a run fails.

You can also reset by hand from your computer, against the demo database only:

```sh
DATABASE_URL="<demo database URL>" DEMO_MODE=true DEMO_PASSWORD="<same as Vercel>" pnpm demo:reset
```

On Vercel Pro you could instead add `{ "path": "/api/cron/demo-reset", "schedule": "0 0,12 * * *" }` to `vercel.json`. Don't do this on Hobby: deployments with a cron more frequent than daily fail. It's also harmless on production, where the route returns 404.

## Later schema changes

1. Create migrations locally as usual (see README, "Database changes and deployment").
2. Commit them and merge to the production branch. The production build applies them automatically.

## Backups

Neon's free plan keeps only a short restore window. Before storing real client data, schedule regular `pg_dump` backups to storage you control, or upgrade to a paid Neon plan.
