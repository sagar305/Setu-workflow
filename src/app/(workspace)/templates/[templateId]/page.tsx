import { currentUser, sessionToken } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { notFound } from "next/navigation";
import { getTemplate, templateOptions } from "@/lib/workflow-templates";
import { serialize } from "@/lib/client-page";
import { TemplateEditor } from "@/components/workflows/templates";
import { AppError } from "@/lib/errors";
export default async function Page({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const actor = await currentUser();
  if (!hasPermission(actor, "workflow_templates.view")) notFound();
  const token = await sessionToken(),
    { templateId } = await params;
  if (
    templateId === "new" &&
    !hasPermission(actor, "workflow_templates.create")
  )
    notFound();
  let record;
  try {
    record =
      templateId === "new" ? undefined : await getTemplate(token, templateId);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const options = await templateOptions(token);
  return (
    <TemplateEditor
      key={record?.id + "-" + record?.revision}
      record={record ? serialize(record) : undefined}
      options={options}
      permissions={actor.role.permissions.map((p) => p.permissionKey)}
    />
  );
}
