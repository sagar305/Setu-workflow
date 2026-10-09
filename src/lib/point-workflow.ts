import {
  audit,
  requirePermission,
  type Database,
  type Principal,
} from "./auth";
import { invariant } from "./errors";
import { POINT_OPEN_STATUSES } from "./point-validation";
export function blockingPoints(
  tx: Database,
  firmId: string,
  engagementId: string,
  currentStageId: string | null,
  all = false,
) {
  return tx.engagementPoint.findMany({
    where: {
      firmId,
      engagementId,
      blocking: true,
      pointType: { not: "KnowledgeInstruction" },
      status: { in: [...POINT_OPEN_STATUSES] },
      ...(all
        ? {}
        : {
            OR: [
              { workflowStageId: null },
              { workflowStageId: currentStageId },
            ],
          }),
    },
    select: { id: true, pointNumber: true, title: true, workflowStageId: true },
    orderBy: { pointSequence: "asc" },
  });
}
export async function guardBlockingPoints(
  tx: Database,
  actor: Principal,
  engagementId: string,
  workflowId: string,
  currentStageId: string | null,
  revision: number,
  all: boolean,
  reason: string,
  manager: boolean,
) {
  const points = await blockingPoints(
    tx,
    actor.firmId,
    engagementId,
    currentStageId,
    all,
  );
  if (!points.length) return;
  invariant(
    reason.length > 0,
    `${points.length} unresolved blocking point(s) prevent movement. Resolve them or provide an authorized override reason.`,
  );
  requirePermission(actor, "points.override_blocking");
  invariant(
    manager,
    "Only an engagement workflow manager may override blocking points.",
    403,
  );
  await audit(
    tx,
    actor.firmId,
    actor.id,
    "point.blocking_override",
    "EngagementWorkflow",
    workflowId,
    { engagementId, currentStageId, revision, reason, points },
  );
}
