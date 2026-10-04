import { z } from "zod";
import { db } from "./db";
import {
  principal,
  requirePermission,
  hasPermission,
  tenantMutation,
  audit,
  type Database,
  type Principal,
} from "./auth";
import { invariant } from "./errors";
import { id } from "./validation";
import { nullableId } from "./engagement-validation";
import { normalizeName } from "./client-constants";
import { templateInput } from "./workflow-validation";
export const templateInclude = {
  stages: {
    orderBy: { sequence: "asc" as const },
    include: { checklistItems: { orderBy: { sequence: "asc" as const } } },
  },
  serviceLine: true,
  engagementType: true,
};
export async function templateActor(token: string | undefined) {
  const actor = await principal(token);
  requirePermission(actor, "workflow_templates.view");
  return actor;
}
export async function findTemplate(
  tx: Database,
  actor: Principal,
  templateId: string,
) {
  const row = await tx.workflowTemplate.findFirst({
    where: { firmId: actor.firmId, id: id.parse(templateId) },
    include: templateInclude,
  });
  invariant(row, "Workflow template not found.", 404);
  return row;
}
export async function getTemplate(
  token: string | undefined,
  templateId: string,
) {
  const actor = await templateActor(token);
  return visibleTemplateChecklist(
    actor,
    await findTemplate(db, actor, templateId),
  );
}
export function visibleTemplateChecklist<
  T extends { stages: { checklistItems: unknown[] }[] },
