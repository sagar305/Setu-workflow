import { afterEach, expect, test } from "vitest";
import { db } from "../src/lib/db";
import { assertNotDemo, isDemo, nextDemoReset } from "../src/lib/demo";
import { resetDemo } from "../src/lib/demo-reset";
import { platformRouteSecret } from "../src/lib/platform-auth";

const saved = { ...process.env };
afterEach(() => {
  for (const key of ["DEMO_MODE", "DEMO_PASSWORD", "PLATFORM_ROUTE_SECRET"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

test("demo mode is off unless DEMO_MODE is exactly true", () => {
  delete process.env.DEMO_MODE;
  expect(isDemo()).toBe(false);
  expect(() => assertNotDemo("Sign-up")).not.toThrow();
  process.env.DEMO_MODE = "1";
  expect(isDemo()).toBe(false);
  process.env.DEMO_MODE = "true";
  expect(() => assertNotDemo("Sign-up")).toThrow("Sign-up is turned off in the demo.");
});

test("resets fall on 00:00 and 12:00 UTC", () => {
  expect(nextDemoReset(new Date("2026-11-07T03:15:00Z")).toISOString()).toBe("2026-11-07T12:00:00.000Z");
  expect(nextDemoReset(new Date("2026-11-07T12:00:00Z")).toISOString()).toBe("2026-11-08T00:00:00.000Z");
  expect(nextDemoReset(new Date("2026-11-07T23:59:59Z")).toISOString()).toBe("2026-11-08T00:00:00.000Z");
});

test("the owner console is off in the demo", () => {
  process.env.PLATFORM_ROUTE_SECRET = "abcdefabcdefabcdef12";
  delete process.env.DEMO_MODE;
  expect(platformRouteSecret()).toBe("abcdefabcdefabcdef12");
  process.env.DEMO_MODE = "true";
  expect(platformRouteSecret()).toBeNull();
});

test("reset refuses without DEMO_MODE, and on any database with data that was never marked as a demo", async () => {
  delete process.env.DEMO_MODE;
  await expect(resetDemo()).rejects.toThrow("DEMO_MODE is not enabled");

  process.env.DEMO_MODE = "true";
  process.env.DEMO_PASSWORD = "demo-password-2026";
  await db.demoInstance.deleteMany();
  const firm = await db.firm.create({ data: { firmName: "Real Customer LLP", displayName: "Real Customer LLP", timezone: "UTC" } });
  const before = await db.firm.count();
  await expect(resetDemo()).rejects.toThrow("never marked as a demo database");
  expect(await db.firm.count()).toBe(before);
  expect(await db.demoInstance.count()).toBe(0);
  await db.firm.delete({ where: { id: firm.id } });
});
