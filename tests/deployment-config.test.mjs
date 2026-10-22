import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Configuration/guard tests only. Never invoke real SSH, Docker, AWS or a DB.
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => readFile(path.join(root, name), "utf8");
const [workflow, dockerfile, ignore, compose, guide] = await Promise.all([
  read(".github/workflows/deploy-ec2.yml"), read("Dockerfile"), read(".dockerignore"), read("docker-compose.ec2.yml"), read("EC2_DEPLOY.md"),
]);
const sha = "a".repeat(40);
const minimalEnv = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C" };

function runBlock(name) {
  const lines = workflow.split("\n");
  let index = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  assert.ok(index >= 0, `Missing workflow step: ${name}`);
  while (index < lines.length && lines[index].trim() !== "run: |") index++;
  assert.ok(index < lines.length, `Missing run block: ${name}`);
  const indentation = lines[index].match(/^ */)[0].length + 2;
  const body = [];
  for (index++; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() && line.match(/^ */)[0].length < indentation) break;
    body.push(line.slice(indentation));
  }
  return body.join("\n");
}
const gate = runBlock("Decide whether EC2 deployment is enabled");
const validateSecrets = runBlock("Validate SSH configuration without printing secrets");
const ssh = runBlock("Deploy over verified OpenSSH");
const remote = ssh.split("<<'REMOTE'\n")[1]?.split("\nREMOTE")[0];
assert.ok(remote, "Missing quoted remote script");

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "lionclub-deploy-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const bash = (script, env = {}, args = []) => spawnSync("/bin/bash", ["-c", script, "deployment-test", ...args], { encoding: "utf8", timeout: 5000, env: { ...minimalEnv, ...env } });

test("Docker uses explicit source inputs including the required public metadata, no secret build args", async () => {
  assert.match(dockerfile, /^FROM node:22-alpine AS base$/m);
  assert.doesNotMatch(dockerfile, /^COPY\s+\.\s/m);
  assert.match(dockerfile, /^COPY docs\/app-store\/METADATA\.zh-Hant\.json /m);
  assert.doesNotMatch(dockerfile, /^(?:ARG|ENV)\s+(?:DATABASE_URL|AUTH_SECRET|GOOGLE_OAUTH|AWS_|OAUTH_TOKEN)/m);
  assert.match(dockerfile, /^USER nextjs$/m);
  const imports = await read("src/components/PublicServicePage.tsx");
  assert.match(imports, /docs\/app-store\/METADATA\.zh-Hant\.json/);
  for (const name of ["package.json", "package-lock.json", "next.config.js", "postcss.config.js", "tailwind.config.ts", "tsconfig.json", "prisma/schema.prisma", "docs/app-store/METADATA.zh-Hant.json"]) {
    // Only establish existence; do not read metadata/operator contents.
    await import("node:fs/promises").then(({ access }) => access(path.join(root, name)));
  }
});

test("build context is deny-by-default with only one docs JSON and defense-in-depth secret exclusions", () => {
  const patterns = ignore.split("\n").filter((line) => line && !line.startsWith("#"));
  assert.equal(patterns[0], "**");
  for (const pattern of ["**/.env*", "**/.aws", "**/.git", "**/private-*", "**/*.private.*", "**/*.pem", "**/*.key", "**/*.p8", "**/*.sql", "**/*.db"]) assert.ok(patterns.includes(pattern), pattern);
  const inclusions = patterns.filter((item) => item.startsWith("!"));
  assert.deepEqual(inclusions.filter((item) => item.startsWith("!docs")), ["!docs/", "!docs/app-store/", "!docs/app-store/METADATA.zh-Hant.json"]);
  assert.ok(patterns.includes("docs/**")); assert.ok(patterns.includes("docs/app-store/**"));
  assert.ok(!inclusions.some((item) => /(?:\.env|\.aws|private|data\/|output\/|backups\/|scripts\/|tests\/)/.test(item)));
  assert.ok(patterns.indexOf("**/.env*") > patterns.indexOf("!src/**"));
});

