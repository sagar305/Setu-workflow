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

## Later schema changes

1. Create migrations locally as usual (see README, "Database changes and deployment").
2. Commit them and merge to the production branch. The production build applies them automatically.

## Backups

Neon's free plan keeps only a short restore window. Before storing real client data, schedule regular `pg_dump` backups to storage you control, or upgrade to a paid Neon plan.
