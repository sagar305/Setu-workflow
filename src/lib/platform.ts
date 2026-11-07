// ---------------------------------------------------------------------------
// The Setu owner console: Setu's own staff ("super admins") see every firm,
// issue license keys against payments, remind owners and adjust access.
//
// Two locks:
// 1. It only exists under /console/<PLATFORM_ROUTE_SECRET>. Without the
//    secret every console page and /api/platform/* route answers 404, and
//    with the variable unset the console is off entirely.
// 2. Staff sign in with password + authenticator app (platform-auth.ts).
//    They are not tenant users and their sessions are separate.
//
// The console shows plan, contact and usage only — never a firm's clients,
// engagements or time.
// ---------------------------------------------------------------------------
import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { lockFirm, requestReset, seatHolders, type Database } from "./auth";
import { invariant } from "./errors";
import { issueLicenseKey, readLicenseKey, MAX_LICENSE_DAYS, MAX_LICENSE_SEATS } from "./license-key";
import { BILLING_DAYS } from "./plans";
import { appUrl, sendEmail } from "./mail";
import { renderEmail } from "./email-template";
import { applyLicense, licenseSecret } from "./subscription";
import { accessState } from "./trial";
import { id } from "./validation";
import { platformRouteSecret, staffLog, type Staff } from "./platform-auth";

export {
  assertPlatformEnabled,
  platformCookie,
  platformPrincipal,
  platformRouteSecret,
} from "./platform-auth";
export type PlatformAdmin = Staff;

const DAY_MS = 86400_000;

export function isPlatformRoute(candidate: string | undefined): boolean {
  const secret = platformRouteSecret();
  if (!secret || !candidate) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(secret));
}

async function log(
  tx: Database,
  admin: Staff | null,
  action: string,
  firmId: string | null,
  metadata: Prisma.InputJsonValue = {},
) {
  await tx.platformAuditLog.create({
    data: { adminId: admin?.id ?? null, action, firmId, metadata, ip: admin?.ip ?? null },
  });
}

// ----- Accounts -------------------------------------------------------------