test("compose exposes only loopback, reads runtime env and uses HTTP-only liveness", () => {
  assert.match(compose, /"127\.0\.0\.1:3000:3000"/);
  assert.doesNotMatch(compose, /- ["']?(?:0\.0\.0\.0:)?3000:3000/);
  assert.match(compose, /env_file:\s*\n\s+- \.\/\.env\.docker/);
  assert.match(compose, /NODE_ENV: production/);
  assert.match(compose, /127\.0\.0\.1:3000\/login/);
  assert.doesNotMatch(compose, /\/api\/auth\/providers/);
  assert.match(compose, /HTTP liveness ONLY/);
});

test("workflow is main-gated, opt-in, non-cancelling, least-privilege and contains no destructive deploy commands", () => {
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /needs: gate\s*\n\s+if: needs\.gate\.outputs\.enabled == 'true'/);
  assert.doesNotMatch(workflow, /uses:\s/);
  assert.match(ssh, /StrictHostKeyChecking=yes/);
  assert.match(ssh, /actual_fingerprint.*ssh-keygen/);
  assert.match(ssh, /actual_fingerprint" != "\$EC2_HOST_FINGERPRINT/);
  const commands = remote.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(commands, /git (?:reset|clean)|docker (?:image|system) prune|prisma|migrate|db:seed|psql/);
  assert.match(commands, /git merge-base --is-ancestor HEAD/);
  assert.match(commands, /git merge --ff-only/);
  assert.match(commands, /git rev-parse HEAD/);
  assert.match(commands, /config --quiet/);
  assert.match(commands, /up -d --build --wait --wait-timeout 180/);
});

test("all embedded shell blocks have valid Bash syntax", () => {
  for (const script of [gate, validateSecrets, ssh, remote]) {
    const result = spawnSync("/bin/bash", ["-n"], { input: script, encoding: "utf8", env: minimalEnv });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("gate explains OFF/DB-not-approved/non-main without deployment; enables only both main approvals", async (t) => {
  const dir = await fixture(t);
  for (const [label, env, enabled, reason] of [
    ["default-off", {}, false, "EC2_DEPLOY_ENABLED"],
    ["db-not-approved", { DEPLOY_ENABLED: "true" }, false, "EC2_DATABASE_READY"],
    ["other-branch", { DEPLOY_ENABLED: "true", DATABASE_READY: "true", GITHUB_REF: "refs/heads/other" }, false, "Only main"],
    ["main-approved", { DEPLOY_ENABLED: "true", DATABASE_READY: "true" }, true, "deployment requested"],
  ]) {
    const output = path.join(dir, `${label}.output`), summary = path.join(dir, `${label}.summary`);
    const result = bash(gate, { GITHUB_REF: "refs/heads/main", DEPLOY_ENABLED: "", DATABASE_READY: "", GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, ...env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await readFile(output, "utf8")).trim(), `enabled=${enabled}`);
    assert.match(await readFile(summary, "utf8"), new RegExp(reason));
    if (!enabled) assert.match(result.stdout, /SKIPPED \/ NOT DEPLOYED/);
  }
});

test("enabled deployment fails clearly for missing SSH config, never logs supplied key material", () => {
  const env = { EC2_HOST: "host.example.test", EC2_USER: "deploy", EC2_SSH_KEY: "SYNTHETIC-KEY-NOT-A-REAL-KEY", EC2_HOST_FINGERPRINT: "SHA256:syntheticFingerprint123" };
  for (const missing of Object.keys(env)) {
    const result = bash(validateSecrets, { ...env, [missing]: "" });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, new RegExp(`Missing required repository secret: ${missing}`));
    assert.ok(!result.stdout.includes(env.EC2_SSH_KEY));
  }
  assert.equal(bash(validateSecrets, env).status, 0);
  assert.notEqual(bash(validateSecrets, { ...env, EC2_HOST: "bad-host --extra" }).status, 0);
});

async function simulateRemote(t, changes = {}) {
  const dir = await fixture(t), bin = path.join(dir, "bin"), checkout = path.join(dir, "checkout"), log = path.join(dir, "commands");
  await mkdir(bin); await mkdir(checkout);
  if (!changes.noEnv) await writeFile(path.join(checkout, ".env.docker"), "FEDERATED_AUTH_ENABLED=false\n", { mode: 0o600 });
  await writeFile(path.join(bin, "git"), `#!/bin/bash
set -eu
printf '%s\\n' "git $*" >> "$TEST_COMMAND_LOG"
case "$*" in
  'rev-parse --show-toplevel') printf '%s\\n' "$TEST_CHECKOUT" ;;
  'symbolic-ref --quiet --short HEAD') printf '%s\\n' "$TEST_BRANCH" ;;
  'status --porcelain --untracked-files=all') printf '%s' "$TEST_STATUS" ;;
  'fetch --no-tags origin main') exit 0 ;;
  'rev-parse refs/remotes/origin/main') printf '%s\\n' "$TEST_UPSTREAM_SHA" ;;
  'merge-base --is-ancestor HEAD '*) exit "$TEST_ANCESTOR_EXIT" ;;
  'merge --ff-only '*) exit 0 ;;
  'rev-parse HEAD') printf '%s\\n' "$TEST_HEAD_SHA" ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  await writeFile(path.join(bin, "docker"), `#!/bin/bash
printf '%s\\n' "docker $*" >> "$TEST_COMMAND_LOG"
exit "$TEST_DOCKER_EXIT"
`, { mode: 0o700 });
  // Substitute only the fixed target path; all actual guard/deployment commands
  // remain the workflow's exact script and resolve to local command stubs.
  const script = remote.replace('cd "$HOME/lionclub"', 'cd "$TEST_CHECKOUT"');
  const result = bash(script, { PATH: `${bin}:${minimalEnv.PATH}`, TEST_CHECKOUT: checkout, TEST_COMMAND_LOG: log,
    TEST_BRANCH: "main", TEST_STATUS: "", TEST_UPSTREAM_SHA: sha, TEST_ANCESTOR_EXIT: "0", TEST_HEAD_SHA: sha, TEST_DOCKER_EXIT: "0", ...changes }, [sha]);
  return { ...result, commands: await readFile(log, "utf8").catch(() => "") };
}

test("dirty tracked/untracked, wrong branch, missing runtime env and newer upstream all stop before deployment", async (t) => {
  for (const changes of [{ TEST_STATUS: " M user-file.ts\n" }, { TEST_STATUS: "?? user-notes.txt\n" }, { TEST_BRANCH: "work-in-progress" }, { noEnv: true }, { TEST_UPSTREAM_SHA: "b".repeat(40) }]) {
    const result = await simulateRemote(t, changes);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.commands, /^docker /m);
    assert.doesNotMatch(result.commands, /^git merge /m);
  }
});

test("local-ahead/divergent or concurrently changed revision cannot deploy unrelated commits", async (t) => {
  for (const changes of [{ TEST_ANCESTOR_EXIT: "1" }, { TEST_HEAD_SHA: "b".repeat(40) }]) {
    const result = await simulateRemote(t, changes);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.commands, /^docker /m);
  }
});

test("clean approved fast-forward reaches HTTP wait only; a failed container command is not success", async (t) => {
  const success = await simulateRemote(t);
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.commands, new RegExp(`git merge --ff-only ${sha}`));
  assert.match(success.commands, /docker compose -f docker-compose.ec2.yml config --quiet/);
  assert.match(success.commands, /up -d --build --wait --wait-timeout 180/);
  assert.match(success.stdout, /acceptance are still separate checks/);
  const failure = await simulateRemote(t, { TEST_DOCKER_EXIT: "1" });
  assert.notEqual(failure.status, 0);
  assert.doesNotMatch(failure.stdout, /liveness passed/);
});

test("handoff makes non-acceptance, DB-first approval and deployment prerequisites explicit", () => {
  assert.match(guide, /未執行容器 build/);
  assert.match(guide, /EC2_DEPLOY_ENABLED/); assert.match(guide, /EC2_DATABASE_READY/);
  assert.match(guide, /EC2_HOST_FINGERPRINT/);
  assert.match(guide, /不執行 migration/);
  assert.match(guide, /不證明 client secret/);
});
