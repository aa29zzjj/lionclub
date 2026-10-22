// Build-time nonsecret allowlist only. Never copy env wholesale or Google/Apple
// client secrets, DB URLs, session keys, encryption keys or AWS credentials.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const flags = ["FEDERATED_AUTH_ENABLED", "OAUTH_RUNTIME_SECRETS_ENABLED", "GOOGLE_OAUTH_FRESH_REAUTH_ENABLED"];
const origins = ["OAUTH_APP_ORIGIN", "NEXT_PUBLIC_APP_URL"];
export function publicRuntimeEnvironment(environment = process.env) {
  const result = {};
  const optional = name => typeof environment[name] === "string" && environment[name] !== "" ? environment[name] : undefined;
  for (const name of flags) {
    const value = optional(name); if (value === undefined) continue;
    if (!["true", "false"].includes(value)) throw Error("INVALID_PUBLIC_RUNTIME_CONFIGURATION");
    result[name] = value;
  }
  for (const name of origins) {
    const value = optional(name); if (value === undefined) continue;
    let url; try { url = new URL(value); } catch { throw Error("INVALID_PUBLIC_RUNTIME_CONFIGURATION"); }
    if (value.trim() !== value || url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error("INVALID_PUBLIC_RUNTIME_CONFIGURATION");
    result[name] = url.origin;
  }
  const secretName = optional("APP_SECRETS_NAME");
  if (secretName !== undefined) {
    if (!/^[A-Za-z0-9/_+=.@:-]{1,2048}$/.test(secretName)) throw Error("INVALID_PUBLIC_RUNTIME_CONFIGURATION");
    result.APP_SECRETS_NAME = secretName;
  }
  for (const name of ["AVATAR_BUCKET_NAME", "AVATAR_PUBLIC_BASE_URL", "PASSWORD_RESET_FROM_EMAIL"]) {
    const value = optional(name); if (value === undefined) continue;
    if (/[\r\n\0$]/.test(value) || value.trim() !== value) throw Error("INVALID_PUBLIC_RUNTIME_CONFIGURATION");
    if (name === "AVATAR_BUCKET_NAME" && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value)) throw Error("INVALID_PUBLIC_RUNTIME_CONFIGURATION");
    if (name === "PASSWORD_RESET_FROM_EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw Error("INVALID_PUBLIC_RUNTIME_CONFIGURATION");
    if (name === "AVATAR_PUBLIC_BASE_URL") {
      let url; try { url = new URL(value); } catch { throw Error("INVALID_PUBLIC_RUNTIME_CONFIGURATION"); }
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error("INVALID_PUBLIC_RUNTIME_CONFIGURATION");
    }
    result[name] = value;
  }
  return result;
}
export function renderPublicRuntimeEnvironment(environment = process.env) {
  return Object.entries(publicRuntimeEnvironment(environment)).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n";
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3 || !["--write", "--check"].includes(process.argv[2])) throw Error("INVALID_ARGUMENTS");
    const values = publicRuntimeEnvironment();
    if (process.argv[2] === "--write") writeFileSync(".env.production", renderPublicRuntimeEnvironment(), { mode: 0o600 });
    // Names only; values and the complete environment are never logged.
    console.log(JSON.stringify({ mode: process.argv[2], allowedNames: Object.keys(values) }));
  } catch { console.error("PUBLIC_RUNTIME_ENV_PREPARATION_FAILED"); process.exitCode = 1; }
}
