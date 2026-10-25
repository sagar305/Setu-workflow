import { requestTrial } from "@/lib/signup";
import { assertTrialWritable } from "@/lib/trial";
import { principal } from "@/lib/auth";
import { reportGet } from "@/lib/report-api";
import { capacityGet, capacityPost } from "@/lib/capacity-api";
import { timeGet, timePost } from "@/lib/time-api";
import { pointGet, pointPost } from "@/lib/point-api";
import { checklistGet, checklistPost } from "@/lib/checklist-api";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import {
  login,
  logout,
  requestReset,
  consumeToken,
  invitationDetails,
  limited,
} from "@/lib/auth";
import {
  readAdmin,
  userOptions,
  inviteUser,
  editUser,
  saveOffice,
  saveRole,
  saveFirm,
  resendInvitation,
  type Section,
} from "@/lib/admin";
import { cookieName } from "@/lib/session";
import { appUrl } from "@/lib/mail";
import { AppError, invariant } from "@/lib/errors";
import { clientGet, clientPost } from "@/lib/client-api";
import { clientActor } from "@/lib/clients";
import { engagementGet, engagementPost } from "@/lib/engagement-api";
import { engagementActor } from "@/lib/engagements";
import { workflowGet, workflowPost } from "@/lib/workflow-api";
import { allocationGet, allocationPost } from "@/lib/allocation-api";
import { listAllocations } from "@/lib/allocations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" "),
      },
      { status: 400 },
    );
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return NextResponse.json(
      { error: "A record with these details already exists." },
      { status: 409 },
    );
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "unknown",
  );
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
const isSection = (value: string): value is Section =>
  ["users", "offices", "roles", "firm"].includes(value);
