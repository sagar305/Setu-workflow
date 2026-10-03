import { NextResponse } from "next/server";
import {
  listClients,
  getClient,
  getContact,
  clientOptions,
  clientActivity,
  saveClient,
  saveContact,
  saveClientServices,
  saveClientFields,
  saveClientCatalog,
  bulkClients,
  clientActor,
} from "./clients";
import {
  inspectImport,
  previewImport,
  commitImport,
  exportClients,
  importTemplate,
} from "./client-csv";
import { AppError } from "./errors";
export async function clientGet(
  token: string | undefined,
  path: string[],
  query: URLSearchParams,
) {
  const route = path.join("/");
  if (route === "clients")
    return NextResponse.json(
      await listClients(token, Object.fromEntries(query)),
    );
  if (route === "clients/options")
    return NextResponse.json(await clientOptions(token));
  if (route === "clients/template") {
    await clientActor(token, "clients.import");
    return csvResponse(importTemplate(), "setu-client-template.csv");
  }
  if (route === "clients/export")
    return csvResponse(
      await exportClients(token, Object.fromEntries(query)),
      "setu-clients.csv",
    );
  if (path.length === 2)
    return NextResponse.json(await getClient(token, path[1]));
  if (path.length === 3 && path[2] === "activity")
    return NextResponse.json(
      await clientActivity(token, path[1], Number(query.get("page") ?? 1)),
    );
  if (path.length === 4 && path[2] === "contacts")
    return NextResponse.json(await getContact(token, path[1], path[3]));
  throw new AppError("Not found.", 404);
}
function csvResponse(content: string, filename: string) {
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
export async function clientPost(
  token: string | undefined,
  path: string[],
  data: Record<string, unknown>,
) {
  const route = path.join("/");
  let result;
  if (route === "clients") result = await saveClient(token, data);
  else if (route === "clients/bulk") result = await bulkClients(token, data);
  else if (route === "clients/import/inspect")
    result = await inspectImport(token, data);
  else if (route === "clients/import/preview")
    result = await previewImport(token, data);
  else if (route === "clients/import/commit")
    result = await commitImport(token, data);
  else if (
    path[1] === "configuration" &&
    ["entities", "services", "fields"].includes(path[2]) &&
    path.length <= 4
  )
    result = await saveClientCatalog(
      token,
      path[2] as "entities" | "services" | "fields",
      data,
      path[3],
    );
  else if (path.length === 2) result = await saveClient(token, data, path[1]);
  else if (path[2] === "contacts" && path.length <= 4)
    result = await saveContact(token, path[1], data, path[3]);
  else if (path[2] === "services" && path.length === 3)
    result = await saveClientServices(token, path[1], data.ids);
  else if (path[2] === "fields" && path.length === 3)
    result = await saveClientFields(token, path[1], data.values);
  else throw new AppError("Not found.", 404);
  return NextResponse.json(result);
}
