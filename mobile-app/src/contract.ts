import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export type Member = {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  title: string | null;
  bio: string | null;
  phone: string | null;
  photoUrl: string | null;
  memberNo: string | null;
  joinYear: number | null;
  joinMonth: number | null;
  birthday: string | null;
  status: string;
  organization: unknown;
  tags: unknown;
  adminRoles: unknown;
};

export type ApiErrorCode = "UNAUTHENTICATED" | "INVALID_CREDENTIALS" | "RATE_LIMITED" | "NETWORK_ERROR" | "UNKNOWN";
export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode, message: string, public readonly status?: number) {
    super(message);
  }
}

const ACCESS_TOKEN_KEY = "lionclubs.mobile.accessToken";
const REFRESH_TOKEN_KEY = "lionclubs.mobile.refreshToken";

/**
 * @capacitor/preferences is sandboxed app storage (UserDefaults on iOS,
 * SharedPreferences on Android) — NOT Keychain/Keystore-backed secure storage.
 * Acceptable for this first vertical-slice spike, but NATIVE_SPIKE_ACCEPTANCE_2026-10-17.md
 * (A06,冷啟動持久化) requires this to move to a Keychain/Keystore-backed plugin, with a real
 * device audit confirming the refresh token isn't readable via JS bridge or backup, before shipping.
 */
async function getToken(key: string) {
  return (await Preferences.get({ key })).value;
}
async function setToken(key: string, value: string) {
  await Preferences.set({ key, value });
}
async function clearTokens() {
  await Promise.all([Preferences.remove({ key: ACCESS_TOKEN_KEY }), Preferences.remove({ key: REFRESH_TOKEN_KEY })]);
}

export function createApiClient(baseUrl: string) {
  const origin = baseUrl.replace(/\/$/, "");

  async function request(path: string, init: { method: string; body?: unknown; accessToken?: string }) {
    try {
      return await CapacitorHttp.request({
        method: init.method,
        url: `${origin}${path}`,
        headers: {
          "Content-Type": "application/json",
          ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
        },
        data: init.body,
      });
    } catch {
      throw new ApiError("NETWORK_ERROR", "無法連線，請檢查網路");
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const response = await request("/api/mobile/auth/login", { method: "POST", body: { email, password } });
    if (response.status === 401) throw new ApiError("INVALID_CREDENTIALS", response.data?.error ?? "帳號或密碼錯誤", 401);
    if (response.status === 429) throw new ApiError("RATE_LIMITED", response.data?.error ?? "嘗試次數過多，請稍後再試", 429);
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `登入失敗（HTTP ${response.status}）`, response.status);
    await Promise.all([setToken(ACCESS_TOKEN_KEY, response.data.accessToken), setToken(REFRESH_TOKEN_KEY, response.data.refreshToken)]);
  }

  async function refresh(): Promise<boolean> {
    const refreshToken = await getToken(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;
    const response = await request("/api/mobile/auth/refresh", { method: "POST", body: { refreshToken } });
    if (response.status !== 200) {
      await clearTokens();
      return false;
    }
    await Promise.all([setToken(ACCESS_TOKEN_KEY, response.data.accessToken), setToken(REFRESH_TOKEN_KEY, response.data.refreshToken)]);
    return true;
  }

  async function me(): Promise<Member> {
    const accessToken = await getToken(ACCESS_TOKEN_KEY);
    if (!accessToken) throw new ApiError("UNAUTHENTICATED", "尚未登入");

    let response = await request("/api/mobile/me", { method: "GET", accessToken });
    if (response.status === 401) {
      const refreshed = await refresh();
      if (!refreshed) throw new ApiError("UNAUTHENTICATED", "登入已過期，請重新登入");
      const refreshedAccessToken = await getToken(ACCESS_TOKEN_KEY);
      response = await request("/api/mobile/me", { method: "GET", accessToken: refreshedAccessToken! });
    }
    if (response.status !== 200) throw new ApiError("UNKNOWN", response.data?.error ?? `讀取會員資料失敗（HTTP ${response.status}）`, response.status);
    return response.data as Member;
  }

  async function logout(): Promise<void> {
    const accessToken = await getToken(ACCESS_TOKEN_KEY);
    await clearTokens();
    if (accessToken) {
      // Best-effort only: stateless JWTs can't be revoked server-side per device.
      // Local tokens are already cleared above regardless of this call's outcome.
      try {
        await request("/api/mobile/auth/logout", { method: "POST", accessToken });
      } catch {
        /* ignore */
      }
    }
  }

  async function hasStoredSession(): Promise<boolean> {
    return (await getToken(REFRESH_TOKEN_KEY)) !== null;
  }

  return { login, me, logout, hasStoredSession };
}