>(actor: Principal, row: T): T {
  return hasPermission(actor, "checklist_templates.view")
    ? row
    : { ...row, stages: row.stages.map((s) => ({ ...s, checklistItems: [] })) };
}
export async function listTemplates(
  token: string | undefined,
  input: unknown = {},
) {
  const actor = await templateActor(token);
  const f = z
    .object({
      q: z.string().max(150).default(""),
      serviceLineId: nullableId,
      engagementTypeId: nullableId,
      status: z.enum(["", "Draft", "Published", "Archived"]).default(""),
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .parse(input);
  const where = {
    firmId: actor.firmId,
    ...(f.q ? { name: { contains: f.q, mode: "insensitive" as const } } : {}),
    ...(f.serviceLineId ? { serviceLineId: f.serviceLineId } : {}),
    ...(f.engagementTypeId ? { engagementTypeId: f.engagementTypeId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
  const [items, total] = await Promise.all([
    db.workflowTemplate.findMany({
      where,
      include: templateInclude,
      orderBy: [{ name: "asc" }, { versionNumber: "desc" }],
      skip: (f.page - 1) * 25,
      take: 25,
    }),
    db.workflowTemplate.count({ where }),
  ]);
  return {
    items: items.map((item) => visibleTemplateChecklist(actor, item)),
    total,
    filters: f,
  };
}
export async function templateOptions(token: string | undefined) {
  const actor = await templateActor(token),
    where = { firmId: actor.firmId };
  const [serviceLines, types, users] = await Promise.all([
    db.serviceLine.findMany({ where, orderBy: { name: "asc" } }),
    db.engagementType.findMany({ where, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { ...where, status: "Active", role: { active: true } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
  ]);
  return { serviceLines, types, users };
}
async function validateDefinition(
  tx: Database,
  actor: Principal,
  data: z.infer<typeof templateInput>,
  publish = false,
) {
  invariant(
    await tx.serviceLine.findFirst({
      where: { firmId: actor.firmId, id: data.serviceLineId, active: true },
    }),
    "Select an active Service Line in your firm.",
  );
  if (data.engagementTypeId) {
    const type = await tx.engagementType.findFirst({
      where: { firmId: actor.firmId, id: data.engagementTypeId, active: true },
    });
    invariant(
      type &&
        (!type.serviceLineId || type.serviceLineId === data.serviceLineId),
      "Select a compatible Engagement Type in your firm.",
    );
  }
  for (const stage of data.stages) {
    for (const item of stage.checklistItems) {
      invariant(
        item.defaultOwnerType === "SpecificUser"
          ? !!item.specificUserId
          : !item.specificUserId,
        "Specific checklist ownership requires an employee; other defaults must not specify one.",
      );
      if (item.specificUserId)
        invariant(
          await tx.user.findFirst({
            where: {
              firmId: actor.firmId,
              id: item.specificUserId,
              status: "Active",
              role: { active: true },
            },
          }),
          "Choose an active checklist owner in your firm.",
        );
    }
    invariant(
      stage.defaultOwnerType === "SpecificUser"
        ? !!stage.specificUserId
        : !stage.specificUserId,
      "Specific User requires a user; other owner types must not specify one.",
    );
    if (stage.specificUserId)
      invariant(
        await tx.user.findFirst({
          where: {
            firmId: actor.firmId,
            id: stage.specificUserId,
            status: "Active",
            role: { active: true },
          },
        }),
        "Select an active owner in your firm.",
      );
  }
  if (publish) {
    const stages = data.stages.filter((s) => s.active);
    invariant(stages.length >= 2, "At least two active stages are required.");
    invariant(
      new Set(stages.map((s) => normalizeName(s.name))).size === stages.length,
      "Stage names must be distinct.",
    );
    invariant(
      stages.filter((s) => s.isStart).length === 1 && stages[0].isStart,
      "Exactly one Start stage must be first.",
    );
    invariant(
      stages.filter((s) => s.isCompletion).length === 1 &&
        stages.at(-1)!.isCompletion,
      "Exactly one Completion stage must be last.",
    );
    invariant(
      stages[0].required && stages.at(-1)!.required,
      "Start and Completion stages must be required.",
    );
  }
}
export function saveTemplate(
  token: string | undefined,
  input: unknown,
  templateId?: string,
) {
  const data = templateInput.parse(input);
  return tenantMutation(
    token,
    templateId ? "workflow_templates.edit" : "workflow_templates.create",
    async (tx, actor) => {
      requirePermission(actor, "workflow_templates.view");
      const before = templateId
        ? await findTemplate(tx, actor, templateId)
        : null;
      if (before)
        invariant(
          before.revision === data.revision,
          "This template changed. Refresh and try again.",
          409,
        );
      invariant(
        !before || before.status === "Draft",
        "Create a new draft version to edit a published or archived template.",
      );
      if (
        data.stages.some((s) => s.checklistItems.length) ||
        before?.stages.some((s) => s.checklistItems.length)
      ) {
        requirePermission(actor, "checklist_templates.view");
        requirePermission(
          actor,
          before ? "checklist_templates.edit" : "checklist_templates.create",
        );
      }
      await validateDefinition(tx, actor, data);
      const { stages, revision: _revision, ...info } = data;
      void _revision;
      const row = before
        ? await tx.workflowTemplate.update({
            where: { id: before.id },
            data: {
              ...info,
              normalizedName: normalizeName(info.name),
              revision: { increment: 1 },
            },
          })
        : await tx.workflowTemplate.create({
            data: {
              ...info,
              normalizedName: normalizeName(info.name),
              firmId: actor.firmId,
              createdByUserId: actor.id,
            },
          });
      if (before)
        await tx.workflowTemplateStage.deleteMany({
          where: { firmId: actor.firmId, workflowTemplateId: row.id },
        });
      for (const [i, definition] of stages.entries()) {
        const { checklistItems, ...stage } = definition;
        const saved = await tx.workflowTemplateStage.create({
          data: {
            ...stage,
            firmId: actor.firmId,
            workflowTemplateId: row.id,
            sequence: (i + 1) * 10,
          },
        });
        await tx.workflowTemplateChecklistItem.createMany({
          data: checklistItems.map((item, j) => ({
            ...item,
            firmId: actor.firmId,
            workflowTemplateStageId: saved.id,
            sequence: (j + 1) * 10,
          })),
        });
      }
      await audit(
        tx,
        actor.firmId,
        actor.id,
        before ? "workflow_template.edited" : "workflow_template.created",
        "WorkflowTemplate",
        row.id,
        JSON.parse(
          JSON.stringify({ before: before?.stages ?? null, after: stages }),
        ),
      );
      return { id: row.id, message: "Draft saved." };
    },
  );
}
export function templateAction(
  token: string | undefined,
  templateId: string,
  input: unknown,
) {
  const data = z
    .object({
      action: z.enum(["publish", "archive", "duplicate", "version"]),
      revision: z.number().int().positive(),
      name: z.string().trim().min(1).max(150).optional(),
    })
    .parse(input);
  const permission = (
    {
      publish: "workflow_templates.publish",
      archive: "workflow_templates.archive",
      duplicate: "workflow_templates.create",
      version: "workflow_templates.edit",
    } as const
  )[data.action];
  return tenantMutation(token, permission, async (tx, actor) => {
    requirePermission(actor, "workflow_templates.view");
    const source = await findTemplate(tx, actor, templateId);
    invariant(
      source.revision === data.revision,
      "This template changed. Refresh and try again.",
      409,
    );
    if (data.action === "publish" || data.action === "archive") {
      if (data.action === "publish") {
        invariant(source.status === "Draft", "Only drafts can be published.");
        await validateDefinition(tx, actor, templateInput.parse(source), true);
      } else
        invariant(
          source.status !== "Archived",
          "Template is already archived.",
        );
      await tx.workflowTemplate.update({
        where: { id: source.id },
        data: {
          status: data.action === "publish" ? "Published" : "Archived",
          active: data.action === "publish",
          revision: { increment: 1 },
        },
      });
      if (data.action === "archive")
        await tx.engagementType.updateMany({
          where: { firmId: actor.firmId, defaultWorkflowTemplateId: source.id },
          data: { defaultWorkflowTemplateId: null },
        });
      await audit(
        tx,
        actor.firmId,
        actor.id,
        `workflow_template.${data.action === "publish" ? "published" : "archived"}`,
        "WorkflowTemplate",
        source.id,
      );
      return { id: source.id, message: "Template updated." };
    }
    const versioning = data.action === "version";
    if (versioning)
      invariant(source.status !== "Draft", "Edit the existing draft.");
    const latest = versioning
      ? await tx.workflowTemplate.findFirst({
          where: { firmId: actor.firmId, familyId: source.familyId },
          orderBy: { versionNumber: "desc" },
        })
      : null;
    let name = versioning
      ? source.name
      : (data.name ?? `${source.name.slice(0, 130)} – Copy`);
    if (!versioning && !data.name) {
      const base = name;
      let copy = 2;
      while (
        await tx.workflowTemplate.findFirst({
          where: {
            firmId: actor.firmId,
            normalizedName: normalizeName(name),
            versionNumber: 1,
          },
          select: { id: true },
        })
      ) {
        name = `${base} ${copy++}`;
      }
    }
    const row = await tx.workflowTemplate.create({
      data: {
        firmId: actor.firmId,
        createdByUserId: actor.id,
        name,
        normalizedName: normalizeName(name),
        description: source.description,
        serviceLineId: source.serviceLineId,
        engagementTypeId: source.engagementTypeId,
        ...(versioning
          ? {
              familyId: source.familyId,
              versionNumber: latest!.versionNumber + 1,
            }
          : {}),
      },
    });
    if (source.stages.some((s) => s.checklistItems.length)) {
      requirePermission(actor, "checklist_templates.view");
      requirePermission(
        actor,
        versioning ? "checklist_templates.edit" : "checklist_templates.create",
      );
    }
    for (const s of source.stages) {
      const { checklistItems, ...stage } =
        templateInput.shape.stages.element.parse(s);
      const saved = await tx.workflowTemplateStage.create({
        data: {
          ...stage,
          firmId: actor.firmId,
          workflowTemplateId: row.id,
          sequence: s.sequence,
        },
      });
      await tx.workflowTemplateChecklistItem.createMany({
        data: checklistItems.map((item, i) => ({
          ...item,
          firmId: actor.firmId,
          workflowTemplateStageId: saved.id,
          sequence: (i + 1) * 10,
        })),
      });
    }
    await audit(
      tx,
      actor.firmId,
      actor.id,
      versioning
        ? "workflow_template.version_created"
        : "workflow_template.duplicated",
      "WorkflowTemplate",
      row.id,
      { sourceId: source.id },
    );
    return { id: row.id, message: "New draft created." };
  });
}
export function setDefaultTemplate(
  token: string | undefined,
  typeId: string,
  input: unknown,
) {
  const data = z.object({ templateId: nullableId }).parse(input);
  return tenantMutation(token, "engagements.configure", async (tx, actor) => {
    const type = await tx.engagementType.findFirst({
      where: { firmId: actor.firmId, id: id.parse(typeId) },
    });
    invariant(type, "Engagement Type not found.", 404);
    if (data.templateId) {
      const t = await findTemplate(tx, actor, data.templateId);
      invariant(
        t.active &&
          t.status === "Published" &&
          (!t.engagementTypeId || t.engagementTypeId === type.id) &&
          (!type.serviceLineId || type.serviceLineId === t.serviceLineId),
        "Choose a compatible published template.",
      );
    }
    await tx.engagementType.update({
      where: { id: type.id },
      data: { defaultWorkflowTemplateId: data.templateId },
    });
    await audit(
      tx,
      actor.firmId,
      actor.id,
      "engagement_type.workflow_default_changed",
      "EngagementType",
      type.id,
      { old: type.defaultWorkflowTemplateId, templateId: data.templateId },
    );
    return { message: "Default workflow saved." };
  });
}
