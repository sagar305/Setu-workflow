# Subscriptions, license keys and the account owner

Setu Workflow is sold the same way as Setu QR Menu: the buyer pays on
setutechnology.com, receives a **license key**, and pastes it into the app.

## Plans

| Plan    | India  | Global  | Users |
| ------- | ------ | ------- | ----- |
| Monthly | ₹999   | $9.99   | 3     |
| Yearly  | ₹9,999 | $99.99  | 3     |

More than 3 users: contact sales. Extra users are $4.99 per user per month;
sales issues a key carrying the agreed number of users. Prices live in
`src/lib/plans.ts`.

## Account owner

Each firm has exactly one **account owner** (called "super admin" before migration `202611070002`): the administrator who signed up (or,
for firms that existed before this change, the earliest Firm Admin — set by the
`202611070001_subscriptions` migration). Shown with an "Account owner" badge in
Admin → Users.

Only the account owner can:

- redeem license keys (Admin → Subscription), and
- give or remove a colleague's access (their **seat**).

Other Firm Admins can see the Subscription page but not change it, and cannot
deactivate the account owner or change their role. The account owner always keeps
a seat.

## Access rules

| Firm state                    | Access                                                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| Trial (no key yet)            | 15-day trial as before; everyone invited has access.                   |
| Licensed, within seats        | Full access for users with a seat. Users without one cannot sign in.   |
| Licensed, too many seats      | Read-only until the account owner removes access from enough people.     |
| Subscription ended            | Read-only (view and export). Redeeming a key restores access.          |
| Older firm, no trial, no key  | Unchanged ongoing access.                                              |

- Days on a key stack after whatever is still running (trial or plan), or count
  from today if access has ended.
- The key's user count becomes the plan's. A key with fewer users than a
  running plan is refused, so a renewal can't silently cut seats.
- Inviting someone, or re-activating an inactive user, needs a free seat while
  a plan is running.
- Redeeming and seat changes work while the workspace is read-only — that is
  how it recovers.

## Keys

Format and crypto: `src/lib/license-key.ts`. Same design as the QR Menu keys
(AES-256-GCM, base32, single-use by key id), plus a seat count, a separate AAD
and the `SETUWF-` prefix, so a QR Menu key never works here. Both this app and
the website must share `WORKFLOW_LICENSE_SECRET`; the test vector in
`tests/license-key.test.ts` pins the format for the website's copy.

Operator / sales commands (run with the production secret and database):

```bash
pnpm license issue SALES-2026-014 yearly 8     # key for 8 users, 365 days
pnpm license check SETUWF-XXXXXX-...
pnpm license revoke SETUWF-XXXXXX-... --yes    # refund an unredeemed key
```

The order id must be unique per sale; the same id always produces the same key.

## Configuration

- `WORKFLOW_LICENSE_SECRET` — required in production to redeem keys (development
  and tests use a built-in fallback). Generate with `openssl rand -hex 32`.
- `NEXT_PUBLIC_WORKFLOW_BUY_URL` — optional; where "Buy a key" links
  (default `https://setutechnology.com/products/workflow`).
- `TRIAL_CONTACT_EMAIL` — also used as the "Contact sales" address.
- `PLATFORM_ROUTE_SECRET`, `PLATFORM_SECRET_KEY` — the owner console (below).

## Not done here

setutechnology.com does not yet sell Workflow keys. The website needs a copy of
`src/lib/license-key.ts`, a Workflow checkout (Cashfree / PayPal, as for QR
Menu) and a key email, using the same `WORKFLOW_LICENSE_SECRET`. Until then,
keys can be issued with `pnpm license issue`.

## Setu owner console (super admin)

Setu's own staff manage every firm from the owner console, modelled on the
Setu Retail admin. It lives only at `/console/<PLATFORM_ROUTE_SECRET>`; any
other path, and every `/api/platform/*` call without a console session,
answers 404. With the variable unset the console is off.

**Sign-in:** email + password, then a 6-digit code from an authenticator app
(linked by QR code at the first sign-in). Codes work once. Five wrong attempts
lock the account for 15 minutes. Sessions last 8 hours.

**Bootstrap:** `pnpm console:admin create you@setutechnology.com "Your Name"`
prints a one-time set-password link. After that, invite colleagues from the
Team page. `pnpm console:admin reset <email>` recovers someone locked out of
their authenticator.

| Page      | What it does |
| --------- | ------------ |
| Dashboard | Accounts, on trial, paying, ending in 14 days, plan ended, trial ended, locked, sign-ups this month; paying firms by plan; plan reminders with "Remind them now". |
| Accounts  | Search by firm, owner, email or workspace ID; filter by state. Each account: owner & contact, plan & usage, users, keys redeemed, contact-sales keys, reminders sent, Setu team activity. Actions: send plan reminder, add free days, issue contact-sales key, send the owner a password reset, lock / unlock. |
| Keys      | Contact-sales keys issued (show again, cancel unused) and every redeemed key, website ones included. |
| Activity  | Everything the Setu team did and the daily reminder job, filterable by what and who, with IP when `TRUST_PROXY=true`. |
| Team      | Staff, invite by email, reset sign-in, disable / enable. |

**Contact-sales keys** are issued against a payment reference (unique, so one
payment can't produce two keys) with the amount received. Two kinds:

- **Plan** — new, renewal or bigger: days (monthly, yearly or custom) and the
  plan's users.
- **Additional users** — adds users to a running plan without changing its end
  date (a key with 0 days).

Apply it to the firm at once, or untick and send the key for the account owner
to redeem in Admin → Subscription.

**Plan reminders** are emailed to the account owner automatically at 14, 7 and
1 days before the plan ends, by the daily cron job (`/api/cron/cleanup`), once
each per plan period.

The console shows plan, contact and usage counts only — never a firm's
clients, engagements or time entries.
