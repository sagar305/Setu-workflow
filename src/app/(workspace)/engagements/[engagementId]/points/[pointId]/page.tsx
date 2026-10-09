import { notFound } from "next/navigation";
import { engagementPage } from "@/lib/engagement-page";
import { getPoint, pointOptions } from "@/lib/points";
import { PointDetail } from "@/components/points/detail";
import { serialize } from "@/lib/client-page";
import { AppError } from "@/lib/errors";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ engagementId: string; pointId: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { token } = await engagementPage("points.view"),
    { engagementId, pointId } = await params,
    query = await searchParams;
  let data;
  try {
    data = await getPoint(token, pointId, Number(query.page ?? 1));
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  if (data.point.engagementId !== engagementId) notFound();
  const options = await pointOptions(token, engagementId);
  return (
    <PointDetail
      key={`${pointId}-${data.point.revision}-${data.page}`}
      data={serialize(data)}
      options={options}
    />
  );
}
