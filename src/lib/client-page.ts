import { notFound } from "next/navigation";
import { currentUser, sessionToken } from "./session";
import { hasPermission } from "./auth";
import type { PermissionKey } from "./permissions";
import type { Rights, Serialized } from "@/components/clients/types";
import { getClient } from "./clients";
import { AppError } from "./errors";
export const serialize = <T>(value: T): Serialized<T> =>
  JSON.parse(JSON.stringify(value));
export async function clientPage(permission: PermissionKey = "clients.view") {
  const user = await currentUser();
  if (!hasPermission(user, "clients.view") || !hasPermission(user, permission))
    notFound();
  const rights: Rights = {
    create: hasPermission(user, "clients.create"),
    edit: hasPermission(user, "clients.edit"),
    contacts: hasPermission(user, "clients.manage_contacts"),
    services: hasPermission(user, "clients.manage_services"),
    import: hasPermission(user, "clients.import"),
    export: hasPermission(user, "clients.export"),
    configure: hasPermission(user, "clients.configure"),
    fields: hasPermission(user, "clients.manage_custom_fields"),
  };
  return { token: await sessionToken(), rights, userId: user.id };
}
export async function clientPageRecord(
  token: string | undefined,
  clientId: string,
) {
  try {
    return await getClient(token, clientId);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