export async function GET(req: NextRequest, context: Context) {
  try {
    const path = (await context.params).path;
    const token = req.cookies.get(cookieName)?.value;
    if (["dashboard", "reports"].includes(path[0]))
      return await reportGet(token, path, req.nextUrl.searchParams);
    if (path[0] === "capacity")
      return await capacityGet(token, path, req.nextUrl.searchParams);
    if (path[0] === "time")
      return await timeGet(token, path, req.nextUrl.searchParams);
    if (path[0] === "points")
      return await pointGet(token, path, req.nextUrl.searchParams);
    if (path[0] === "checklists")
      return await checklistGet(token, path, req.nextUrl.searchParams);
    if (path[0] === "allocations")
      return await allocationGet(token, path, req.nextUrl.searchParams);
    if (path[0] === "my-work" && path.length === 1)
      return NextResponse.json(
        await listAllocations(
          token,
          Object.fromEntries(req.nextUrl.searchParams),
        ),
      );
    if (["templates", "workflows", "my-work"].includes(path[0]))
      return await workflowGet(token, path, req.nextUrl.searchParams);
    if (path[0] === "clients")
      return await clientGet(token, path, req.nextUrl.searchParams);
    if (path[0] === "engagements")
      return await engagementGet(token, path, req.nextUrl.searchParams);
    if (path.join("/") === "admin/options")
      return NextResponse.json(await userOptions(token));
    invariant(
      path[0] === "admin" && isSection(path[1]) && path.length <= 3,
      "Not found.",
      404,
    );
    const result = await readAdmin(token, path[1], path[2]);
    if (path[2] && Array.isArray(result)) {
      invariant(result.length, "Record not found.", 404);
      return NextResponse.json(result[0]);
    }
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    invariant(
      req.headers.get("origin") === appUrl(),
      "Invalid request origin.",
      403,
    );
    invariant(
      req.headers.get("content-type")?.startsWith("application/json"),
      "JSON required.",
      415,
    );
    const path = (await context.params).path;
    const isClientImport = path[0] === "clients" && path[1] === "import";
    if (isClientImport)
      await clientActor(req.cookies.get(cookieName)?.value, "clients.import");
    const isEngagementImport =
      path[0] === "engagements" && path[1] === "import";
    if (isEngagementImport)
      await engagementActor(
        req.cookies.get(cookieName)?.value,
        "engagements.import",
      );
    const bodyLimit =
      isClientImport || isEngagementImport
        ? 2_000_000
        : ["clients", "engagements", "templates", "allocations"].includes(
              path[0],
            )
          ? 512_000
          : 16_384;
    // Read a bounded stream; Content-Length alone is attacker-controlled.
    const reader = req.body?.getReader();
    invariant(reader, "Request body required.");
    let text = "",
      bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > bodyLimit) {
        await reader.cancel();
        throw new AppError("Request too large.", 413);
      }
      text += decoder.decode(next.value, { stream: true });
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new AppError("Invalid JSON.");
    }
    invariant(
      data && typeof data === "object" && !Array.isArray(data),
      "Invalid request.",
    );
    const route = path.join("/");
    const token = req.cookies.get(cookieName)?.value;
    if (path[0] !== "auth") assertTrialWritable((await principal(token)).firm);
    if (path[0] === "capacity") return await capacityPost(token, path, data);
    if (path[0] === "time") return await timePost(token, path, data);
    if (path[0] === "points") return await pointPost(token, path, data);
    if (path[0] === "checklists") return await checklistPost(token, path, data);
    if (path[0] === "allocations")
      return await allocationPost(token, path, data);
    if (["templates", "workflows"].includes(path[0]))
      return await workflowPost(token, path, data);
    if (path[0] === "clients") return await clientPost(token, path, data);
    if (path[0] === "engagements")
      return await engagementPost(token, path, data);
    // Trust a proxy header only if deployment explicitly supplies and sanitizes it.
    const clientKey =
      process.env.TRUST_PROXY === "true"
        ? (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "shared")
        : "shared";
    if (route === "auth/signup")
      return NextResponse.json(await requestTrial(data, clientKey));
    if (route === "auth/login") {
      const session = await login(data, clientKey);
      const response = NextResponse.json({ message: "Logged in." });
      response.cookies.set(cookieName, session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 8 * 3600,
      });
      return response;
    }
    if (route === "auth/logout") {
      await logout(token);
      const response = NextResponse.json({ message: "Logged out." });
      response.cookies.set(cookieName, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }
    if (route === "auth/forgot") {
      await requestReset(data.email, clientKey);
      return NextResponse.json({
        message:
          "If this email is eligible, a password reset link will be sent.",
      });
    }
    if (route === "auth/invitation") {
      await limited("token-details", clientKey, 100);
      invariant(typeof data.token === "string", "Invalid invitation.");
      return NextResponse.json(await invitationDetails(data.token));
    }
    if (route === "auth/invite" || route === "auth/reset") {
      await limited("token-consume", clientKey, 50);
      await consumeToken(path[1] as "invite" | "reset", data);
      return NextResponse.json({
        message: "Password saved. You can now log in.",
      });
    }
    if (route === "admin/users")
      return NextResponse.json(await inviteUser(token, data));
    if (route === "admin/firm")
      return NextResponse.json(await saveFirm(token, data));
    if (
      path[0] === "admin" &&
      path[1] === "users" &&
      path[2] &&
      path[3] === "resend" &&
      path.length === 4
    )
      return NextResponse.json(await resendInvitation(token, path[2]));
    if (
      path[0] === "admin" &&
      path[1] === "users" &&
      path[2] &&
      path.length === 3
    )
      return NextResponse.json(await editUser(token, path[2], data));
    if (path[0] === "admin" && path.length <= 3 && path[1] === "offices")
      return NextResponse.json(await saveOffice(token, path[2], data));
    if (path[0] === "admin" && path.length <= 3 && path[1] === "roles")
      return NextResponse.json(await saveRole(token, path[2], data));
    throw new AppError("Not found.", 404);
  } catch (error) {
    return errorResponse(error);
  }
}
