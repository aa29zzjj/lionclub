const FRIEND_QR_PREFIX = "lionclub:member:";

export function createFriendQrPayload(memberId: string) {
  return `${FRIEND_QR_PREFIX}${encodeURIComponent(memberId)}`;
}

export function parseFriendQrPayload(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  if (value.startsWith(FRIEND_QR_PREFIX)) {
    const encodedMemberId = value.slice(FRIEND_QR_PREFIX.length);
    try {
      return decodeURIComponent(encodedMemberId) || null;
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(value) as { type?: unknown; memberId?: unknown };
    if (parsed.type === "lionclub-member" && typeof parsed.memberId === "string") {
      return parsed.memberId.trim() || null;
    }
  } catch {
    // 不是 JSON，繼續嘗試 URL 或舊版純會員 id。
  }

  try {
    const url = new URL(value);
    const memberId = url.searchParams.get("memberId");
    if (memberId) return memberId;
  } catch {
    // 不是 URL，繼續檢查舊版純會員 id。
  }

  // 向下相容交接版本：QR 內容直接放 Prisma cuid 會員 id。
  if (/^[A-Za-z0-9_-]{8,128}$/.test(value)) return value;

  return null;
}
