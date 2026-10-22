import "server-only";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

// This adapter is loaded only at runtime, never by a build command or client.
export async function loadFromSecretsManager(secretName: string): Promise<unknown> {
  const client = new SecretsManagerClient({});
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }), { abortSignal: AbortSignal.timeout(5000) });
  if (!response.SecretString) throw Error("APP_SECRET_UNAVAILABLE");
  return JSON.parse(response.SecretString) as unknown;
}