export async function listFirms(params: { q?: string; filter?: string }) {
  const q = params.q?.trim().slice(0, 100) ?? "";
  const firms = await db.firm.findMany({
    where: q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { firmName: { contains: q, mode: "insensitive" } },
            { users: { some: { email: { contains: q, mode: "insensitive" } } } },
            ...(z.string().uuid().safeParse(q).success ? [{ id: q }] : []),
          ],
        }
      : undefined,
    include: {
      _count: { select: { users: { where: seatHolders } } },
      users: {
        where: { isAccountOwner: true },
        select: { firstName: true, lastName: true, email: true, lastLoginAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const totals = await db.user.groupBy({
    by: ["firmId"],
    where: { status: { not: "Inactive" } },
    _count: { _all: true },
    _max: { lastLoginAt: true },
  });
  const byFirm = new Map(totals.map((t) => [t.firmId, t]));
  const now = new Date();
  const rows = firms.map((firm) => {
    const state = accessState(firm, now);
    const owner = firm.users[0] ?? null;
    const stats = byFirm.get(firm.id);
    return {
      id: firm.id,
      name: firm.displayName,
      registeredName: firm.firmName,
      status: firm.status,
      createdAt: firm.createdAt.toISOString(),
      plan: firm.status === "Suspended" ? "suspended" : state.plan,
      state,
      owner: owner ? { name: `${owner.firstName} ${owner.lastName}`, email: owner.email } : null,
      users: stats?._count._all ?? 0,
      lastActive: stats?._max.lastLoginAt?.toISOString() ?? null,
    };
  });
  const expiring = (r: (typeof rows)[number]) =>
    r.plan === "licensed" && (r.state.licenseDaysRemaining ?? 99) <= 14;
  const show = params.filter ?? "all";
  const matches: Record<string, (r: (typeof rows)[number]) => boolean> = {
    all: () => true,
    trial: (r) => r.plan === "trial" && !r.state.expired,
    "trial-ended": (r) => r.plan === "trial" && r.state.expired,
    paid: (r) => r.plan === "licensed",
    expiring,
    ended: (r) => r.plan === "lapsed",
    locked: (r) => r.plan === "suspended",
    ongoing: (r) => r.plan === "ongoing",
  };
  const filtered = rows.filter(matches[show] ?? matches.all);
  const count = (plan: string) => rows.filter((r) => r.plan === plan).length;
  return {
    rows: filtered,
    summary: {
      total: rows.length,
      licensed: count("licensed"),
      trial: count("trial"),
      lapsed: count("lapsed"),
      suspended: count("suspended"),
      expiring: rows.filter(expiring).length,
      paidSeats: rows.reduce((sum, r) => sum + (r.state.licensed ? (r.state.seats ?? 0) : 0), 0),
    },
  };
}

export async function firmDetail(firmId: string) {
  id.parse(firmId);
  const firm = await db.firm.findUnique({
    where: { id: firmId },
    include: { _count: { select: { users: { where: seatHolders } } } },
  });
  invariant(firm, "Firm not found.", 404);
  const [users, redemptions, issues, events, reminders, clients, engagements] = await Promise.all([
    db.user.findMany({
      where: { firmId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        hasSeat: true,
        isAccountOwner: true,
        lastLoginAt: true,
        role: { select: { roleName: true } },
      },
      orderBy: [{ isAccountOwner: "desc" }, { firstName: "asc" }],
    }),
    db.licenseRedemption.findMany({ where: { firmId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.licenseIssue.findMany({
      where: { firmId },
      include: { issuedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.platformAuditLog.findMany({
      where: { firmId },
      include: { admin: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.planReminder.findMany({ where: { firmId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.client.count({ where: { firmId } }),
    db.engagement.count({ where: { firmId } }),
  ]);
  const redeemed = new Set(redemptions.map((r) => r.keyId));
  return {
    firm: {
      id: firm.id,
      name: firm.displayName,
      registeredName: firm.firmName,
      status: firm.status,
      timezone: firm.timezone,
      createdAt: firm.createdAt.toISOString(),
      trialStartedAt: firm.trialStartedAt?.toISOString() ?? null,
    },
    state: accessState(firm),
    users,
    redemptions,
    issues: issues.map((issue) => ({ ...issue, amount: issue.amount?.toString() ?? null, redeemed: redeemed.has(issue.keyId) })),
    events,
    reminders,
    usage: { clients, engagements, users: users.filter((u) => u.status !== "Inactive").length },
  };
}

// ----- Keys -----------------------------------------------------------------

const issueInput = z
  .object({
    kind: z.enum(["plan", "addon"]),
    billing: z.enum(["monthly", "yearly", "custom"]).default("monthly"),
    days: z.coerce.number().int().min(1).max(MAX_LICENSE_DAYS).optional(),
    seats: z.coerce.number().int().min(1).max(MAX_LICENSE_SEATS),
    orderRef: z
      .string()
      .trim()
      .min(3, "Enter the payment or order reference.")
      .max(100)
      .regex(/^[\w.\-/#: ]+$/, "Use letters, numbers and - _ . / # : only."),
    amount: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(0).max(10_000_000).optional()),
    currency: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["INR", "USD"]).optional()),
    note: z.string().trim().max(500).default(""),
    firmId: z.preprocess((v) => (v === "" ? undefined : v), id.optional()),
    applyNow: z.boolean().default(false),
  })
  .refine((v) => v.kind === "addon" || v.billing !== "custom" || v.days, {
    message: "Enter the number of days.",
    path: ["days"],
  })
  .refine((v) => !v.applyNow || v.firmId, { message: "Choose the firm to apply it to.", path: ["firmId"] });

/**
 * Issues a key against a payment. The order reference is unique and the key
 * derives from it, so the same payment can never produce two keys. With
 * applyNow the key is redeemed for the firm straight away (no copy-paste for
 * the customer); otherwise it is shown once to send to them.
 */
export async function issueKey(admin: PlatformAdmin, input: unknown) {
  const data = issueInput.parse(input);
  const secret = licenseSecret();
  invariant(secret, "WORKFLOW_LICENSE_SECRET is not set on this server.", 503);
  const days = data.kind === "addon" ? 0 : data.billing === "custom" ? data.days! : BILLING_DAYS[data.billing];
  const key = issueLicenseKey(`console:${data.orderRef}`, days, data.seats, secret);
  const { keyId } = readLicenseKey(key, secret)!;

  return db.$transaction(
    async (tx) => {
      if (data.firmId) {
        await lockFirm(tx, data.firmId);
        invariant(await tx.firm.findUnique({ where: { id: data.firmId } }), "Firm not found.", 404);
      }
      invariant(
        !(await tx.licenseIssue.findUnique({ where: { orderRef: data.orderRef } })),
        "A key was already issued for this payment reference.",
        409,
      );
      await tx.licenseIssue.create({
        data: {
          keyId,
          orderRef: data.orderRef,
          kind: data.kind,
          days,
          seats: data.seats,
          amount: data.amount,
          currency: data.amount !== undefined ? (data.currency ?? "INR") : null,
          note: data.note,
          firmId: data.firmId ?? null,
          issuedById: admin.id,
        },
      });
      await log(tx, admin, "key.issued", data.firmId ?? null, {
        orderRef: data.orderRef,
        kind: data.kind,
        days,
        seats: data.seats,
        applyNow: data.applyNow,
      });
      const describe =
        data.kind === "addon"
          ? `${data.seats} additional user${data.seats === 1 ? "" : "s"}`
          : `${days} days for ${data.seats} users`;
      if (!data.applyNow) return { key, message: `Key issued: ${describe}. Send it to the customer.` };
      const applied = await applyLicense(
        tx,
        data.firmId!,
        { keyId, days, seats: data.seats },
        { userId: null, source: "owner-console", actorLabel: admin.email },
      );
      return { key, message: `Applied to the firm: ${applied.message}` };
    },
    { timeout: 30000, maxWait: 10000 },
  );
}

export async function listKeys(q?: string) {
  const term = q?.trim().slice(0, 100);
  const issues = await db.licenseIssue.findMany({
    where: term
      ? {
          OR: [
            { orderRef: { contains: term, mode: "insensitive" } },
            { note: { contains: term, mode: "insensitive" } },
            { firm: { displayName: { contains: term, mode: "insensitive" } } },
          ],
        }
      : undefined,
    include: {
      firm: { select: { id: true, displayName: true } },
      issuedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const redemptions = await db.licenseRedemption.findMany({
    where: { keyId: { in: issues.map((i) => i.keyId) } },
    include: { firm: { select: { id: true, displayName: true } } },
  });
  const byKey = new Map(redemptions.map((r) => [r.keyId, r]));
  return issues.map((issue) => {
    const redemption = byKey.get(issue.keyId);
    return {
      id: issue.id,
      keyId: issue.keyId,
      orderRef: issue.orderRef,
      kind: issue.kind,
      days: issue.days,
      seats: issue.seats,
      amount: issue.amount?.toString() ?? null,
      currency: issue.currency,
      note: issue.note,
      createdAt: issue.createdAt.toISOString(),
      issuedBy: issue.issuedBy?.name ?? "CLI",
      intendedFirm: issue.firm,
      status: redemption ? (redemption.revoked ? "cancelled" : "redeemed") : "unused",
      redeemedBy: redemption?.firm ?? null,
      redeemedAt: redemption?.createdAt.toISOString() ?? null,
    };
  });
}

/** Shows an issued key again (it derives from the order reference). */
export async function revealKey(admin: PlatformAdmin, issueId: string) {
  id.parse(issueId);
  const secret = licenseSecret();
  invariant(secret, "WORKFLOW_LICENSE_SECRET is not set on this server.", 503);
  const issue = await db.licenseIssue.findUnique({ where: { id: issueId } });
  invariant(issue, "Key not found.", 404);
  await staffLog(admin.id, "key.revealed", { firmId: issue.firmId, ip: admin.ip, metadata: { orderRef: issue.orderRef } });
  return { key: issueLicenseKey(`console:${issue.orderRef}`, issue.days, issue.seats, secret) };
}

/** Cancels an unused key, e.g. for a refund. */
export async function cancelKey(admin: PlatformAdmin, issueId: string) {
  id.parse(issueId);
  return db.$transaction(async (tx) => {
    const issue = await tx.licenseIssue.findUnique({ where: { id: issueId } });
    invariant(issue, "Key not found.", 404);
    const existing = await tx.licenseRedemption.findUnique({ where: { keyId: issue.keyId } });
    invariant(!existing?.revoked, "This key is already cancelled.", 409);
    invariant(!existing, "This key has been redeemed, so it cannot be cancelled.", 409);
    await tx.licenseRedemption.create({
      data: { keyId: issue.keyId, days: issue.days, seats: issue.seats, revoked: true },
    });
    await log(tx, admin, "key.cancelled", issue.firmId, { orderRef: issue.orderRef });
    return { message: "Key cancelled. It can no longer be redeemed." };
  });
}

// ----- Direct firm actions --------------------------------------------------

const statusInput = z
  .object({ status: z.enum(["Active", "Suspended"]), reason: z.string().trim().max(500).default("") })
  .refine((v) => v.status === "Active" || v.reason, { message: "Enter a reason.", path: ["reason"] });

/** Suspending signs everyone in the firm out and blocks sign-in; data is kept. */
export async function setFirmStatus(admin: PlatformAdmin, firmId: string, input: unknown) {
  id.parse(firmId);
  const { status, reason } = statusInput.parse(input);
  return db.$transaction(async (tx) => {
    await lockFirm(tx, firmId);
    const firm = await tx.firm.findUnique({ where: { id: firmId } });
    invariant(firm, "Firm not found.", 404);
    if (firm.status === status) return { message: "No change." };
    await tx.firm.update({ where: { id: firmId }, data: { status } });
    if (status !== "Active") await tx.session.deleteMany({ where: { firmId } });
    await log(tx, admin, status === "Active" ? "account.unlocked" : "account.locked", firmId, { reason });
    return { message: status === "Active" ? "Firm reactivated." : "Firm suspended. Everyone has been signed out." };
  });
}


// ----- Free days, owner password reset ------------------------------------

const daysInput = z.object({
  days: z.coerce.number().int().min(1, "1 to 365 days.").max(365, "1 to 365 days."),
  reason: z.string().trim().min(1, "Enter a reason.").max(500),
});

/**
 * Adds free days: to the running (or ended) plan, otherwise to the trial. A
 * lapsed plan restarts from today with its previous number of users.
 */
export async function grantDays(admin: PlatformAdmin, firmId: string, input: unknown) {
  id.parse(firmId);
  const { days, reason } = daysInput.parse(input);
  return db.$transaction(async (tx) => {
    await lockFirm(tx, firmId);
    const firm = await tx.firm.findUnique({ where: { id: firmId } });
    invariant(firm, "Firm not found.", 404);
    const now = Date.now();
    let what: "plan" | "trial";
    let newEnd: Date;
    if (firm.licenseExpiresAt) {
      what = "plan";
      newEnd = new Date(Math.max(now, firm.licenseExpiresAt.getTime()) + days * DAY_MS);
      await tx.firm.update({ where: { id: firmId }, data: { licenseExpiresAt: newEnd } });
    } else {
      invariant(
        firm.isTrial && firm.trialStartedAt && firm.trialEndsAt,
        "This firm has no plan or activated trial to add days to.",
      );
      what = "trial";
      newEnd = new Date(Math.max(now, firm.trialEndsAt.getTime()) + days * DAY_MS);
      await tx.firm.update({ where: { id: firmId }, data: { trialEndsAt: newEnd } });
    }
    await tx.auditLog.create({
      data: {
        firmId,
        actorUserId: null,
        action: what === "plan" ? "firm.free_days_added" : "firm.trial_extended",
        entityType: "Firm",
        entityId: firmId,
        metadata: { source: "owner-console", by: admin.email, days, reason, newEnd: newEnd.toISOString() },
      },
    });
    await log(tx, admin, "account.free_days", firmId, { days, reason, to: what, newEnd: newEnd.toISOString() });
    return { message: `Added ${days} free day${days === 1 ? "" : "s"} to the ${what}. It now ends ${newEnd.toDateString()}.` };
  });
}

/** Kept for callers that only know trials. */
export async function extendTrial(admin: PlatformAdmin, firmId: string, input: unknown) {
  const { days } = z.object({ days: z.coerce.number().int().min(1).max(90) }).parse(input);
  return grantDays(admin, firmId, { days, reason: "Trial extension" });
}

export async function sendOwnerReset(admin: PlatformAdmin, firmId: string) {
  id.parse(firmId);
  const owner = await db.user.findFirst({ where: { firmId, isAccountOwner: true } });
  invariant(owner, "This firm has no account owner.", 404);
  invariant(owner.status === "Active", "The account owner hasn't activated their account yet.");
  await requestReset(owner.email, `console:${admin.id}`);
  await staffLog(admin.id, "account.password_reset_sent", { firmId, ip: admin.ip, metadata: { email: owner.email } });
  return { message: `Password reset link sent to ${owner.email}.` };
}

// ----- Plan reminders ------------------------------------------------------

/** Automatic reminders go out at these days before a plan ends. */
export const REMINDER_DAYS = [14, 7, 1] as const;

async function sendReminder(
  firmId: string,
  options: { kind: "auto" | "manual"; admin?: PlatformAdmin | null; daysBefore?: number },
) {
  const firm = await db.firm.findUnique({
    where: { id: firmId },
    include: { users: { where: { isAccountOwner: true, status: "Active" }, take: 1 } },
  });
  const owner = firm?.users[0];
  if (!firm || !owner || !firm.licenseExpiresAt || firm.status !== "Active") return false;
  const state = accessState(firm);
  const left = state.licenseDaysRemaining ?? 0;
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: firm.timezone }).format(firm.licenseExpiresAt);
  const subject = state.licensed
    ? `Your Setu Workflow plan ends ${left <= 1 ? "tomorrow" : `in ${left} days`}`
    : "Your Setu Workflow plan has ended";
  const buyUrl = process.env.NEXT_PUBLIC_WORKFLOW_BUY_URL || "https://setutechnology.com/products/workflow";
  await sendEmail(
    owner.email,
    subject,
    renderEmail({
      preheader: state.licensed
        ? `Renew before ${date} to keep editing. Your data is always safe.`
        : "Your workspace is read-only until you renew. Nothing has been deleted.",
      heading: state.licensed
        ? `Your plan ends ${left <= 1 ? "tomorrow" : `in ${left} days`}`
        : "Your plan has ended",
      greeting: `Hi ${owner.firstName},`,
      paragraphs: state.licensed
        ? [
            `The Setu Workflow plan for **${firm.displayName}** ends on **${date}**.`,
            "Renew before then to keep your team working without interruption. If it lapses, your workspace becomes read-only — everyone can still view and export, and nothing is deleted.",
          ]
        : [
            `The Setu Workflow plan for **${firm.displayName}** ended on **${date}**.`,
            "Your workspace is now read-only: your team can view and export, but not make changes. Nothing has been deleted — renew and everything carries on where you left it.",
          ],
      button: { label: "Renew your plan", url: buyUrl },
      steps: {
        title: "How to renew",
        items: [
          "Buy a key on setutechnology.com — monthly or yearly.",
          `Sign in as the account owner and open **Admin → Subscription** (${appUrl()}/admin/subscription).`,
          "Paste the key and press Redeem. New days are added after your current plan ends.",
        ],
      },
      details: [
        ["Firm", firm.displayName],
        ["Plan users", String(state.seats ?? "—")],
        [state.licensed ? "Plan ends" : "Plan ended", date],
      ],
      note: "Need more users, an invoice or help renewing? Just reply to this email.",
    }),
  );
  await db.planReminder.create({
    data: {
      firmId,
      licenseEndsAt: firm.licenseExpiresAt,
      daysBefore: options.daysBefore ?? left,
      kind: options.kind,
      sentTo: owner.email,
      adminId: options.admin?.id ?? null,
    },
  });
  await staffLog(options.admin?.id ?? null, options.kind === "auto" ? "reminders.auto_sent" : "reminders.sent", {
    firmId,
    ip: options.admin?.ip,
    metadata: { email: owner.email, daysLeft: left },
  });
  return true;
}

export async function remindOwner(admin: PlatformAdmin, firmId: string) {
  id.parse(firmId);
  invariant(await sendReminder(firmId, { kind: "manual", admin }), "This firm has no plan or no active account owner to remind.");
  return { message: "Reminder sent to the account owner." };
}

/** "Remind them now": every plan ending within `days`, skipping anyone reminded in the last 24 hours. */
export async function remindAll(admin: PlatformAdmin, input: unknown) {
  const { days } = z.object({ days: z.coerce.number().int().min(1, "Choose 1 to 60 days.").max(60, "Choose 1 to 60 days.") }).parse(input);
  const now = new Date();
  const firms = await db.firm.findMany({
    where: { status: "Active", licenseExpiresAt: { gt: now, lte: new Date(now.getTime() + days * DAY_MS) } },
    select: { id: true },
  });
  const recent = new Set(
    (
      await db.planReminder.findMany({
        where: { firmId: { in: firms.map((f) => f.id) }, createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
        select: { firmId: true },
      })
    ).map((r) => r.firmId),
  );
  let sent = 0;
  let skipped = 0;
  for (const firm of firms) {
    if (recent.has(firm.id)) {
      skipped++;
      continue;
    }
    if (await sendReminder(firm.id, { kind: "manual", admin }).catch(() => false)) sent++;
    else skipped++;
  }
  return { sent, skipped, message: `${sent} reminder${sent === 1 ? "" : "s"} sent${skipped ? `, ${skipped} skipped` : ""}.` };
}

/** Daily job: one automatic reminder per plan at 14, 7 and 1 days before it ends. */
export async function sendDueReminders(now = new Date()) {
  const firms = await db.firm.findMany({
    where: { status: "Active", licenseExpiresAt: { gt: now, lte: new Date(now.getTime() + 15 * DAY_MS) } },
  });
  let sent = 0;
  for (const firm of firms) {
    const left = accessState(firm, now).licenseDaysRemaining ?? 0;
    const due = REMINDER_DAYS.find((d) => left === d);
    if (!due) continue;
    const already = await db.planReminder.findFirst({
      where: { firmId: firm.id, kind: "auto", daysBefore: due, licenseEndsAt: firm.licenseExpiresAt! },
    });
    if (already) continue;
    if (await sendReminder(firm.id, { kind: "auto", daysBefore: due }).catch(() => false)) sent++;
  }
  return { remindersSent: sent };
}

// ----- Dashboard and activity ---------------------------------------------

export async function dashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [firms, signups, reminders, plans] = await Promise.all([
    db.firm.findMany({ include: { _count: { select: { users: { where: seatHolders } } } } }),
    db.firm.count({ where: { createdAt: { gte: monthStart } } }),
    db.planReminder.count({ where: { createdAt: { gt: new Date(now.getTime() - 7 * DAY_MS) } } }),
    // The latest plan (not top-up) each firm redeemed tells monthly from yearly.
    db.licenseRedemption.findMany({
      where: { revoked: false, days: { gt: 0 }, firmId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { firmId: true, days: true },
    }),
  ]);
  const lastPlan = new Map<string, number>();
  for (const p of plans) if (p.firmId && !lastPlan.has(p.firmId)) lastPlan.set(p.firmId, p.days);
  const states = firms.map((f) => ({ firm: f, state: accessState(f, now) }));
  const active = states.filter((s) => s.firm.status === "Active");
  const paying = active.filter((s) => s.state.licensed);
  const byPlan = new Map<string, number>();
  for (const { firm, state } of paying) {
    const days = lastPlan.get(firm.id) ?? 30;
    const label = `${days >= 365 ? "Yearly" : days >= 28 && days <= 31 ? "Monthly" : "Custom"} · ${state.seats} users`;
    byPlan.set(label, (byPlan.get(label) ?? 0) + 1);
  }
  return {
    accounts: firms.length,
    trial: active.filter((s) => s.state.plan === "trial" && !s.state.expired).length,
    paying: paying.length,
    expiringIn14Days: paying.filter((s) => (s.state.licenseDaysRemaining ?? 99) <= 14).length,
    planEnded: active.filter((s) => s.state.lapsed).length,
    trialEnded: active.filter((s) => s.state.plan === "trial" && s.state.expired).length,
    locked: firms.filter((f) => f.status !== "Active").length,
    signupsThisMonth: signups,
    paidUsers: paying.reduce((sum, s) => sum + (s.state.seats ?? 0), 0),
    paidByPlan: [...byPlan.entries()].map(([name, accounts]) => ({ name, accounts })).sort((a, b) => b.accounts - a.accounts),
    remindersLast7Days: reminders,
  };
}

export async function activity(params: { what?: string; who?: string }) {
  const what = ["account.", "key.", "reminders.", "admin."].includes(params.what ?? "") ? params.what! : "";
  const who = z.string().uuid().safeParse(params.who).success ? params.who! : undefined;
  const rows = await db.platformAuditLog.findMany({
    where: { ...(what ? { action: { startsWith: what } } : {}), ...(who ? { adminId: who } : {}) },
    include: { admin: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const firmIds = [...new Set(rows.map((r) => r.firmId).filter((v): v is string => !!v))];
  const firms = new Map(
    (await db.firm.findMany({ where: { id: { in: firmIds } }, select: { id: true, displayName: true } })).map((f) => [f.id, f.displayName]),
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    metadata: r.metadata as Record<string, unknown>,
    who: r.admin?.name ?? (r.action.startsWith("reminders.auto") ? "Daily reminder job" : "Command line"),
    firm: r.firmId ? { id: r.firmId, name: firms.get(r.firmId) ?? "Deleted firm" } : null,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Every key redeemed by any firm, website keys included. */
export async function listRedemptions() {
  const rows = await db.licenseRedemption.findMany({
    where: { revoked: false, firmId: { not: null } },
    include: { firm: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const issued = new Set(
    (await db.licenseIssue.findMany({ where: { keyId: { in: rows.map((r) => r.keyId) } }, select: { keyId: true } })).map((i) => i.keyId),
  );
  return rows.map((r) => ({
    id: r.id,
    firm: r.firm,
    days: r.days,
    seats: r.seats,
    newExpiresAt: r.newExpiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    source: issued.has(r.keyId) ? (r.userId ? "Contact-sales key" : "Applied by Setu") : "Website",
  }));
}
