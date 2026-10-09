import { engagementPage } from "@/lib/engagement-page";
import { serialize } from "@/lib/client-page";
import { listEngagements, engagementOptions } from "@/lib/engagements";
import { EngagementListPanel } from "@/components/engagements/list";
import { engagementListInput } from "@/lib/engagement-validation";
import Link from "next/link";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, rights, userId } = await engagementPage();
  const query = Object.fromEntries(
    Object.entries(await searchParams).filter(([, v]) => typeof v === "string"),
  );
  const parsed = engagementListInput.safeParse(query);
  if (!parsed.success)
    return (
      <section className="card detail-card">
        <h1>Invalid engagement filters</h1>
        <p role="alert">
          {parsed.error.issues.map((i) => i.message).join(" ")}
        </p>
        <Link href="/engagements">Clear filters</Link>
      </section>
    );
  const [data, options] = await Promise.all([
    listEngagements(token, parsed.data),
    engagementOptions(token),
  ]);
  return (
    <EngagementListPanel
      key={JSON.stringify(query)}
      userId={userId}
      data={serialize(data)}
      options={options}
      rights={rights}
    />
  );
}
