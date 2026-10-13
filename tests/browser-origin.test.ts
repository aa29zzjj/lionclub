import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { isTrustedBrowserMutation } from "../src/lib/browser-origin";

test("browser mutations reject missing, mismatched and malformed configured origins", () => {
  assert.equal(isTrustedBrowserMutation(new NextRequest("https://app.example.test/register"), ""), false);
  const request = new NextRequest("https://app.example.test/register", { headers: { origin: "https://attacker.example.test" } });
  assert.equal(isTrustedBrowserMutation(request, ""), false);
  assert.equal(isTrustedBrowserMutation(request, "not-a-url"), false);
});

test("same-origin and explicit public host work without trusting arbitrary request headers", () => {
  const local = new NextRequest("http://localhost:3100/api/auth/register", { headers: { origin: "http://localhost:3100" } });
  assert.equal(isTrustedBrowserMutation(local, ""), true);
  const proxied = new NextRequest("http://internal.example.test/api/auth/register", { headers: { origin: "https://app.example.test" } });
  assert.equal(isTrustedBrowserMutation(proxied, "https://app.example.test/path"), true);
  assert.equal(isTrustedBrowserMutation(proxied, "https://other.example.test"), false);
});
