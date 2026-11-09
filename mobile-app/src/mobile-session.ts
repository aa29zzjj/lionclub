/** Pure coordinator for the app-wide token pair. Storage is injected; this
 * module never accesses native storage, sends requests or logs token values. */
export const MOBILE_ACCESS_TOKEN_KEY = "lionclubs.mobile.accessToken";
export const MOBILE_REFRESH_TOKEN_KEY = "lionclubs.mobile.refreshToken";
export type MobileTokenPair = { accessToken: string; refreshToken: string };
export type MobileTokenStorage = {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export class MobileSessionChangedError extends Error {
  constructor() { super("MOBILE_SESSION_CHANGED"); }
}
const storedToken = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
export function mobileTokenPair(value: unknown): MobileTokenPair {
  const pair = value as Partial<MobileTokenPair> | null;
  if (!pair || Array.isArray(pair) || ![pair.accessToken, pair.refreshToken].every(token =>
    typeof token === "string" && token.length > 0 && token.length <= 16384 && !/[\s\u0000-\u001f\u007f]/.test(token))) {
    throw new Error("MOBILE_TOKEN_RESPONSE_INVALID");
  }
  return { accessToken: pair.accessToken!, refreshToken: pair.refreshToken! };
}

export function createMobileSessionCoordinator(storage: MobileTokenStorage, changedError: () => Error = () => new MobileSessionChangedError()) {
  let epoch = 0;
  let queue: Promise<void> = Promise.resolve();
  let refreshFlight: { epoch: number; promise: Promise<boolean> } | undefined;
  const capture = () => epoch;
  const isCurrent = (expected: number) => expected === epoch;
  const assertCurrent = (expected: number) => { if (!isCurrent(expected)) throw changedError(); };
  function beginChange(expected?: number) {
    if (expected !== undefined) assertCurrent(expected);
    epoch++; refreshFlight = undefined; return epoch;
  }
  function exclusive<T>(expected: number, work: (check: () => void) => Promise<T>): Promise<T> {
    const result = queue.catch(() => {}).then(async () => {
      const check = () => assertCurrent(expected);
      check(); const value = await work(check); check(); return value;
    });
    // Both successful and failed native operations must settle before another
    // account touches either key. Never release this queue via Promise.all's
    // early rejection while a sibling native write/remove is still running.
    queue = result.then(() => {}, () => {});
    return result;
  }
  async function snapshot(expected: number) {
    return exclusive(expected, async check => {
      const accessToken = storedToken(await storage.getItem(MOBILE_ACCESS_TOKEN_KEY)); check();
      const refreshToken = storedToken(await storage.getItem(MOBILE_REFRESH_TOKEN_KEY)); check();
      return { accessToken, refreshToken };
    });
  }
  async function writePair(expected: number, value: unknown) {
    assertCurrent(expected); const pair = mobileTokenPair(value);
    await exclusive(expected, async check => {
      try {
        await storage.setItem(MOBILE_ACCESS_TOKEN_KEY, pair.accessToken); check();
        await storage.setItem(MOBILE_REFRESH_TOKEN_KEY, pair.refreshToken); check();
      } catch (error) {
        // Do not leave a half-written pair as a successful login/rotation.
        // A newer login/logout already owns a queued clear, so an old epoch
        // must not schedule a late cleanup against its replacement's tokens.
        if (isCurrent(expected)) {
          try { await storage.removeItem(MOBILE_ACCESS_TOKEN_KEY); } catch {}
          if (isCurrent(expected)) try { await storage.removeItem(MOBILE_REFRESH_TOKEN_KEY); } catch {}
        }
        throw error;
      }
    });
  }
  async function clear(expected: number) {
    return exclusive(expected, async check => {
      const previousAccessToken = storedToken(await storage.getItem(MOBILE_ACCESS_TOKEN_KEY)); check();
      await storage.removeItem(MOBILE_ACCESS_TOKEN_KEY); check();
      await storage.removeItem(MOBILE_REFRESH_TOKEN_KEY); check();
      return previousAccessToken;
    });
  }
  function refreshOnce(expected: number, work: () => Promise<boolean>) {
    assertCurrent(expected);
    if (refreshFlight?.epoch === expected) return refreshFlight.promise;
    const promise = work().finally(() => { if (refreshFlight?.promise === promise) refreshFlight = undefined; });
    refreshFlight = { epoch: expected, promise }; return promise;
  }
  return { capture, isCurrent, assertCurrent, beginChange, snapshot, writePair, clear, refreshOnce };
}
