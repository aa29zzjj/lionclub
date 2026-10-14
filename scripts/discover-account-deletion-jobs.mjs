// Job discoverer for AccountDeletionCleanup: finds eligible jobs and runs the
// trusted one-job worker (run-account-deletion-cleanup.mjs) for each, sequentially.
// Never processes a job past MAX_ATTEMPTS automatically — those are reported as
// stuck and need manual review, not deleted or silently skipped forever.
//
// node scripts/discover-account-deletion-jobs.mjs --environment production \
//   --confirm-host <host> --confirm-database <db>
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const MAX_ATTEMPTS = 5;
const STUCK_PROCESSING_MS = 5 * 60 * 1000;
const __dirname = dirname(fileURLToPath(import.meta.url));

export function parseDiscoveryOptions(args) {
  const allowed = new Set(["--environment", "--confirm-host", "--confirm-database", "--execute"]);
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!allowed.has(flag) || Object.hasOwn(values, flag)) throw new Error("INVALID_ARGUMENTS");
    if (flag === "--execute") { values[flag] = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error("INVALID_ARGUMENTS");
    values[flag] = value;
  }
  if (!["test", "staging", "production"].includes(values["--environment"])) throw new Error("EXPLICIT_ENVIRONMENT_REQUIRED");
  return { environment: values["--environment"], confirmHost: values["--confirm-host"], confirmDatabase: values["--confirm-database"], execute: values["--execute"] === true };
}

export function selectEligibleJobs(jobs, now = new Date()) {
  const eligible = [];
  const stuck = [];
  for (const job of jobs) {
    if (job.status === "COMPLETED") continue;
    if (job.attemptCount >= MAX_ATTEMPTS && job.status !== "PROCESSING") { stuck.push(job); continue; }
    if (job.status === "PROCESSING") {
      const startedAt = job.processingStartedAt ? new Date(job.processingStartedAt).getTime() : 0;
      if (now.getTime() - startedAt < STUCK_PROCESSING_MS) continue; // another worker likely still owns it
    }
    eligible.push(job);
  }
  return { eligible, stuck };
}

async function main() {
  const options = parseDiscoveryOptions(process.argv.slice(2));
  const { PrismaClient } = await import("@prisma/client");
  const databaseUrl = process.env.ACCOUNT_CLEANUP_DATABASE_URL;
  if (!databaseUrl) throw new Error("EXPLICIT_ACCOUNT_CLEANUP_DATABASE_URL_REQUIRED");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let summary;
  try {
    const jobs = await prisma.accountDeletionCleanup.findMany({
      where: { status: { in: ["PENDING", "FAILED", "PROCESSING"] } },
      select: { id: true, status: true, attemptCount: true, processingStartedAt: true, lastError: true, memberId: true },
      orderBy: { createdAt: "asc" },
    });
    const { eligible, stuck } = selectEligibleJobs(jobs);
    summary = { environment: options.environment, totalPending: jobs.length, eligible: eligible.length, stuck: stuck.length, results: [] };

    for (const job of eligible) {
      const workerArgs = [
        resolve(__dirname, "run-account-deletion-cleanup.mjs"),
        "--job", job.id,
        "--environment", options.environment,
      ];
      if (options.confirmHost) workerArgs.push("--confirm-host", options.confirmHost);
      if (options.confirmDatabase) workerArgs.push("--confirm-database", options.confirmDatabase);
      if (options.execute) workerArgs.push("--execute");
      const run = spawnSync(process.execPath, ["--import", "tsx", ...workerArgs], { encoding: "utf8", env: process.env });
      let parsed = null;
      try { parsed = JSON.parse((run.stdout || "").trim()); } catch { /* leave null, report raw below */ }
      summary.results.push({
        jobId: job.id,
        attemptCount: job.attemptCount,
        exitCode: run.status,
        output: parsed ?? (run.stdout || "").trim(),
        stderr: run.status !== 0 ? (run.stderr || "").trim() : undefined,
      });
    }

    summary.stuckJobs = stuck.map((job) => ({ jobId: job.id, memberId: job.memberId, attemptCount: job.attemptCount, lastError: job.lastError }));
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify(summary, null, 2));
  const anyFailed = summary.results.some((r) => r.exitCode !== 0) || summary.stuckJobs.length > 0;
  if (anyFailed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || "DISCOVERY_FAILED");
    process.exitCode = 1;
  });
}
