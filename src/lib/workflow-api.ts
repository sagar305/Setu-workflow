import { NextResponse } from "next/server";
import { AppError } from "./errors";
import {
  listTemplates,
  getTemplate,
  templateOptions,
  saveTemplate,
  templateAction,
  setDefaultTemplate,
} from "./workflow-templates";
import {
  getWorkflow,
  compatibleTemplates,
  applyWorkflow,
  transitionWorkflow,
  myWork,
} from "./workflows";
export async function workflowGet(
  token: string | undefined,
  path: string[],
  query: URLSearchParams,
) {
  if (path[0] === "templates") {
    if (path.length === 1)
      return NextResponse.json(
        await listTemplates(token, Object.fromEntries(query)),
      );
    if (path.length === 2)
      return NextResponse.json(
        path[1] === "options"
          ? await templateOptions(token)
          : await getTemplate(token, path[1]),
      );
  }
  if (path[0] === "my-work" && path.length === 1)
    return NextResponse.json(await myWork(token, Object.fromEntries(query)));
  if (path[0] === "workflows" && path.length >= 2) {
    if (path.length === 2)
      return NextResponse.json(
        await getWorkflow(token, path[1], Number(query.get("page") ?? 1)),
      );
    if (path.length === 3 && path[2] === "templates")
      return NextResponse.json(await compatibleTemplates(token, path[1]));
  }
  throw new AppError("Not found.", 404);
}
export async function workflowPost(
  token: string | undefined,
  path: string[],
  input: unknown,
) {
  if (path[0] === "templates") {
    if (path.length <= 2)
      return NextResponse.json(await saveTemplate(token, input, path[1]));
    if (path.length === 3 && path[2] === "action")
      return NextResponse.json(await templateAction(token, path[1], input));
    if (path.length === 3 && path[1] === "default")
      return NextResponse.json(await setDefaultTemplate(token, path[2], input));
  }
  if (path[0] === "workflows" && path.length === 3) {
    if (path[2] === "apply")
      return NextResponse.json(await applyWorkflow(token, path[1], input));
    if (path[2] === "transition")
      return NextResponse.json(await transitionWorkflow(token, path[1], input));
  }
  throw new AppError("Not found.", 404);
}
