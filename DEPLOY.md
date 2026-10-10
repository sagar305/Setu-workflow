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
| `CRON_SECRET` | A random string of 16 or more characters, for example `openssl rand -hex 32`. It authorizes the daily cleanup job. |

Do not set `DEV_MAIL` or `TEST_DATABASE_URL` in Vercel. `SEED_PASSWORD` is only for the optional demo data below.

## 4. Redeploy

Open **Deployments**, then **Redeploy** the latest one. `pnpm vercel-build` runs `scripts/migrate-deploy.ts`, which applies pending Prisma migrations over the unpooled connection, then builds the app.

Migrations run **only for production deployments**. Preview deployments skip them, because they share the production database unless Neon preview branching is enabled. If you enable Neon branching for previews, set `MIGRATE_PREVIEWS=true` for the Preview environment.

## 5. Create your firm and first admin

Demo seeding is disabled in production. From your computer, run this against the production database. Copy `DATABASE_URL_UNPOOLED` from Vercel or the Neon console.

```sh
DATABASE_URL="<unpooled Neon URL>" pnpm firm:provision \
  --firm "Your Firm Name" --email you@yourfirm.com --timezone Asia/Kolkata
```

It prints a one-time temporary password. Sign in at `APP_URL`, then use **Forgot password** to set your own password. Invite the rest of the team from **Admin → Users**.

## Optional: temporary demo data

To try the app with sample firms, clients and engagements, add these two Production variables and redeploy:

| Variable | Value |
| --- | --- |
| `SEED_DEMO_DATA` | `true` |
| `SEED_PASSWORD` | A strong password (12+ characters) shared by all demo accounts |

After migrations, the build seeds two demo firms. Their logins are listed in README under "Demo credentials", for example `admin@demo.setu.test`. Later builds skip data that already exists. Delete both variables once seeded.

Demo accounts are reachable by anyone who knows the emails and password. Before entering real client data, reset the Neon database (Neon console → Branches → main → Reset, or recreate it), redeploy to recreate the empty tables, and provision your real firm.

## 6. Scheduled cleanup

`vercel.json` schedules `GET /api/cron/cleanup` daily at 03:00 UTC. It deletes expired sessions and rate-limit rows. Vercel sends `Authorization: Bearer $CRON_SECRET`. Without a matching secret, the route returns 404.

## Later schema changes

1. Create migrations locally as usual (see README, "Database changes and deployment").
2. Commit them and merge to the production branch. The production build applies them automatically.

## Backups

Neon's free plan keeps only a short restore window. Before storing real client data, schedule regular `pg_dump` backups to storage you control, or upgrade to a paid Neon plan.
