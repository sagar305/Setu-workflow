import {
  Prisma,
  type Engagement,
  type EngagementStaffSlot,
} from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import {
  principal,
  hasPermission,
  requirePermission,
  tenantMutation,
  audit,
  type Database,
  type Principal,
} from "./auth";
import { invariant } from "./errors";
import { id } from "./validation";
import type { PermissionKey } from "./permissions";
import { catalogInput, definitionInput } from "./client-validation";
import { normalizeName } from "./client-constants";
import { typedValue } from "./custom-field-values";
import {
  applyWorkflowInTransaction,
  workflowSummaryInclude,
} from "./workflows";
import {
  engagementInput,
  engagementListInput,
  nullableId,
  type EngagementInput,
  type EngagementFilters,
} from "./engagement-validation";
import {
  STAFF,
  DATE_FIELDS,
  ENGAGEMENT_TYPES,
  engagementLabel,
  firmDates,
  isOverdue,
} from "./engagement-constants";

const person = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    status: true,
    email: true,
    role: { select: { roleName: true, active: true } },
    primaryOffice: { select: { officeName: true } },
  },
} as const;
export const engagementInclude = {
  workflow: { include: workflowSummaryInclude },
  client: {
    select: {
      id: true,
      clientCode: true,
      displayName: true,
      legalName: true,
      entityType: { select: { name: true } },
    },
  },
  serviceLine: true,
  engagementType: true,
  office: { select: { id: true, officeName: true } },
  partner: person,
  manager: person,
  reviewer: person,
  preparer: person,
} satisfies Prisma.EngagementInclude;
export async function engagementActor(
  token: string | undefined,
  permission: PermissionKey = "engagements.view",
) {
  const actor = await principal(token);
  requirePermission(actor, "engagements.view");
  requirePermission(actor, permission);
  return actor;
}
export function engagementVisibility(
  actor: Principal,
): Prisma.EngagementWhereInput {
  const where = { firmId: actor.firmId };
  if (hasPermission(actor, "engagements.view_all")) return where;
  if (hasPermission(actor, "engagements.view_staffed"))
    return { ...where, OR: STAFF.map((key) => ({ [key]: actor.id })) };
  if (hasPermission(actor, "engagements.view_review"))
    return {
      ...where,
      OR: [{ reviewerId: actor.id }, { preparerId: actor.id }],
    };
  return { ...where, preparerId: actor.id };
}
export function canSeeEngagement(
  actor: Principal,
  row: Pick<
    Engagement,
    "partnerId" | "managerId" | "reviewerId" | "preparerId"
  >,
) {
  return (
    hasPermission(actor, "engagements.view_all") ||
    (hasPermission(actor, "engagements.view_staffed") &&
      STAFF.some((k) => row[k] === actor.id)) ||
    (hasPermission(actor, "engagements.view_review") &&
      row.reviewerId === actor.id) ||
    row.preparerId === actor.id
  );
}
export function engagementMutation<T>(
  token: string | undefined,
  permission: PermissionKey,
  work: (tx: Database, actor: Principal) => Promise<T>,
) {
  return tenantMutation(token, permission, async (tx, actor) => {
    requirePermission(actor, "engagements.view");
    return work(tx, actor);
  });
}
export async function seedEngagementCatalogs(tx: Database, firmId: string) {
  for (const name of ENGAGEMENT_TYPES)
    await tx.engagementType.upsert({
      where: {
        firmId_normalizedName: { firmId, normalizedName: normalizeName(name) },
      },
      create: { firmId, name, normalizedName: normalizeName(name) },
      update: {},
    });
}
export async function engagementOptions(token: string | undefined) {
  const actor = await engagementActor(token);
  const firmId = actor.firmId;
  const [offices, users, serviceLines, types, definitions] = await Promise.all([
    db.office.findMany({
      where: { firmId },
      select: { id: true, officeName: true, active: true },
      orderBy: { officeName: "asc" },
    }),
    db.user.findMany({
      where: { firmId },
      ...person,
      orderBy: { firstName: "asc" },
    }),
    db.serviceLine.findMany({ where: { firmId }, orderBy: { name: "asc" } }),
    db.engagementType.findMany({ where: { firmId }, orderBy: { name: "asc" } }),
    db.engagementCustomFieldDefinition.findMany({
      where: { firmId },
      orderBy: { name: "asc" },
    }),
  ]);
  const workflowTemplates =
    hasPermission(actor, "workflows.apply") ||
    hasPermission(actor, "workflow_templates.view")
      ? await db.workflowTemplate.findMany({
          where: { firmId, status: "Published", active: true },
          select: {
            id: true,
            name: true,
            versionNumber: true,
            serviceLineId: true,
            engagementTypeId: true,
            stages: {
              where: { active: true },
              orderBy: { sequence: "asc" },
              select: { name: true, defaultOwnerType: true, targetDays: true },
            },
          },
          orderBy: [{ name: "asc" }, { versionNumber: "desc" }],
        })
      : [];
  return {
    offices,
    users,
    serviceLines,
    types,
    definitions,
    workflowTemplates,
  };
}
// Searchable, capped client picker returns only minimum directory/default information.
export async function engagementClients(
  token: string | undefined,
  input: unknown,
) {
  const actor = await engagementActor(token);
  const q = z
    .object({ q: z.string().max(200).default(""), id: nullableId })
    .parse(input);
  const canChoose =
    hasPermission(actor, "engagements.create") ||
    hasPermission(actor, "clients.view");
  const where: Prisma.ClientWhereInput = {
    firmId: actor.firmId,
    ...(!canChoose
      ? { engagements: { some: engagementVisibility(actor) } }
      : {}),
    ...(q.id ? { id: q.id } : {}),
    ...(q.q
      ? {
          OR: [
            { clientCode: { contains: q.q, mode: "insensitive" } },
            { displayName: { contains: q.q, mode: "insensitive" } },
            { legalName: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  return db.client.findMany({
    where,
    take: 30,
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      clientCode: true,
      displayName: true,
      primaryOfficeId: true,
      responsiblePartnerId: true,
      responsibleManagerId: true,
      responsiblePartner: person,
      responsibleManager: person,
      primaryOffice: { select: { officeName: true, active: true } },
      services: {
        where: { serviceLine: { active: true } },
        select: { serviceLineId: true },
      },
    },
  });
}
export function engagementWhere(
  actor: Principal,
  f: EngagementFilters,
): Prisma.EngagementWhereInput {
  const days = firmDates(actor.firm.timezone);
  const and: Prisma.EngagementWhereInput[] = [engagementVisibility(actor)];
  if (f.workflowTemplateId || f.workflowOwnerId || f.workflowStage)
    requirePermission(actor, "workflows.view");
  if (f.workflowTemplateId)
    and.push({ workflow: { sourceWorkflowTemplateId: f.workflowTemplateId } });
  if (f.workflowOwnerId)
    and.push({
      workflow: {
        status: "Active",
        currentStage: { assignedUserId: f.workflowOwnerId },
      },
    });
  if (f.workflowStage)
    and.push({ workflow: { currentStage: { name: f.workflowStage } } });
  for (const key of [
    "clientId",
    "serviceLineId",
    "engagementTypeId",
    "officeId",
    ...STAFF,
    "status",
    "priority",
    "periodType",
  ] as const)
    if (f[key]) and.push({ [key]: f[key] });
  if (f.q)
    and.push({
      OR: [
        { engagementCode: { contains: f.q, mode: "insensitive" } },
        { engagementName: { contains: f.q, mode: "insensitive" } },
        {
          client: {
            OR: [
              { clientCode: { contains: f.q, mode: "insensitive" } },
              { displayName: { contains: f.q, mode: "insensitive" } },
              { legalName: { contains: f.q, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  if (f.recurring) and.push({ recurring: f.recurring === "true" });
  if (f.dueFrom || f.dueTo)
    and.push({
      dueDate: {
        ...(f.dueFrom ? { gte: new Date(f.dueFrom) } : {}),
        ...(f.dueTo ? { lte: new Date(f.dueTo) } : {}),
      },
    });
  if (f.periodFrom)
    and.push({ periodEndDate: { gte: new Date(f.periodFrom) } });
  if (f.periodTo) and.push({ periodStartDate: { lte: new Date(f.periodTo) } });
  if (["active", "overdue", "week"].includes(f.scope))
    and.push({ status: { notIn: ["Completed", "Cancelled"] } });
  if (f.scope === "completed") and.push({ status: "Completed" });
  if (f.scope === "overdue")
    and.push({ dueDate: { lt: new Date(days.today) } });
  if (f.scope === "week")
    and.push({
      dueDate: { gte: new Date(days.weekStart), lte: new Date(days.weekEnd) },
    });
  return { AND: and };
}
export async function listEngagements(
  token: string | undefined,
  input: unknown,
) {
  const actor = await engagementActor(token);
  const filters = engagementListInput.parse(input);
  const where = engagementWhere(actor, filters);
  const days = firmDates(actor.firm.timezone);
  return db.$transaction(
    async (tx) => {
      const scope = engagementVisibility(actor),
        active = {
          ...scope,
          status: {
            notIn: ["Completed", "Cancelled"] as ("Completed" | "Cancelled")[],
          },
        };
      const [items, total, activeCount, week, overdue, completed, onHold] =
        await Promise.all([
          tx.engagement.findMany({
            where,
            include: engagementInclude,
            orderBy: [{ [filters.sort]: filters.direction }, { id: "asc" }],
            skip: (filters.page - 1) * filters.pageSize,
            take: filters.pageSize,
          }),
          tx.engagement.count({ where }),
          tx.engagement.count({ where: active }),
          tx.engagement.count({
            where: {
              AND: [
                active,
                {
                  dueDate: {
                    gte: new Date(days.weekStart),
                    lte: new Date(days.weekEnd),
                  },
                },
              ],
            },
          }),
          tx.engagement.count({
            where: { AND: [active, { dueDate: { lt: new Date(days.today) } }] },
          }),
          tx.engagement.count({
            where: { AND: [scope, { status: "Completed" }] },
          }),
          tx.engagement.count({
            where: { AND: [scope, { status: "OnHold" }] },
          }),
        ]);
      return {
        items: items.map((row) => ({
          ...row,
          workflow: hasPermission(actor, "workflows.view")
            ? row.workflow
            : null,
          overdue: isOverdue(row, days.today),
        })),
        total,
        filters,
        days,
        timezone: actor.firm.timezone,
        summary: { active: activeCount, week, overdue, completed, onHold },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function findEngagement(
  tx: Database,
  actor: Principal,
  recordId: string,
) {
  const row = await tx.engagement.findFirst({
    where: { AND: [engagementVisibility(actor), { id: id.parse(recordId) }] },
    include: engagementInclude,
  });
  invariant(row, "Engagement not found.", 404);
  return row;
}
export async function getEngagement(
  token: string | undefined,
  recordId: string,
) {
  const actor = await engagementActor(token);
  const row = await findEngagement(db, actor, recordId);
  const customValues = await db.engagementCustomFieldValue.findMany({
    where: { firmId: actor.firmId, engagementId: row.id },
    include: { definition: true },
  });
  return {
    ...row,
    workflow: hasPermission(actor, "workflows.view") ? row.workflow : null,
    customValues,
    overdue: isOverdue(row, firmDates(actor.firm.timezone).today),
  };
}
export async function engagementActivity(
  token: string | undefined,
  recordId: string,
  page = 1,
) {
  const actor = await engagementActor(token);
  await findEngagement(db, actor, recordId);
  z.number().int().min(1).max(100000).parse(page);
  const where = {
    firmId: actor.firmId,
    entityType: "Engagement",
    entityId: recordId,
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: { select: { firstName: true, lastName: true } } },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      skip: (page - 1) * 25,
      take: 25,
    }),
    db.auditLog.count({ where }),
  ]);
  return {
    total,
    page,
    items: rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      actor: r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : "System",
      action: r.action.replace("engagement.", "").replaceAll("_", " "),
      description:
        typeof (r.metadata as { description?: unknown }).description ===
        "string"
          ? (r.metadata as { description: string }).description
          : "",
    })),
  };
}
export const engagementEvent = (
  tx: Database,
  actor: Principal,
  engagementId: string,
  action: string,
  description: string,
  details: Prisma.InputJsonObject = {},
) =>
  audit(
    tx,
    actor.firmId,
    actor.id,
    `engagement.${action}`,
    "Engagement",
    engagementId,
    { ...details, description },
  );
export function engagementEditData(row: Engagement) {
  return {
    ...row,
    ...Object.fromEntries(
      DATE_FIELDS.map((key) => [
        key,
        row[key]?.toISOString().slice(0, 10) ?? null,
      ]),
    ),
    customFields: {},
  };
}
export async function validateEngagementReferences(
  tx: Database,
  actor: Principal,
  data: EngagementInput,
  before?: Engagement,
) {
  const firmId = actor.firmId;
  const client = await tx.client.findFirst({
    where: { firmId, id: data.clientId },
    select: { id: true },
  });
  invariant(client, "Select a client in your firm.");
  const [office, service, type] = await Promise.all([
    tx.office.findFirst({ where: { firmId, id: data.officeId } }),
    tx.serviceLine.findFirst({ where: { firmId, id: data.serviceLineId } }),
    tx.engagementType.findFirst({
      where: { firmId, id: data.engagementTypeId },
    }),
  ]);
  invariant(
    office && (office.active || before?.officeId === office.id),
    "Select an active office in your firm.",
  );
  invariant(
    service && (service.active || before?.serviceLineId === service.id),
    "Select an active service in your firm.",
  );
  invariant(
    type && (type.active || before?.engagementTypeId === type.id),
    "Select an active engagement type in your firm.",
  );
  const ids = [
    ...new Set(
      STAFF.map((k) => data[k]).filter((v): v is string => Boolean(v)),
    ),
  ];
  const users = await tx.user.findMany({
    where: {
      firmId,
      id: { in: ids },
      status: "Active",
      role: { active: true },
    },
    select: { id: true, firstName: true, lastName: true },
  });
  invariant(users.length === ids.length, "Select active staff in your firm.");
  invariant(
    !(await tx.engagement.findFirst({
      where: {
        firmId,
        engagementCode: data.engagementCode,
        ...(before ? { id: { not: before.id } } : {}),
      },
    })),
    "Engagement Code already exists in your firm.",
    409,
  );
  const linked = await tx.clientServiceLine.findUnique({
    where: {
      firmId_clientId_serviceLineId: {
        firmId,
        clientId: data.clientId,
        serviceLineId: data.serviceLineId,
      },
    },
  });
  // Historical services can remain after a Client Master association was removed.
  const unchanged =
    before?.clientId === data.clientId &&
    before?.serviceLineId === data.serviceLineId;
  if (!linked && !unchanged) {
    invariant(
      data.associateService,
      "Confirm adding this Service Line to the Client.",
    );
    requirePermission(actor, "clients.manage_services");
    invariant(service.active, "Select an active service.");
  }
  return {
    client,
    office,
    service,
    type,
    users,
    needsAssociation: !linked && !unchanged,
  };
}
async function writeFields(
  tx: Database,
  actor: Principal,
  engagementId: string,
  input: EngagementInput["customFields"],
) {
  const defs = await tx.engagementCustomFieldDefinition.findMany({
    where: {
      firmId: actor.firmId,
      id: { in: Object.keys(input) },
      active: true,
    },
  });
  invariant(
    defs.length === Object.keys(input).length,
    "Custom field not found or inactive.",
  );
  for (const def of defs) {
    const where = { firmId: actor.firmId, engagementId, definitionId: def.id };
    const old = await tx.engagementCustomFieldValue.findUnique({
      where: { firmId_engagementId_definitionId: where },
    });
    const value = input[def.id];
    if (value === null || value === "") {
      if (old) {
        await tx.engagementCustomFieldValue.delete({ where: { id: old.id } });
        await engagementEvent(
          tx,
          actor,
          engagementId,
          "custom_field_changed",
          `${def.name} cleared.`,
        );
      }
      continue;
    }
    const typed = typedValue(def, value);
    if (
      old &&
      Object.entries(typed).every(
        ([k, v]) => String(old[k as keyof typeof old]) === String(v),
      )
    )
      continue;
    await tx.engagementCustomFieldValue.upsert({
      where: { firmId_engagementId_definitionId: where },
      create: { ...where, ...typed },
      update: typed,
    });
    await engagementEvent(
      tx,
      actor,
      engagementId,
      "custom_field_changed",
      `${def.name} changed.`,
    );
  }
}

export async function saveEngagementInTransaction(
  tx: Database,
  actor: Principal,
  input: unknown,
  recordId?: string,
  mode: "edit" | "status" | "assign" = "edit",
) {
  const permission: PermissionKey = !recordId
    ? "engagements.create"
    : mode === "status"
      ? "engagements.change_status"
      : mode === "assign"
        ? "engagements.assign"
        : "engagements.edit";
  requirePermission(actor, permission);
  const before = recordId
    ? await findEngagement(tx, actor, recordId)
    : undefined;
  const data = engagementInput.parse(input);
  if (before?.workflow) {
    invariant(
      data.serviceLineId === before.serviceLineId &&
        data.engagementTypeId === before.engagementTypeId,
      "Service and Engagement Type are preserved once a workflow is applied.",
    );
    invariant(
      data.status === before.status ||
        (data.status !== "Completed" && before.workflow.status !== "Completed"),
      "Complete or reopen this Engagement from its Workflow tab.",
    );
  }
  if (before)
    invariant(
      data.version === before.version,
      "This engagement changed since you opened it. Reload and try again.",
      409,
    );
  if (!before)
    invariant(
      canSeeEngagement(actor, data),
      "Assign yourself to a permitted staffing slot when creating an engagement.",
    );
  const changed = (key: keyof EngagementInput) =>
    String(data[key] ?? "") !==
    String(
      before
        ? (engagementEditData(before)[
            key as keyof ReturnType<typeof engagementEditData>
          ] ?? "")
        : "",
    );
  if (
    (before && changed("budgetHours")) ||
    (!before && data.budgetHours !== null)
  )
    requirePermission(actor, "engagements.manage_budget");
  if (
    (before && (changed("status") || changed("completedDate"))) ||
    (!before && !["Draft", "Planned"].includes(data.status))
  )
    requirePermission(actor, "engagements.change_status");
  if (
    STAFF.some((key) => (before ? changed(key) : Boolean(data[key]))) ||
    (before && changed("allocationDate"))
  )
    requirePermission(actor, "engagements.assign");
  const refs = await validateEngagementReferences(tx, actor, data, before);
  if (refs.needsAssociation) {
    await tx.clientServiceLine.create({
      data: {
        firmId: actor.firmId,
        clientId: data.clientId,
        serviceLineId: data.serviceLineId,
      },
    });
    await tx.client.update({
      where: { id: data.clientId },
      data: { version: { increment: 1 }, updatedByUserId: actor.id },
    });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      "client.service_added",
      "Client",
      data.clientId,
      {
        description: `Service added with engagement confirmation: ${refs.service.name}.`,
      },
    );
  }
  const {
    version: _version,
    customFields,
    associateService: _associate,
    statusComment,
    workflowTemplateId,
    ...values
  } = data;
  void _version;
  void _associate;
  const dates = Object.fromEntries(
    DATE_FIELDS.map((key) => [
      key,
      data[key] ? new Date(data[key] + "T00:00:00Z") : null,
    ]),
  );
  const stored = { ...values, ...dates, updatedByUserId: actor.id };
  const row = before
    ? await tx.engagement.update({
        where: { firmId_id: { firmId: actor.firmId, id: before.id } },
        data: { ...stored, version: { increment: 1 } },
      })
    : await tx.engagement.create({
        data: { ...stored, firmId: actor.firmId, createdByUserId: actor.id },
      });
  if (!before)
    await engagementEvent(
      tx,
      actor,
      row.id,
      "created",
      `Engagement ${row.engagementCode} created.`,
    );
  const staffName = async (userId: string | null | undefined) => {
    if (!userId) return "Unassigned";
    const user = await tx.user.findFirst({
      where: { firmId: actor.firmId, id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}` : "Former staff";
  };
  for (const key of STAFF) {
    if (
      (before?.[key] ?? null) !== row[key] ||
      (key === "preparerId" &&
        String(before?.allocationDate ?? "") !==
          String(row.allocationDate ?? ""))
    ) {
      const slot = (key[0].toUpperCase() +
        key.slice(1, -2)) as EngagementStaffSlot;
      await tx.engagementAssignmentHistory.create({
        data: {
          firmId: actor.firmId,
          engagementId: row.id,
          slot,
          oldUserId: before?.[key] ?? null,
          newUserId: row[key],
          oldAllocationDate: before?.allocationDate ?? null,
          newAllocationDate: row.allocationDate,
          actorUserId: actor.id,
        },
      });
      await engagementEvent(
        tx,
        actor,
        row.id,
        "assigned",
        `${slot}: ${await staffName(before?.[key])} → ${await staffName(row[key])}. Allocation: ${row.allocationDate?.toISOString().slice(0, 10) ?? "Not set"}.`,
        {
          slot,
          oldUserId: before?.[key] ?? null,
          newUserId: row[key],
          oldAllocationDate:
            before?.allocationDate?.toISOString().slice(0, 10) ?? null,
          newAllocationDate: data.allocationDate,
        },
      );
    }
  }
  if (
    !before ||
    before.status !== row.status ||
    String(before.completedDate) !== String(row.completedDate)
  ) {
    await tx.engagementStatusHistory.create({
      data: {
        firmId: actor.firmId,
        engagementId: row.id,
        oldStatus: before?.status ?? null,
        newStatus: row.status,
        oldCompletedDate: before?.completedDate ?? null,
        newCompletedDate: row.completedDate,
        comment: statusComment,
        actorUserId: actor.id,
      },
    });
    const action =
      row.status === "Cancelled"
        ? "cancelled"
        : before?.status === "Completed" && row.status !== "Completed"
          ? "reopened"
          : "status_changed";
    await engagementEvent(
      tx,
      actor,
      row.id,
      action,
      `${before ? engagementLabel(before.status) : "New"} → ${engagementLabel(row.status)}${row.completedDate ? ` (${data.completedDate})` : ""}.${statusComment ? " " + statusComment : ""}`,
      {
        oldStatus: before?.status ?? null,
        newStatus: row.status,
        oldCompletedDate:
          before?.completedDate?.toISOString().slice(0, 10) ?? null,
        newCompletedDate: data.completedDate,
      },
    );
  }
  if (before) {
    const named: Record<string, string> = {
      budgetHours: "Budget hours",
      priority: "Priority",
      dueDate: "Due date",
      officeId: "Office",
      serviceLineId: "Service",
      engagementTypeId: "Engagement type",
    };
    for (const [key, label] of Object.entries(named)) {
      if (!changed(key as keyof EngagementInput)) continue;
      const old =
        key === "officeId"
          ? before.office.officeName
          : key === "serviceLineId"
            ? before.serviceLine.name
            : key === "engagementTypeId"
              ? before.engagementType.name
              : engagementEditData(before)[key as keyof Engagement];
      const next =
        key === "officeId"
          ? refs.office.officeName
          : key === "serviceLineId"
            ? refs.service.name
            : key === "engagementTypeId"
              ? refs.type.name
              : data[key as keyof EngagementInput];
      await engagementEvent(
        tx,
        actor,
        row.id,
        key === "budgetHours"
          ? "budget_changed"
          : `${key.replace("Id", "")}_changed`,
        `${label}: ${old ?? "Not set"} → ${next ?? "Not set"}.`,
      );
    }
    const basic = [
      "engagementCode",
      "engagementName",
      "clientId",
      "periodType",
      "periodStartDate",
      "periodEndDate",
      "reportingYear",
      "plannedStartDate",
      "actualStartDate",
      "recurring",
      "description",
      "internalNotes",
    ].filter((k) => changed(k as keyof EngagementInput));
    if (basic.length)
      await engagementEvent(
        tx,
        actor,
        row.id,
        "updated",
        `Engagement details updated: ${basic.join(", ")}.`,
      );
  }
  await writeFields(tx, actor, row.id, customFields);
  if (!before && workflowTemplateId)
    await applyWorkflowInTransaction(tx, actor, row.id, workflowTemplateId);
  return {
    id: row.id,
    message: "Engagement saved.",
    visible: canSeeEngagement(actor, row),
  };
}
export function saveEngagement(
  token: string | undefined,
  input: unknown,
  recordId?: string,
) {
  return engagementMutation(
    token,
    recordId ? "engagements.edit" : "engagements.create",
    (tx, actor) => saveEngagementInTransaction(tx, actor, input, recordId),
  );
}
export async function changeEngagement(
  token: string | undefined,
  recordId: string,
  input: unknown,
  mode: "status" | "assign",
) {
  const schema =
    mode === "status"
      ? z.object(engagementInput.shape).pick({
          status: true,
          completedDate: true,
          statusComment: true,
          version: true,
        })
      : z.object(engagementInput.shape).pick({
          partnerId: true,
          managerId: true,
          reviewerId: true,
          preparerId: true,
          allocationDate: true,
          version: true,
        });
  const data = schema.parse(input);
  return engagementMutation(
    token,
    mode === "status" ? "engagements.change_status" : "engagements.assign",
    async (tx, actor) => {
      const row = await findEngagement(tx, actor, recordId);
      return saveEngagementInTransaction(
        tx,
        actor,
        { ...engagementEditData(row), ...data },
        recordId,
        mode,
      );
    },
  );
}
export async function saveEngagementCatalog(
  token: string | undefined,
  kind: "types" | "fields",
  input: unknown,
  recordId?: string,
) {
  return engagementMutation(
    token,
    kind === "types"
      ? "engagements.configure"
      : "engagements.manage_custom_fields",
    async (tx, actor) => {
      const firmId = actor.firmId;
      if (recordId) id.parse(recordId);
      if (kind === "types") {
        const data = catalogInput
          .extend({ serviceLineId: nullableId })
          .parse(input);
        const before = recordId
          ? await tx.engagementType.findFirst({
              where: { firmId, id: recordId },
            })
          : null;
        if (recordId) invariant(before, "Engagement type not found.", 404);
        if (data.serviceLineId)
          invariant(
            await tx.serviceLine.findFirst({
              where: {
                firmId,
                id: data.serviceLineId,
                ...(before?.serviceLineId === data.serviceLineId
                  ? {}
                  : { active: true }),
              },
            }),
            "Select an active service in your firm.",
          );
        const fields = { ...data, normalizedName: normalizeName(data.name) };
        const row = before
          ? await tx.engagementType.update({
              where: { id: before.id },
              data: fields,
            })
          : await tx.engagementType.create({ data: { firmId, ...fields } });
        await audit(
          tx,
          firmId,
          actor.id,
          "engagement_type.configured",
          "EngagementType",
          row.id,
          { name: data.name, active: data.active },
        );
        return { message: "Engagement type saved." };
      }
      const data = definitionInput.parse(input);
      const before = recordId
        ? await tx.engagementCustomFieldDefinition.findFirst({
            where: { firmId, id: recordId },
          })
        : null;
      if (recordId) invariant(before, "Custom field not found.", 404);
      if (before) {
        invariant(
          before.fieldType === data.fieldType,
          "Field type cannot be changed.",
        );
        if (before.fieldType === "Dropdown") {
          const used = await tx.engagementCustomFieldValue.findMany({
            where: {
              firmId,
              definitionId: before.id,
              textValue: { not: null },
            },
            select: { textValue: true },
            distinct: ["textValue"],
          });
          invariant(
            used.every((v) => data.options.includes(v.textValue!)),
            "Choices used by existing engagements cannot be removed.",
          );
        }
      }
      const fields = { ...data, normalizedName: normalizeName(data.name) };
      const row = before
        ? await tx.engagementCustomFieldDefinition.update({
            where: { id: before.id },
            data: fields,
          })
        : await tx.engagementCustomFieldDefinition.create({
            data: { firmId, ...fields },
          });
      await audit(
        tx,
        firmId,
        actor.id,
        "engagement_field.configured",
        "EngagementCustomFieldDefinition",
        row.id,
        { name: data.name, active: data.active },
      );
      return { message: "Custom field saved." };
    },
  );
}
export async function bulkEngagements(
  token: string | undefined,
  input: unknown,
) {
  const data = z
    .object({
      ids: z.array(id).min(1).max(100),
      field: z.enum([
        "managerId",
        "preparerId",
        "status",
        "priority",
        "dueDate",
      ]),
      value: z.string().nullable(),
      completedDate: engagementInput.shape.completedDate,
      allocationDate: engagementInput.shape.allocationDate,
      confirmed: z.literal(true),
    })
    .parse(input);
  const mode =
    data.field === "status"
      ? "status"
      : STAFF.includes(data.field as (typeof STAFF)[number])
        ? "assign"
        : "edit";
  const permission =
    mode === "status"
      ? "engagements.change_status"
      : mode === "assign"
        ? "engagements.assign"
        : "engagements.edit";
  return engagementMutation(token, permission, async (tx, actor) => {
    const ids = [...new Set(data.ids)];
    const rows = await tx.engagement.findMany({
      where: { AND: [engagementVisibility(actor), { id: { in: ids } }] },
    });
    invariant(
      rows.length === ids.length,
      "One or more engagements were not found.",
      404,
    );
    for (const row of rows) {
      const input = {
        ...engagementEditData(row),
        [data.field]: data.value,
        ...(data.field === "status"
          ? {
              completedDate:
                data.value === "Completed" ? data.completedDate : null,
            }
          : {}),
        ...(data.field === "preparerId"
          ? { allocationDate: data.allocationDate }
          : {}),
      };
      await saveEngagementInTransaction(tx, actor, input, row.id, mode);
      await engagementEvent(
        tx,
        actor,
        row.id,
        "bulk_changed",
        `Bulk change applied to ${ids.length} engagements: ${data.field}.`,
      );
    }
    return { message: `${ids.length} engagements updated.` };
  });
}
