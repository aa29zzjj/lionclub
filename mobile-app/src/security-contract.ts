import type { BlockedMember } from "./contract";
import { mobileTokenPair } from "./mobile-session";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown) => value == null || text(value);
export const mobileActionAcknowledged = (value: unknown) => record(value) && value.ok === true;

/** A failed or malformed read is not an empty block list. Project only the
 * documented fields, before anything can reach React's .map/render path. */
export function readBlockedMembersResponse(value: unknown): BlockedMember[] {
  if (!record(value) || !Array.isArray(value.blocks)) throw Error("BLOCKS_RESPONSE_INVALID");
  return value.blocks.map(row => {
    if (!record(row) || !record(row.member) || !text(row.member.id) || !row.member.id || !text(row.member.name)
      || !nullableText(row.member.nickname) || !nullableText(row.member.photoUrl)
      || !text(row.createdAt) || !Number.isFinite(Date.parse(row.createdAt))) throw Error("BLOCKS_RESPONSE_INVALID");
    return { createdAt: row.createdAt, member: { id: row.member.id, name: row.member.name,
      nickname: row.member.nickname ?? null, photoUrl: row.member.photoUrl ?? null } };
  });
}

export function readSessionRevocationResponse(value: unknown) {
  if (!record(value) || value.ok !== true || typeof value.currentSessionRetained !== "boolean") throw Error("REVOCATION_RESPONSE_INVALID");
  if (value.currentSessionRetained) {
    return { currentSessionRetained: true as const, pair: mobileTokenPair(value), message: "其他裝置已登出，此裝置繼續使用" };
  }
  if (value.accessToken != null || value.refreshToken != null) throw Error("REVOCATION_RESPONSE_INVALID");
  return { currentSessionRetained: false as const, pair: null, message: "其他裝置已登出；此裝置登入未保留，請重新登入" };
}
