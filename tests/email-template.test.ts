import { expect, test } from "vitest";
import { renderEmail } from "../src/lib/email-template";

test("renders the branded card with button, steps and details, plus a matching text part", () => {
  const { html, text } = renderEmail({
    preheader: "Preview line",
    heading: "Join Mehta & Associates",
    greeting: "Hi Anita,",
    paragraphs: ["You've been invited to **Mehta & Associates**."],
    button: { label: "Accept invitation", url: "https://app.example/invite#token=abc" },
    steps: { title: "Next", items: ["Set a password", "Sign in"] },
    details: [["Plan users", "3"]],
    note: "Expires in 48 hours.",
  });
  expect(html).toContain("Setu<span");
  expect(html).toContain("WORKFLOW");
  expect(html).toContain('href="https://app.example/invite#token=abc"');
  expect(html).toContain('<strong style="color:#0E1124;">Mehta &#38; Associates</strong>');
  expect(html).toContain("Plan users");
  expect(html).toContain("Preview line");
  expect(text).toContain("Accept invitation: https://app.example/invite#token=abc");
  expect(text).toContain("You've been invited to Mehta & Associates.");
  expect(text).toContain("1. Set a password");
  expect(text).toContain("Plan users: 3");
  expect(text).not.toContain("**");
});

test("escapes everything a user can type, so a firm name can't inject markup", () => {
  const { html } = renderEmail({
    preheader: "x",
    heading: '<img src=x onerror="alert(1)">',
    paragraphs: ["**<script>alert(1)</script>**"],
    details: [["Firm", "</td><script>"]],
  });
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
});
