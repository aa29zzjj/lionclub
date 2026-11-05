import { connect, type ClientHttp2Session } from "node:http2";
import type { KeyObject } from "node:crypto";
import { SignJWT } from "jose";
import { MOBILE_PUSH_TOPIC } from "./mobile-push-config";
import { mobilePushPayload, type MobilePushTransport, type MobilePushTransportResult } from "./mobile-push-delivery";

export function classifyApnsResponse(status: number, reason?: string): MobilePushTransportResult {
  if (status === 200) return { kind: "accepted" }; // Accepted by APNs, not proof of device delivery.
  if (status === 410 && reason === "Unregistered" || status === 400 && ["BadDeviceToken", "DeviceTokenNotForTopic"].includes(reason ?? "")) return { kind: "invalid-token" };
  if (status === 429) return { kind: "retryable", reason: "rate-limited" };
  if (status === 500 || status === 503) return { kind: "retryable", reason: "unavailable" };
  return { kind: "rejected" };
}

/** Server-only direct APNs transport. Factory construction does not connect.
 * Keep one factory alive across batches to reuse its connection/JWT. */
export function createApnsProvider(options: { teamId: string; keyId: string; key: KeyObject; now?: () => number }) {
  if (!/^[A-Z0-9]{10}$/.test(options.teamId) || !/^[A-Z0-9]{10}$/.test(options.keyId)
    || options.key.type !== "private" || options.key.asymmetricKeyType !== "ec"
    || options.key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw Error("APNS_CREDENTIAL_CONFIGURATION_INVALID");
  const clock = options.now ?? Date.now;
  let cachedJwt: string | undefined, validUntil = 0, signing: Promise<string> | undefined;
  const sessions = new Map<string, ClientHttp2Session>();
  async function jwt() {
    if (cachedJwt && validUntil > clock()) return cachedJwt;
    if (!signing) signing = new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: options.keyId })
      .setIssuer(options.teamId).setIssuedAt(Math.floor(clock() / 1000)).sign(options.key).then(value => {
        cachedJwt = value; validUntil = clock() + 50 * 60_000; return value;
      }).finally(() => { signing = undefined; });
    return signing;
  }
  const send: MobilePushTransport = async input => {
    if (!["sandbox", "production"].includes(input.environment) || input.topic !== MOBILE_PUSH_TOPIC
      || !/^(?:[a-fA-F0-9]{2}){16,256}$/.test(input.token) || !/^[a-fA-F0-9-]{36}$/.test(input.apnsId)
      || !/^[a-f0-9]{64}$/.test(input.collapseId) || !Number.isSafeInteger(input.expiration)
      || input.expiration <= Math.floor(clock() / 1000) || input.payload.data.version !== 1) throw Error("APNS_REQUEST_INVALID");
    // Discard caller-supplied text/extra fields; lock-screen content is canonical.
    const body = Buffer.from(JSON.stringify(mobilePushPayload(input.payload.data.kind)));
    if (body.length > 4096) throw Error("APNS_PAYLOAD_INVALID");
    const authorization = await jwt();
    const endpoint = input.environment === "production" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
    let session = sessions.get(endpoint);
    if (!session || session.closed || session.destroyed) {
      session = connect(endpoint, { rejectUnauthorized: true });
      session.on("error", () => {}); // Errors become a generic uncertain transport outcome below.
      sessions.set(endpoint, session);
    }
    return new Promise<MobilePushTransportResult>((resolve, reject) => {
      let settled = false, status = 0, text = "";
      const stream = session!.request({ ":method": "POST", ":path": `/3/device/${input.token.toLowerCase()}`,
        authorization: `bearer ${authorization}`, "content-type": "application/json", "apns-topic": MOBILE_PUSH_TOPIC,
        "apns-push-type": "alert", "apns-priority": "10", "apns-id": input.apnsId,
        "apns-collapse-id": input.collapseId, "apns-expiration": String(input.expiration) });
      const unknown = () => {
        if (settled) return; settled = true; stream.close();
        // A lost response can follow successful acceptance. Never invent a safe retry.
        reject(Error("APNS_OUTCOME_UNKNOWN"));
      };
      stream.setEncoding("utf8"); stream.setTimeout(15_000, unknown);
      stream.on("response", headers => { status = Number(headers[":status"] ?? 0); });
      stream.on("data", chunk => { text += String(chunk); if (Buffer.byteLength(text) > 8192) unknown(); });
      stream.on("error", unknown);
      stream.on("end", () => {
        if (settled) return; settled = true;
        let reason: string | undefined;
        try { const data = JSON.parse(text); if (typeof data?.reason === "string") reason = data.reason; } catch {}
        resolve(classifyApnsResponse(status, reason));
      });
      stream.on("close", () => { if (!settled) unknown(); });
      stream.end(body);
    });
  };
  return { send, close() { for (const session of sessions.values()) session.close(); sessions.clear(); cachedJwt = undefined; } };
}
