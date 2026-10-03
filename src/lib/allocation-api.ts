import { NextResponse } from "next/server";
import { AppError } from "./errors";
import {
  listAllocations,
  createAllocations,
  changeAllocation,
  allocationOptions,
  allocationHistory,
  allocationBudget,
} from "./allocations";
export async function allocationGet(
  token: string | undefined,
  path: string[],
  query: URLSearchParams,
) {
  if (path.length === 1)
    return NextResponse.json(
      await listAllocations(
        token,
        Object.fromEntries(query),
        query.get("scope") === "team",
      ),
    );
  if (path.length === 3 && path[2] === "options")
    return NextResponse.json(await allocationOptions(token, path[1]));
  if (path.length === 3 && path[2] === "budget")
    return NextResponse.json(await allocationBudget(token, path[1]));
  if (path.length === 3 && path[2] === "history")
    return NextResponse.json(
      await allocationHistory(token, path[1], Number(query.get("page") ?? 1)),
    );
  throw new AppError("Not found.", 404);
}
export async function allocationPost(
  token: string | undefined,
  path: string[],
  input: unknown,
) {
  if (path.length === 1)
    return NextResponse.json(await createAllocations(token, input));
  if (path.length === 2 && path[1] === "preview")
    return NextResponse.json(await createAllocations(token, input, true));
  if (path.length === 2)
    return NextResponse.json(await changeAllocation(token, path[1], input));
  throw new AppError("Not found.", 404);
}
