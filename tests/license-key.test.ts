import { expect, test } from "vitest";
import { issueLicenseKey, readLicenseKey, MAX_LICENSE_SEATS } from "../src/lib/license-key";

const secret = "test-secret";

// Pins the format. Setu_main must produce exactly this key for this input.
test("matches the shared test vector", () => {
  expect(issueLicenseKey("order-123", 30, 3, secret)).toBe(
    "SETUWF-QXEURZ-JBMNTL-BGJVW6-JFJIQB-4MRVRI-UN57XD-CIMDFM-O7RV6I-ANQSYN-TDH33Q-Y7YTTK-ZXW",
  );
  expect(
    readLicenseKey(
      "SETUWF-QXEURZ-JBMNTL-BGJVW6-JFJIQB-4MRVRI-UN57XD-CIMDFM-O7RV6I-ANQSYN-TDH33Q-Y7YTTK-ZXW",
      secret,
    ),
  ).toEqual({ keyId: "15af4b7ddf472734e009", days: 30, seats: 3 });
});

test("round-trips days and seats, and is deterministic per order", () => {
  const key = issueLicenseKey("SALES-1", 365, 12, secret);
  expect(readLicenseKey(key, secret)).toMatchObject({ days: 365, seats: 12 });
  expect(issueLicenseKey("SALES-1", 365, 12, secret)).toBe(key);
  expect(readLicenseKey(issueLicenseKey("SALES-2", 365, 12, secret), secret)!.keyId).not.toBe(
    readLicenseKey(key, secret)!.keyId,
  );
});

test("tolerates formatting and common misreadings", () => {
  const key = issueLicenseKey("order-9", 30, 3, secret);
  const body = key.replace(/^SETUWF-/, "");
  expect(readLicenseKey(key.toLowerCase(), secret)).not.toBeNull();
  expect(readLicenseKey(` ${key.replace(/-/g, " ")} `, secret)).not.toBeNull();
  expect(readLicenseKey(body, secret)).not.toBeNull();
  expect(readLicenseKey(key.replace(/O/g, "0").replace(/I/g, "1"), secret)).not.toBeNull();
});

test("rejects forged, tampered, truncated and foreign keys", () => {
  const key = issueLicenseKey("order-7", 30, 3, secret);
  expect(readLicenseKey(key, "other-secret")).toBeNull();
  // Flip a character in the ciphertext (the last one carries a padding bit).
  const i = 30;
  const swapped = key[i] === "A" ? "B" : "A";
  expect(readLicenseKey(key.slice(0, i) + swapped + key.slice(i + 1), secret)).toBeNull();
  expect(readLicenseKey(key.slice(0, -6), secret)).toBeNull();
  expect(readLicenseKey("SETU-NOT-A-KEY", secret)).toBeNull();
  expect(readLicenseKey("", secret)).toBeNull();
});

test("refuses to issue out-of-range keys", () => {
  expect(() => issueLicenseKey("x", 0, 3, secret)).toThrow();
  expect(() => issueLicenseKey("x", 30, 0, secret)).toThrow();
  expect(() => issueLicenseKey("x", 30, MAX_LICENSE_SEATS + 1, secret)).toThrow();
  expect(() => issueLicenseKey("", 30, 3, secret)).toThrow();
});
