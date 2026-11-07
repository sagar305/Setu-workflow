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

## Super admin

Each firm has exactly one **account owner** (called "account owner" before migration `202611070002`): the administrator who signed up (or,
for firms that existed before this change, the earliest Firm Admin — set by the
`202611070001_subscriptions` migration). Shown with a "Account owner" badge in
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

## Not done here

setutechnology.com does not yet sell Workflow keys. The website needs a copy of
`src/lib/license-key.ts`, a Workflow checkout (Cashfree / PayPal, as for QR
Menu) and a key email, using the same `WORKFLOW_LICENSE_SECRET`. Until then,
keys can be issued with `pnpm license issue`.
