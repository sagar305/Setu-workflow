import { NextResponse } from "next/server";
import { AppError } from "./errors";
import {
  engagementActor,
  engagementOptions,
  engagementClients,
  listEngagements,
  getEngagement,
  engagementActivity,
  saveEngagement,
  changeEngagement,
  saveEngagementCatalog,
  bulkEngagements,
} from "./engagements";
import {
  engagementTemplate,
  exportEngagements,
  inspectEngagementImport,
  previewEngagementImport,
  commitEngagementImport,
} from "./engagement-csv";
const csv = (content: string, name: string) =>
  new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
export async function engagementGet(
  token: string | undefined,
  path: string[],
  query: URLSearchParams,
) {
  const route = path.join("/");
  const input = Object.fromEntries(query);
  if (route === "engagements")
    return NextResponse.json(await listEngagements(token, input));
  if (route === "engagements/options")
    return NextResponse.json(await engagementOptions(token));
  if (route === "engagements/clients")
    return NextResponse.json(await engagementClients(token, input));
  if (route === "engagements/template") {
    await engagementActor(token, "engagements.import");
    return csv(engagementTemplate(), "setu-engagement-template.csv");
  }
  if (route === "engagements/export")
    return csv(await exportEngagements(token, input), "setu-engagements.csv");
  if (path.length === 2)
    return NextResponse.json(await getEngagement(token, path[1]));
  if (path.length === 3 && path[2] === "activity")
    return NextResponse.json(
      await engagementActivity(token, path[1], Number(query.get("page") ?? 1)),
    );
  throw new AppError("Not found.", 404);
}
export async function engagementPost(
  token: string | undefined,
  path: string[],
  data: unknown,
) {
  const route = path.join("/");
  let result;
  if (route === "engagements") result = await saveEngagement(token, data);
  else if (route === "engagements/bulk")
    result = await bulkEngagements(token, data);
  else if (route === "engagements/import/inspect")
    result = await inspectEngagementImport(token, data);
  else if (route === "engagements/import/preview")
    result = await previewEngagementImport(token, data);
  else if (route === "engagements/import/commit")
    result = await commitEngagementImport(token, data);
  else if (
    path[1] === "configuration" &&
    ["types", "fields"].includes(path[2]) &&
    path.length <= 4
  )
    result = await saveEngagementCatalog(
      token,
      path[2] as "types" | "fields",
      data,
      path[3],
    );
  else if (path.length === 2)
    result = await saveEngagement(token, data, path[1]);
  else if (path.length === 3 && ["status", "assign"].includes(path[2]))
    result = await changeEngagement(
      token,
      path[1],
      data,
      path[2] as "status" | "assign",
    );
  else throw new AppError("Not found.", 404);
  return NextResponse.json(result);
}
