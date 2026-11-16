import assert from "node:assert/strict";
import { test } from "node:test";
import { signMobileAccessToken, signMobileRefreshToken } from "../src/lib/mobile-auth";
import { isolatedReviewerEmail, selectBackend, tokenPairMatchesBackend } from "../mobile-app/src/review-backend";

const production = "https://lionclubsmembership.com";
const review = "https://review.example.test";

test("only the fixed isolated reviewer routes to the review origin, including after a cold start", async () => {
  const key = new TextEncoder().encode("disposable-routing-test-signing-key");
  async function pair(email: string) {
    const payload = { email, memberId: "member", userId: "user", sessionVersion: 0 };
    return { accessToken: await signMobileAccessToken(payload, key), refreshToken: await signMobileRefreshToken(payload, key) };
  }
  const normal = await pair("member@example.test");
  const isolated = await pair(isolatedReviewerEmail);
  for (const token of Object.values(normal)) assert.equal(selectBackend(production, review, { token }), production);
  for (const token of Object.values(isolated)) {
    assert.equal(selectBackend(production, review, { token }), review);
    assert.throws(() => selectBackend(production, "", { token }), /UNCONFIGURED/);
  }
  assert.equal(selectBackend(production, review, { email: isolatedReviewerEmail.toUpperCase() }), review);
  assert.equal(selectBackend(production, review, { email: isolatedReviewerEmail + ".invalid" }), production);
  assert.equal(selectBackend(production, review, {}), production);
  assert.equal(tokenPairMatchesBackend(isolated, true), true);
  assert.equal(tokenPairMatchesBackend(normal, false), true);
  assert.equal(tokenPairMatchesBackend(isolated, false), false);
  assert.equal(tokenPairMatchesBackend({ ...isolated, refreshToken: normal.refreshToken }, true), false);
});
