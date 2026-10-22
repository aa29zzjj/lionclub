import { createRuntimeSecretsResolver } from "./runtime-secrets";
if (typeof window !== "undefined") throw Error("SERVER_RUNTIME_ONLY");

// Amplify build env is not supplied to SSR by default. Only nonsecret references
// are written to runtime artifacts; approved credentials are fetched with the
// compute role. Complete local/server runtime env still takes precedence.
const resolver = createRuntimeSecretsResolver({ environment: process.env, fetchSecret: async name => {
  const { loadFromSecretsManager } = await import("./secrets-aws");
  return loadFromSecretsManager(name);
} });
export const getAppSecrets = resolver.getAppSecrets;
export const getOAuthRuntimeSettings = resolver.getOAuthRuntimeSettings;
