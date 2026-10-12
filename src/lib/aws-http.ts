import { createHash, createHmac } from "crypto";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SignatureV4 } from "@smithy/signature-v4";

class NodeSha256 {
  private readonly hash;

  constructor(secret?: string | ArrayBuffer | ArrayBufferView) {
    const key = typeof secret === "string" ? secret : secret ? Buffer.from(secret as ArrayBuffer) : undefined;
    this.hash = key ? createHmac("sha256", key) : createHash("sha256");
  }

  update(data: Uint8Array) {
    this.hash.update(data);
  }

  async digest() {
    return this.hash.digest();
  }
}

function signer(service: string, region: string) {
  return new SignatureV4({ credentials: defaultProvider(), region, service, sha256: NodeSha256 });
}

function signedUrl(request: { protocol: string; hostname: string; path: string; query?: Record<string, string | undefined>; headers: Record<string, string> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query ?? {})) if (value !== undefined) query.set(key, value);
  return `${request.protocol}//${request.hostname}${request.path}${query.size ? `?${query.toString()}` : ""}`;
}

export async function createS3UploadUrl(input: {
  region: string;
  bucket: string;
  key: string;
  contentType: string;
}) {
  const hostname = `${input.bucket}.s3.${input.region}.amazonaws.com`;
  const path = `/${input.key.split("/").map(encodeURIComponent).join("/")}`;
  const request = {
    protocol: "https:",
    hostname,
    method: "PUT",
    path,
    headers: { host: hostname, "content-type": input.contentType },
  };
  const presigned = await signer("s3", input.region).presign(request, { expiresIn: 300 });
  return signedUrl({ ...request, query: presigned.query as Record<string, string | undefined> });
}

export async function sendSesEmail(input: {
  region: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const hostname = `email.${input.region}.amazonaws.com`;
  const body = JSON.stringify({
    FromEmailAddress: input.from,
    Destination: { ToAddresses: [input.to] },
    Content: { Simple: { Subject: { Data: input.subject, Charset: "UTF-8" }, Body: { Text: { Data: input.text, Charset: "UTF-8" } } } },
  });
  const request = {
    protocol: "https:",
    hostname,
    method: "POST",
    path: "/v2/email/outbound-emails",
    headers: { host: hostname, "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
    body,
  };
  const signed = await signer("ses", input.region).sign(request);
  const response = await fetch(signedUrl({ ...request, query: signed.query as Record<string, string | undefined> }), {
    method: "POST",
    headers: signed.headers,
    body,
  });
  if (!response.ok) throw new Error(`SES 寄送失敗 (${response.status})`);
}
