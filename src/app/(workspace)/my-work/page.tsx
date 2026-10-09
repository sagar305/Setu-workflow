import Link from "next/link";
import { AllocationWorkspace } from "@/components/allocations/workspace";
import { currentUser, sessionToken } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { myChecklist } from "@/lib/checklists";
import { notFound } from "next/navigation";
import { MyPoints } from "@/components/points/workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const query = await searchParams,
    actor = await currentUser();
  const checklist =
    hasPermission(actor, "checklist.view") &&
    hasPermission(actor, "my_work.view")
      ? await myChecklist(
          await sessionToken(),
          Number(query.checklistPage ?? 1),
        )
      : null;
  const allocations = hasPermission(actor, "allocations.view");
  const points =
    hasPermission(actor, "points.view") && hasPermission(actor, "my_work.view");
  if (!allocations && !checklist && !points) notFound();
  return (
    <>
      {allocations ? <AllocationWorkspace query={query} /> : <h1>My Work</h1>}
      {points && <MyPoints query={query} />}
      {checklist && (
        <section className="card detail-card">
          <h2>My Checklist Items</h2>
          <p className="muted">
            Assigned responsibilities. Checklist estimates are excluded from
            planned-hour totals.
          </p>
          <table>
            <thead>
              <tr>
                {[
                  "Client",
                  "Engagement",
                  "Checklist item",
                  "Workflow stage",
                  "Due date",
                  "Status",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checklist.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.engagement.client.displayName}</td>
                  <td>{i.engagement.engagementName}</td>
                  <td>
                    <Link href={`/engagements/${i.engagementId}?tab=checklist`}>
                      {i.itemTitle}
                    </Link>
                  </td>
                  <td>{i.stage.name}</td>
                  <td>{i.dueDate?.toISOString().slice(0, 10) ?? "—"}</td>
                  <td>{i.status.replace(/([a-z])([A-Z])/g, "$1 $2")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!checklist.total && <p>No assigned checklist items.</p>}
          <p>
            {checklist.total} items · Page {checklist.page}
          </p>
          <div className="actions">
            {checklist.page > 1 && (
              <Link
                href={`?${new URLSearchParams({ ...query, checklistPage: String(checklist.page - 1) })}`}
              >
                Previous checklist page
              </Link>
            )}
            {checklist.total > checklist.page * 25 && (
              <Link
                href={`?${new URLSearchParams({ ...query, checklistPage: String(checklist.page + 1) })}`}
              >
                Next checklist page
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );
}
