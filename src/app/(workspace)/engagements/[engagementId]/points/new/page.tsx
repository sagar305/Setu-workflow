import Link from "next/link";
import { notFound } from "next/navigation";
import { engagementPage, engagementPageRecord } from "@/lib/engagement-page";
import { pointOptions } from "@/lib/points";
import { PointCreateForm } from "@/components/points/fields";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ engagementId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { token } = await engagementPage("points.create"),
    { engagementId } = await params,
    query = await searchParams;
  const record = await engagementPageRecord(token, engagementId),
    options = await pointOptions(token, engagementId);
  if (!options.permissions.includes("points.assign")) notFound();
  if (
    query.checklistItemId &&
    !options.checklistItems.some((i) => i.id === query.checklistItemId)
  )
    notFound();
  return (
    <>
      <Link
        className="back-link"
        href={`/engagements/${engagementId}?tab=queries`}
      >
        ← Queries
      </Link>
      <div className="page-heading">
        <h1>Raise Point</h1>
        <p>{record.engagementName}</p>
      </div>
      <section className="card detail-card">
        <PointCreateForm
          engagementId={engagementId}
          options={options}
          checklistItemId={query.checklistItemId}
        />
      </section>
    </>
  );
}
