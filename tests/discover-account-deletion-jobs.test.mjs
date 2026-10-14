import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDiscoveryOptions, selectEligibleJobs } from "../scripts/discover-account-deletion-jobs.mjs";

test("discovery options require an explicit environment", () => {
  assert.throws(() => parseDiscoveryOptions([]), /EXPLICIT_ENVIRONMENT_REQUIRED/);
  assert.throws(() => parseDiscoveryOptions(["--environment", "bogus"]), /EXPLICIT_ENVIRONMENT_REQUIRED/);
  const parsed = parseDiscoveryOptions(["--environment", "production", "--confirm-host", "h", "--confirm-database", "d", "--execute"]);
  assert.deepEqual(parsed, { environment: "production", confirmHost: "h", confirmDatabase: "d", execute: true });
});

test("selectEligibleJobs skips completed jobs, quarantines jobs past max attempts, and leaves recently-claimed PROCESSING jobs alone", () => {
  const now = new Date("2026-01-01T00:10:00.000Z");
  const jobs = [
    { id: "a", status: "PENDING", attemptCount: 0, processingStartedAt: null },
    { id: "b", status: "FAILED", attemptCount: 2, processingStartedAt: null },
    { id: "c", status: "COMPLETED", attemptCount: 1, processingStartedAt: null },
    { id: "d", status: "FAILED", attemptCount: 5, processingStartedAt: null },
    { id: "e", status: "PROCESSING", attemptCount: 1, processingStartedAt: "2026-01-01T00:09:00.000Z" },
    { id: "f", status: "PROCESSING", attemptCount: 1, processingStartedAt: "2026-01-01T00:02:00.000Z" },
  ];
  const { eligible, stuck } = selectEligibleJobs(jobs, now);
  assert.deepEqual(eligible.map((j) => j.id), ["a", "b", "f"]);
  assert.deepEqual(stuck.map((j) => j.id), ["d"]);
});
