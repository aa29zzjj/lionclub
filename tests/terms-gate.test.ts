import assert from "node:assert/strict";
import { test } from "node:test";
import { hasAcceptedCurrentTerms } from "../src/lib/terms-gate";
import { TERMS_VERSION } from "../src/lib/terms";

test("only an acceptance of the current terms version unlocks posting", () => {
  assert.equal(hasAcceptedCurrentTerms({ termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION }), true);
  assert.equal(hasAcceptedCurrentTerms({ termsAcceptedAt: null, termsVersion: null }), false, "never accepted");
  assert.equal(hasAcceptedCurrentTerms({ termsAcceptedAt: new Date(), termsVersion: "2020-01-01" }), false, "stale version must re-prompt");
  assert.equal(hasAcceptedCurrentTerms({ termsAcceptedAt: null, termsVersion: TERMS_VERSION }), false, "version without a timestamp is not consent");
});
