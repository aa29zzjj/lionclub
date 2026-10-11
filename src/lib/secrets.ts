import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

type AppSecrets = {
  DATABASE_URL: string;
  AUTH_SECRET: string;
};

let cached: AppSecrets | undefined;
let pending: Promise<AppSecrets> | undefined;

async function loadFromSecretsManager(): Promise<AppSecrets> {
  const secretName = process.env.APP_SECRETS_NAME ?? "lionclub/app-secrets";
  const client = new SecretsManagerClient({});
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (!response.SecretString) {
    throw new Error(`Secret ${secretName} has no string value`);
  }
  return JSON.parse(response.SecretString) as AppSecrets;
}

// 本機開發用 .env 的 DATABASE_URL/AUTH_SECRET；正式環境因為 Amplify SSR
// 執行期讀不到主控台設定的環境變數/機密，改用運算角色在執行期向
// AWS Secrets Manager 取得，避免把密碼寫進建置產物。
export async function getAppSecrets(): Promise<AppSecrets> {
  if (process.env.DATABASE_URL && process.env.AUTH_SECRET) {
    return { DATABASE_URL: process.env.DATABASE_URL, AUTH_SECRET: process.env.AUTH_SECRET };
  }
  if (cached) return cached;
  if (!pending) {
    pending = loadFromSecretsManager().then((secrets) => {
      cached = secrets;
      return secrets;
    });
  }
  return pending;
}
