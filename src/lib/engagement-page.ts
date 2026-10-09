import { notFound } from "next/navigation";
import { currentUser, sessionToken } from "./session";
import { hasPermission } from "./auth";
import { getEngagement } from "./engagements";
import type { PermissionKey } from "./permissions";
import { AppError } from "./errors";
export async function engagementPage(
  permission: PermissionKey = "engagements.view",
) {
  const user = await currentUser();
  if (
    !hasPermission(user, "engagements.view") ||
    !hasPermission(user, permission)
  )
    notFound();
  return {
    token: await sessionToken(),
    userId: user.id,
    rights: {
      hours: hasPermission(user, "budget.view") || hasPermission(user, "time.view_engagement"),
      points: hasPermission(user, "points.view"),
      checklist: hasPermission(user, "checklist.view"),
      allocations:
        hasPermission(user, "allocations.view") &&
        hasPermission(user, "my_work.view"),
      workflowApply:
        hasPermission(user, "workflows.apply") &&
        hasPermission(user, "workflows.start"),
      workflowView: hasPermission(user, "workflows.view"),
      create: hasPermission(user, "engagements.create"),
      edit: hasPermission(user, "engagements.edit"),
      assign: hasPermission(user, "engagements.assign"),
      status: hasPermission(user, "engagements.change_status"),
      budget: hasPermission(user, "engagements.manage_budget"),
      import: hasPermission(user, "engagements.import"),
      export: hasPermission(user, "engagements.export"),
      configure: hasPermission(user, "engagements.configure"),
      fields: hasPermission(user, "engagements.manage_custom_fields"),
      associate: hasPermission(user, "clients.manage_services"),
      clientView: hasPermission(user, "clients.view"),
    },
  };
}
export async function engagementPageRecord(
  token: string | undefined,
  id: string,
) {
  try {
    return await getEngagement(token, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
