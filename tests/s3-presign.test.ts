import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import * as realS3 from "@aws-sdk/client-s3";

test("real image presigner never signs an empty-body CRC32 for a later non-empty upload", async () => {
  let networkCalls = 0;
  // Exercise the real production function and installed signer. Only supply
  // synthetic credentials and a transport that fails if any network is tried.
  const compiled = await build({ absWorkingDir: fileURLToPath(new URL("../", import.meta.url)), entryPoints: ["src/lib/aws-http.ts"],
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "synthetic-s3-credentials", setup(builder) {
      builder.onResolve({ filter: /^@aws-sdk\/client-s3$/ }, () => ({ path: "s3", namespace: "test-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "test-stub" }, () => ({ contents: `const h=globalThis.__s3;
        export class S3Client extends h.sdk.S3Client {constructor(options){super({...options,credentials:{accessKeyId:'SYNTHETIC',secretAccessKey:'synthetic-not-a-real-key'},requestHandler:{handle:h.noNetwork}})}}
        export const PutObjectCommand=h.sdk.PutObjectCommand;`, loader: "js" }));
    } }] });
  const context = { module: { exports: {} as any }, exports: {}, require: createRequire(import.meta.url),
    __s3: { sdk: realS3, noNetwork: async () => { networkCalls++; throw Error("Network forbidden in presign test"); } } };
  runInNewContext(compiled.outputFiles[0].text, context);
  const value = await context.module.exports.createS3UploadUrl({ region: "us-east-2", bucket: "synthetic-lionclubs",
    key: "avatars/synthetic-member/00000000-0000-0000-0000-000000000001.png", contentType: "image/png" });
  const url = new URL(value);
  assert.equal(url.searchParams.has("x-amz-checksum-crc32"), false);
  assert.equal(url.searchParams.has("x-amz-sdk-checksum-algorithm"), false);
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  assert.match(url.searchParams.get("X-Amz-Signature")!, /^[a-f0-9]{64}$/);
  assert.equal(networkCalls, 0);
});
