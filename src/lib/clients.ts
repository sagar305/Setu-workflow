import { typedValue } from './custom-field-values';
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import {
  principal,
  requirePermission,
  tenantMutation,
  audit,
  type Database,
  type Principal,
} from "./auth";
import type { PermissionKey } from "./permissions";
import { invariant } from "./errors";
import { id } from "./validation";
import {
  clientInput,
  listInput,
  contactInput,
  primaryContactInput,
  catalogInput,
  definitionInput,

  type ClientInput,
  type ClientFilters,
} from "./client-validation";
import {
  ENTITY_TYPES,
  SERVICE_LINES,
  normalizeName,
  statusLabel,
  CLIENT_STATUSES,
} from "./client-constants";

const person = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    status: true,
  },
} as const;
export const clientInclude = {
  entityType: true,
  primaryOffice: { select: { id: true, officeName: true, active: true } },
  responsiblePartner: person,
  responsibleManager: person,
  services: { include: { serviceLine: true } },
  address: true,
  contacts: { where: { isPrimary: true, active: true }, take: 1 },
} satisfies Prisma.ClientInclude;
export async function clientActor(
  token: string | undefined,
  permission: PermissionKey = "clients.view",
) {
  const actor = await principal(token);
  requirePermission(actor, "clients.view");
  requirePermission(actor, permission);
  return actor;
}
export function clientMutation<T>(
  token: string | undefined,
  permission: PermissionKey,
  work: (tx: Database, actor: Principal) => Promise<T>,
) {
  return tenantMutation(token, permission, async (tx, actor) => {
    requirePermission(actor, "clients.view");
    return work(tx, actor);
  });
}
export async function seedClientCatalogs(tx: Database, firmId: string) {
  for (const name of ENTITY_TYPES)
    await tx.entityType.upsert({
      where: {
        firmId_normalizedName: { firmId, normalizedName: normalizeName(name) },
      },
      create: { firmId, name, normalizedName: normalizeName(name) },
      update: {},
    });
  for (const name of SERVICE_LINES)
    await tx.serviceLine.upsert({
      where: {
        firmId_normalizedName: { firmId, normalizedName: normalizeName(name) },
      },
      create: { firmId, name, normalizedName: normalizeName(name) },
      update: {},
    });
}
export async function clientOptions(token: string | undefined) {
  const actor = await clientActor(token);
  const where = { firmId: actor.firmId };
  const [entityTypes, serviceLines, offices, users, definitions] =
    await Promise.all([
      db.entityType.findMany({ where, orderBy: { name: "asc" } }),
      db.serviceLine.findMany({ where, orderBy: { name: "asc" } }),
      db.office.findMany({
        where,
        select: { id: true, officeName: true, active: true },
        orderBy: { officeName: "asc" },
      }),
      db.user.findMany({
        where,
        select: person.select,
        orderBy: { firstName: "asc" },
      }),
      db.clientCustomFieldDefinition.findMany({
        where,
        orderBy: { name: "asc" },
      }),
    ]);
  return { entityTypes, serviceLines, offices, users, definitions };
}
export function clientWhere(
  firmId: string,
  filters: ClientFilters,
): Prisma.ClientWhereInput {
  return {
    firmId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.entityTypeId ? { entityTypeId: filters.entityTypeId } : {}),
    ...(filters.officeId ? { primaryOfficeId: filters.officeId } : {}),
    ...(filters.partnerId ? { responsiblePartnerId: filters.partnerId } : {}),
    ...(filters.managerId ? { responsibleManagerId: filters.managerId } : {}),
    ...(filters.serviceLineId
      ? { services: { some: { firmId, serviceLineId: filters.serviceLineId } } }
      : {}),
    ...(filters.q
      ? {
          OR: ["clientCode", "legalName", "displayName"].map((field) => ({
            [field]: { contains: filters.q, mode: "insensitive" },
          })),
        }
      : {}),
  };
}
export async function listClients(token: string | undefined, input: unknown) {
  const actor = await clientActor(token);
  const filters = listInput.parse(input);
  const where = clientWhere(actor.firmId, filters);
  const [items, total, groups] = await db.$transaction(
    [
      db.client.findMany({
        where,
        include: clientInclude,
        orderBy: [{ [filters.sort]: filters.direction }, { id: "asc" }],
        take: filters.pageSize,
        skip: (filters.page - 1) * filters.pageSize,
      }),
      db.client.count({ where }),
      db.$queryRaw<
        { status: string; count: bigint }[]
      >`SELECT status, COUNT(*) AS count FROM clients WHERE firm_id = ${actor.firmId}::uuid GROUP BY status`,
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return {
    items,
    total,
    filters,
    stats: Object.fromEntries(groups.map((g) => [g.status, Number(g.count)])),
  };
}
export async function findClient(
  tx: Database,
  firmId: string,
  clientId: string,
) {
  id.parse(clientId);
  const client = await tx.client.findFirst({ where: { firmId, id: clientId }, include: { contacts: { where: { isPrimary: true, active: true }, take: 1 } } });
  invariant(client, "Client not found.", 404);
  return client;
}
export async function getClient(token: string | undefined, clientId: string) {
  const actor = await clientActor(token);
  id.parse(clientId);
  const client = await db.client.findFirst({
    where: { firmId: actor.firmId, id: clientId },
    include: {
      ...clientInclude,
      contacts: { orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] },
      customValues: { include: { definition: true } },
    },
  });
  invariant(client, "Client not found.", 404);
  return client;
}
export async function clientActivity(
  token: string | undefined,
  clientId: string,
  page = 1,
) {
  const actor = await clientActor(token);
  await findClient(db, actor.firmId, clientId);
  z.number().int().min(1).max(100000).parse(page);
  const where = {
    firmId: actor.firmId,
    entityType: "Client",
    entityId: clientId,
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 25,
      skip: (page - 1) * 25,
      include: { actor: { select: { firstName: true, lastName: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return {
    total,
    page,
    items: rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      user: row.actor
        ? `${row.actor.firstName} ${row.actor.lastName}`
        : "System",
      action: row.action,
      description:
        (row.metadata as { description?: string }).description ??
        "Client record changed.",
    })),
  };
}
export async function clientEvent(
  tx: Database,
  actor: Principal,
  clientId: string,
  action: string,
  description: string,
  changes: Prisma.InputJsonValue = {},
) {
  return audit(tx, actor.firmId, actor.id, action, "Client", clientId, {
    description,
    changes,
  });
}
export async function validateClientReferences(
  tx: Database,
  firmId: string,
  data: ClientInput,
  existingId?: string,
) {
  const existing = existingId ? await findClient(tx, firmId, existingId) : null;
  const primary = data.primaryContact ?? existing?.contacts[0];
  invariant(primary, 'A primary contact with email and phone is required.');
  primaryContactInput.parse(primary);
  invariant(
    await tx.entityType.findFirst({
      where: {
        firmId,
        id: data.entityTypeId,
        ...(existing?.entityTypeId === data.entityTypeId
          ? {}
          : { active: true }),
      },
    }),
    "Select an active entity type in your firm.",
  );
  invariant(
    await tx.office.findFirst({
      where: {
        firmId,
        id: data.primaryOfficeId,
        ...(existing?.primaryOfficeId === data.primaryOfficeId
          ? {}
          : { active: true }),
      },
    }),
    "Select an active office in your firm.",
  );
  for (const userId of [
    data.responsiblePartnerId,
    data.responsibleManagerId,
  ].filter(Boolean) as string[])
    invariant(
      await tx.user.findFirst({
        where: { firmId, id: userId, status: "Active", role: { active: true } },
      }),
      "Select an active responsible user in your firm.",
    );
  const linked = existingId
    ? await tx.clientServiceLine.findMany({
        where: { firmId, clientId: existingId },
        select: { serviceLineId: true },
      })
    : [];
  const services = await tx.serviceLine.findMany({
    where: {
      firmId,
      id: { in: [...new Set(data.serviceLineIds)] },
      OR: [
        { active: true },
        { id: { in: linked.map((s) => s.serviceLineId) } },
      ],
    },
  });
  invariant(
    services.length === new Set(data.serviceLineIds).size,
    "Select active service lines in your firm.",
  );
  const duplicateCode = await tx.client.findFirst({
    where: {
      firmId,
      clientCode: data.clientCode,
      ...(existingId ? { id: { not: existingId } } : {}),
    },
    select: { id: true },
  });
  invariant(!duplicateCode, "Client Code already exists in your firm.", 409);
  return services;
}
export async function similarClients(
  tx: Database,
  firmId: string,
  data: ClientInput,
  existingId?: string,
) {
  const names = [
    ...new Set([
      normalizeName(data.legalName),
      normalizeName(data.displayName || data.legalName),
    ]),
  ];
  return tx.client.findMany({
    where: {
      firmId,
      ...(existingId ? { id: { not: existingId } } : {}),
      OR: [
        { normalizedLegalName: { in: names } },
        { normalizedDisplayName: { in: names } },
      ],
    },
    select: { clientCode: true, displayName: true },
    take: 5,
  });
}
export async function writeCustomValues(
  tx: Database,
  actor: Principal,
  clientId: string,
  input: Record<string, string | number | boolean | null>,
) {
  const definitions = await tx.clientCustomFieldDefinition.findMany({
    where: {
      firmId: actor.firmId,
      id: { in: Object.keys(input) },
      active: true,
    },
  });
  invariant(
    definitions.length === Object.keys(input).length,
    "Custom field not found or inactive.",
  );
  for (const def of definitions) {
    const value = input[def.id];
    const where = { firmId: actor.firmId, clientId, definitionId: def.id };
    const before = await tx.clientCustomFieldValue.findUnique({
      where: { firmId_clientId_definitionId: where },
    });
    if (value === "" || value === null) {
      if (before) {
        await tx.clientCustomFieldValue.delete({ where: { id: before.id } });
        await clientEvent(
          tx,
          actor,
          clientId,
          "client.custom_field_changed",
          `${def.name} cleared.`,
        );
      }
      continue;
    }
    const typed = typedValue(def, value);
    const old = before
      ? {
          textValue: before.textValue,
          numberValue: before.numberValue,
          dateValue: before.dateValue,
          booleanValue: before.booleanValue,
        }
      : null;
    if (JSON.stringify(old) === JSON.stringify(typed)) continue;
    await tx.clientCustomFieldValue.upsert({
      where: { firmId_clientId_definitionId: where },
      create: { ...where, ...typed },
      update: typed,
    });
    await clientEvent(
      tx,
      actor,
      clientId,
      "client.custom_field_changed",
      `${def.name} changed.`,
      { field: def.name },
    );
  }
}
async function touch(tx: Database, actor: Principal, clientId: string) {
  await tx.client.update({
    where: { firmId_id: { firmId: actor.firmId, id: clientId } },
    data: { updatedByUserId: actor.id, version: { increment: 1 } },
  });
}
export async function writeServices(
  tx: Database,
  actor: Principal,
  clientId: string,
  ids: string[],
) {
  const current = await tx.clientServiceLine.findMany({
    where: { firmId: actor.firmId, clientId },
    include: { serviceLine: true },
  });
  const wanted = [...new Set(ids)];
  const found = await tx.serviceLine.findMany({
    where: {
      firmId: actor.firmId,
      id: { in: wanted },
      OR: [
        { active: true },
        { id: { in: current.map((s) => s.serviceLineId) } },
      ],
    },
  });
  invariant(
    found.length === wanted.length,
    "Select active service lines in your firm.",
  );
  const additions = found.filter(
    (s) => !current.some((c) => c.serviceLineId === s.id),
  );
  const removals = current.filter((s) => !wanted.includes(s.serviceLineId));
  if (additions.length || removals.length)
    requirePermission(actor, "clients.manage_services");
  for (const s of removals) {
    await tx.clientServiceLine.delete({
      where: {
        firmId_clientId_serviceLineId: {
          firmId: actor.firmId,
          clientId,
          serviceLineId: s.serviceLineId,
        },
      },
    });
    await clientEvent(
      tx,
      actor,
      clientId,
      "client.service_removed",
      `Service removed: ${s.serviceLine.name}.`,
    );
  }
  for (const s of additions) {
    await tx.clientServiceLine.create({
      data: { firmId: actor.firmId, clientId, serviceLineId: s.id },
    });
    await clientEvent(
      tx,
      actor,
      clientId,
      "client.service_added",
      `Service added: ${s.name}.`,
    );
  }
}
export async function saveClientInTransaction(
  tx: Database,
  actor: Principal,
  input: unknown,
  clientId?: string,
) {
  requirePermission(actor, clientId ? "clients.edit" : "clients.create");
  const data = clientInput.parse(input);
  const before = clientId ? await findClient(tx, actor.firmId, clientId) : null;
  const previousAddress = before
    ? await tx.clientAddress.findUnique({
        where: {
          firmId_clientId: { firmId: actor.firmId, clientId: before.id },
        },
      })
    : null;
  if (before)
    invariant(
      data.version === before.version,
      "This client changed since you opened it. Reload before saving.",
      409,
    );
  await validateClientReferences(tx, actor.firmId, data, clientId);
  const similar = await similarClients(tx, actor.firmId, data, clientId);
  invariant(
    !similar.length || data.acknowledgeDuplicate,
    `Another client with a similar name already exists: ${similar.map((c) => `${c.clientCode} — ${c.displayName}`).join("; ")}. Review it, then confirm the similar-name warning to continue.`,
    409,
  );
  const {
    serviceLineIds,
    address,
    customFields,
    primaryContact,
    acknowledgeDuplicate: _ack,
    version: _version,
    ...fields
  } = data;
  void _ack;
  void _version;
  const converted = {
    ...fields,
    displayName: data.displayName || data.legalName,
    normalizedLegalName: normalizeName(data.legalName),
    normalizedDisplayName: normalizeName(data.displayName || data.legalName),
    onboardingDate: data.onboardingDate ? new Date(data.onboardingDate) : null,
    terminationDate: data.terminationDate
      ? new Date(data.terminationDate)
      : null,
    updatedByUserId: actor.id,
  };
  const client = before
    ? await tx.client.update({
        where: { firmId_id: { firmId: actor.firmId, id: before.id } },
        data: { ...converted, version: { increment: 1 } },
      })
    : await tx.client.create({
        data: { ...converted, firmId: actor.firmId, createdByUserId: actor.id },
      });
  await tx.clientAddress.upsert({
    where: { firmId_clientId: { firmId: actor.firmId, clientId: client.id } },
    create: { ...address, firmId: actor.firmId, clientId: client.id },
    update: address,
  });
  await writeServices(tx, actor, client.id, serviceLineIds);
  await writeCustomValues(tx, actor, client.id, customFields);
  const previousPrimary = before?.contacts[0];
  const contactChanged = primaryContact && (!previousPrimary || Object.keys(primaryContact).some(key =>
    !['isPrimary','active'].includes(key) && primaryContact[key as keyof typeof primaryContact] !== previousPrimary[key as keyof typeof primaryContact]));
  if (primaryContact && contactChanged) {
    requirePermission(actor, "clients.manage_contacts");
    const contactData = {
        ...primaryContact,
        firmId: actor.firmId,
        clientId: client.id,
        isPrimary: true,
        active: true,
      };
    if (previousPrimary) await tx.clientContact.update({where:{firmId_id:{firmId:actor.firmId,id:previousPrimary.id}},data:contactData});
    else await tx.clientContact.create({data:contactData});
    await clientEvent(
      tx,
      actor,
      client.id,
      previousPrimary ? "client.contact_updated" : "client.contact_added",
      `Primary contact ${previousPrimary ? 'updated' : 'added'}: ${primaryContact.firstName} ${primaryContact.lastName}.`,
      {before:previousPrimary ? {email:previousPrimary.email,phone:previousPrimary.phone} : null,after:{email:primaryContact.email,phone:primaryContact.phone}},
    );
  }
  const changes: Record<
    string,
    { before: string | number | null; after: string | number | null }
  > = {};
  if (before)
    for (const key of [
      "clientCode",
      "legalName",
      "displayName",
      "industry",
      "website",
      "taxYearEndMonth",
      "taxYearEndDay",
      "onboardingDate",
      "terminationDate",
    ] as const) {
      const oldValue =
        before[key] instanceof Date
          ? before[key].toISOString().slice(0, 10)
          : before[key];
      const newValue =
        client[key] instanceof Date
          ? client[key].toISOString().slice(0, 10)
          : client[key];
      if (oldValue !== newValue)
        changes[key] = { before: oldValue, after: newValue };
    }
  const changedLabels = Object.keys(changes).map((k) =>
    k.replace(/([A-Z])/g, " $1").toLowerCase(),
  );
  if (before?.internalNotes !== client.internalNotes)
    changedLabels.push("internal notes");
  if (before && before.entityTypeId !== client.entityTypeId) {
    const types = await tx.entityType.findMany({
      where: {
        firmId: actor.firmId,
        id: { in: [before.entityTypeId, client.entityTypeId] },
      },
    });
    changes.entityType = {
      before: types.find((t) => t.id === before.entityTypeId)!.name,
      after: types.find((t) => t.id === client.entityTypeId)!.name,
    };
    changedLabels.push("entity type");
  }
  if (
    previousAddress &&
    Object.entries(address).some(
      ([key, value]) => previousAddress[key as keyof typeof address] !== value,
    )
  )
    changedLabels.push("primary address");
  await clientEvent(
    tx,
    actor,
    client.id,
    before ? "client.updated" : "client.created",
    before
      ? `Client details updated${changedLabels.length ? ": " + changedLabels.join(", ") : ""}.`
      : `Client ${client.clientCode} created.`,
    changes,
  );
  if (before) {
    if (before.status !== client.status)
      await clientEvent(
        tx,
        actor,
        client.id,
        "client.status_changed",
        `Status: ${statusLabel(before.status)} → ${statusLabel(client.status)}.`,
      );
    for (const [key, label] of [
      ["responsiblePartnerId", "Partner"],
      ["responsibleManagerId", "Manager"],
      ["primaryOfficeId", "Office"],
    ] as const) {
      if (before[key] === client[key]) continue;
      const name = async (value: string | null) => {
        if (!value) return "Unassigned";
        if (key === "primaryOfficeId")
          return (
            (
              await tx.office.findFirst({
                where: { firmId: actor.firmId, id: value },
              })
            )?.officeName ?? "Former office"
          );
        const u = await tx.user.findFirst({
          where: { firmId: actor.firmId, id: value },
        });
        return u ? `${u.firstName} ${u.lastName}` : "Former user";
      };
      await clientEvent(
        tx,
        actor,
        client.id,
        `client.${label.toLowerCase()}_changed`,
        `${label}: ${await name(before[key])} → ${await name(client[key])}.`,
      );
    }
  }
  return {
    id: client.id,
    message: before ? "Client saved." : "Client created.",
  };
}
export const saveClient = (
  token: string | undefined,
  input: unknown,
  clientId?: string,
) =>
  clientMutation(
    token,
    clientId ? "clients.edit" : "clients.create",
    (tx, actor) => saveClientInTransaction(tx, actor, input, clientId),
  );
export async function saveContact(
  token: string | undefined,
  clientId: string,
  input: unknown,
  contactId?: string,
) {
  const data = contactInput.parse(input);
  if (contactId) id.parse(contactId);
  return clientMutation(token, "clients.manage_contacts", async (tx, actor) => {
    await findClient(tx, actor.firmId, clientId);
    const before = contactId
      ? await tx.clientContact.findFirst({
          where: { firmId: actor.firmId, clientId, id: contactId },
        })
      : null;
    invariant(!contactId || before, "Contact not found.", 404);
    const isPrimary = data.active && data.isPrimary;
    invariant(!before?.isPrimary || isPrimary, 'Set another contact with email and phone as primary before deactivating or clearing this primary contact.');
    if (isPrimary)
      await tx.clientContact.updateMany({
        where: { firmId: actor.firmId, clientId, isPrimary: true },
        data: { isPrimary: false },
      });
    const row = before
      ? await tx.clientContact.update({
          where: { firmId_id: { firmId: actor.firmId, id: before.id } },
          data: { ...data, isPrimary },
        })
      : await tx.clientContact.create({
          data: { ...data, isPrimary, firmId: actor.firmId, clientId },
        });
    await touch(tx, actor, clientId);
    const action = !before
      ? "added"
      : before.active && !data.active
        ? "deactivated"
        : !before.active && data.active
          ? "reactivated"
          : "updated";
    await clientEvent(
      tx,
      actor,
      clientId,
      `client.contact_${action}`,
      `Contact ${action}: ${data.firstName} ${data.lastName}.${isPrimary ? " Marked as primary." : before?.isPrimary ? " Primary designation cleared." : ""}`,
    );
    return { id: row.id, message: "Contact saved." };
  });
}
export async function getContact(
  token: string | undefined,
  clientId: string,
  contactId: string,
) {
  const actor = await clientActor(token);
  await findClient(db, actor.firmId, clientId);
  id.parse(contactId);
  const row = await db.clientContact.findFirst({
    where: { firmId: actor.firmId, clientId, id: contactId },
  });
  invariant(row, "Contact not found.", 404);
  return row;
}
export const saveClientServices = (
  token: string | undefined,
  clientId: string,
  input: unknown,
) =>
  clientMutation(token, "clients.manage_services", async (tx, actor) => {
    const ids = z.array(id).max(100).parse(input);
    await findClient(tx, actor.firmId, clientId);
    await writeServices(tx, actor, clientId, ids);
    await touch(tx, actor, clientId);
    return { message: "Services saved." };
  });
export const saveClientFields = (
  token: string | undefined,
  clientId: string,
  input: unknown,
) =>
  clientMutation(token, "clients.edit", async (tx, actor) => {
    const values = clientInput.shape.customFields.parse(input);
    await findClient(tx, actor.firmId, clientId);
    await writeCustomValues(tx, actor, clientId, values);
    await touch(tx, actor, clientId);
    return { message: "Custom fields saved." };
  });
export async function saveClientCatalog(
  token: string | undefined,
  kind: "entities" | "services" | "fields",
  input: unknown,
  recordId?: string,
) {
  if (recordId) id.parse(recordId);
  return clientMutation(
    token,
    kind === "fields" ? "clients.manage_custom_fields" : "clients.configure",
    async (tx, actor) => {
      const where = { firmId: actor.firmId, id: recordId };
      if (kind === "fields") {
        const data = definitionInput.parse(input);
        const before = recordId
          ? await tx.clientCustomFieldDefinition.findFirst({ where })
          : null;
        invariant(!recordId || before, "Custom field not found.", 404);
        if (before) {
          invariant(
            before.fieldType === data.fieldType,
            "Field type cannot be changed. Create a new field.",
          );
          const used = await tx.clientCustomFieldValue.findMany({
            where: {
              firmId: actor.firmId,
              definitionId: before.id,
              textValue: { not: null },
            },
            select: { textValue: true },
            distinct: ["textValue"],
          });
          if (data.fieldType === "Dropdown")
            invariant(
              used.every((v) => data.options.includes(v.textValue!)),
              "Keep dropdown choices that existing clients use.",
            );
        }
        const fields = { ...data, normalizedName: normalizeName(data.name) };
        const row = before
          ? await tx.clientCustomFieldDefinition.update({
              where: { firmId_id: { firmId: actor.firmId, id: before.id } },
              data: fields,
            })
          : await tx.clientCustomFieldDefinition.create({
              data: { ...fields, firmId: actor.firmId },
            });
        await audit(
          tx,
          actor.firmId,
          actor.id,
          "client_field.configured",
          "ClientCustomFieldDefinition",
          row.id,
          { name: data.name, active: data.active },
        );
        return { message: "Custom field saved." };
      }
      const data = catalogInput.parse(input);
      const fields = { ...data, normalizedName: normalizeName(data.name) };
      const before = recordId
        ? kind === "entities"
          ? await tx.entityType.findFirst({ where })
          : await tx.serviceLine.findFirst({ where })
        : null;
      invariant(!recordId || before, "Configuration record not found.", 404);
      const unique = { firmId_id: { firmId: actor.firmId, id: recordId! } };
      const row =
        kind === "entities"
          ? before
            ? await tx.entityType.update({ where: unique, data: fields })
            : await tx.entityType.create({
                data: { ...fields, firmId: actor.firmId },
              })
          : before
            ? await tx.serviceLine.update({ where: unique, data: fields })
            : await tx.serviceLine.create({
                data: { ...fields, firmId: actor.firmId },
              });
      await audit(
        tx,
        actor.firmId,
        actor.id,
        "client_catalog.configured",
        kind === "entities" ? "EntityType" : "ServiceLine",
        row.id,
        {
          before: before ? { name: before.name, active: before.active } : null,
          after: data,
        },
      );
      return { message: "Configuration saved." };
    },
  );
}
export async function bulkClients(token: string | undefined, input: unknown) {
  const data = z
    .object({
      ids: z.array(id).min(1).max(100),
      field: z.enum([
        "status",
        "responsiblePartnerId",
        "responsibleManagerId",
        "primaryOfficeId",
      ]),
      value: z.string().nullable(),
      confirmed: z.literal(true),
    })
    .parse(input);
  return clientMutation(token, "clients.edit", async (tx, actor) => {
    const ids = [...new Set(data.ids)];
    const rows = await tx.client.findMany({
      where: { firmId: actor.firmId, id: { in: ids } },
      include: { services: true, address: true },
    });
    invariant(
      rows.length === ids.length,
      "One or more clients were not found.",
      404,
    );
    if (data.field === "status") z.enum(CLIENT_STATUSES).parse(data.value);
    else if (data.value) id.parse(data.value);
    for (const row of rows) {
      await saveClientInTransaction(
        tx,
        actor,
        {
          ...row,
          onboardingDate:
            row.onboardingDate?.toISOString().slice(0, 10) ?? null,
          terminationDate:
            row.terminationDate?.toISOString().slice(0, 10) ?? null,
          serviceLineIds: row.services.map((s) => s.serviceLineId),
          address: row.address ?? undefined,
          customFields: {},
          acknowledgeDuplicate: true,
          [data.field]: data.value,
        },
        row.id,
      );
    }
    return { message: `${rows.length} clients updated.` };
  });
}
