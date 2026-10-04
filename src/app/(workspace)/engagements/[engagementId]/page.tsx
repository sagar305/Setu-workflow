import { ChecklistPanel } from "@/components/checklists/panel";
import { getChecklist } from "@/lib/checklists";
import { AllocationWorkspace } from "@/components/allocations/workspace";
import { engagementPage, engagementPageRecord } from "@/lib/engagement-page";
import { serialize } from "@/lib/client-page";
import { engagementOptions, engagementActivity } from "@/lib/engagements";
import { EngagementDetail } from "@/components/engagements/detail";
import { WorkflowPanel } from "@/components/workflows/workflow";
import {
  getWorkflow,
  compatibleTemplates,
  canManageWorkflow,
} from "@/lib/workflows";
import { currentUser } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ engagementId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { token, rights } = await engagementPage();
  const actor = await currentUser();
  const { engagementId } = await params;
  const query = await searchParams;
  const tab = [
    "overview",
    ...(rights.checklist ? ["checklist"] : []),
    "team",
    "activity",
    ...(rights.allocations ? ["assignments"] : []),
    ...(rights.workflowView ? ["workflow"] : []),
  ].includes(query.tab ?? "")
    ? query.tab!
    : "overview";
  const record = await engagementPageRecord(token, engagementId);
  const [options, activity, w] = await Promise.all([
    engagementOptions(token),
    tab === "activity"
      ? engagementActivity(token, engagementId, Number(query.page ?? 1))
      : undefined,
    tab === "workflow"
      ? getWorkflow(token, engagementId, Number(query.page ?? 1))
      : null,
  ]);
  const templates =
    tab === "workflow" && !w && hasPermission(actor, "workflows.apply")
      ? await compatibleTemplates(token, engagementId)
      : [];
  const checklist =
    tab === "checklist" ? await getChecklist(token, engagementId) : null;
  return (
    <EngagementDetail
      key={engagementId + tab + record.version}
      record={serialize(record)}
      options={options}
      rights={rights}
      tab={tab}
      checklist={
        checklist ? (
          <ChecklistPanel
            data={serialize(checklist)}
            engagementId={engagementId}
          />
        ) : undefined
      }
      activity={activity ? serialize(activity) : undefined}
      allocations={
        tab === "assignments" ? (
          <AllocationWorkspace engagementId={engagementId} query={query} />
        ) : undefined
      }
      workflow={
        tab === "workflow" ? (
          <WorkflowPanel
            key={w?.revision ?? "new"}
            workflow={serialize(w)}
            templates={serialize(templates)}
            record={serialize(record)}
            options={options}
            permissions={actor.role.permissions.map((p) => p.permissionKey)}
            userId={actor.id}
            canManage={canManageWorkflow(actor, record)}
            timezone={actor.firm.timezone}
          />
        ) : undefined
      }
    />
  );
}
