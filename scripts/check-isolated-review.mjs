import { pathToFileURL } from "node:url";

const reviewerEmail = "reviewer@lionclubs-review.example.test";
const productionHost = "lionclubsmembership.com";

export function reviewHttpsOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || [productionHost, `www.${productionHost}`].includes(url.hostname.replace(/\.$/, ""))) throw Error("INVALID_REVIEW_ORIGIN");
  return url.origin;
}

export async function checkIsolatedReview(origin, password, fetcher = fetch) {
  origin = reviewHttpsOrigin(origin);
  if (typeof password !== "string" || Buffer.byteLength(password) < 16 || Buffer.byteLength(password) > 72) throw Error("INVALID_REVIEW_PASSWORD");
  async function request(step, path, { body, token, memberId, expected = 200 } = {}) {
    let response;
    try {
      response = await fetcher(new URL(path, origin), {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(memberId ? { "x-lionclubs-member": memberId } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      });
    } catch { throw Error(`${step}_CONNECTION_FAILED`); }
    if (response.status !== expected) throw Error(`${step}_HTTP_${response.status}`);
    if (expected !== 200) return null;
    try { return await response.json(); } catch { throw Error(`${step}_INVALID_JSON`); }
  }

  await request("UNAUTHENTICATED", "/api/mobile/next-phase?view=meetups", { expected: 401 });
  const login = await request("LOGIN", "/api/mobile/auth/login", { body: { email: reviewerEmail, password } });
  const { memberId } = login ?? {};
  if (typeof memberId !== "string" || !memberId || typeof login.accessToken !== "string" || !login.accessToken
    || typeof login.refreshToken !== "string" || !login.refreshToken) throw Error("LOGIN_INVALID_SESSION");
  const refreshed = await request("REFRESH", "/api/mobile/auth/refresh", { body: { refreshToken: login.refreshToken } });
  if (!refreshed?.accessToken || typeof refreshed.accessToken !== "string" || typeof refreshed.refreshToken !== "string") throw Error("REFRESH_INVALID_SESSION");
  const context = { token: refreshed.accessToken, memberId };
  const meetups = await request("MEETUPS", "/api/mobile/next-phase?view=meetups", context);
  const example = Array.isArray(meetups?.meetups) && meetups.meetups.find(item => item.title === "志工交流晚餐" && item.isHost === false && typeof item.id === "string");
  if (meetups?.organizationName !== "LionClubs 審查示範分會" || !example) throw Error("MEETUPS_REVIEW_FIXTURE_MISSING");
  const query = new URLSearchParams({ view: "meetup", id: example.id });
  const detail = await request("MEETUP_DETAIL", `/api/mobile/next-phase?${query}`, context);
  if (detail?.id !== example.id) throw Error("MEETUP_DETAIL_INVALID");
  const card = await request("BUSINESS_CARD", "/api/mobile/next-phase?view=card", context);
  if (!card || !Object.hasOwn(card, "card")) throw Error("BUSINESS_CARD_INVALID");
  const notices = await request("NOTICES", "/api/mobile/next-phase?view=notices", context);
  if (!Array.isArray(notices?.items)) throw Error("NOTICES_INVALID");
  const resources = await request("RESOURCES", "/api/mobile/services", context);
  if (!Array.isArray(resources?.needs) || !resources.needs.some(need => need.title === "公益講座保險協助")) throw Error("RESOURCES_REVIEW_FIXTURE_MISSING");
  return { origin, verified: ["anonymous access denied", "review login", "token refresh", "meetups", "meetup detail", "business card", "notifications", "resource matching"] };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await checkIsolatedReview(process.env.MOBILE_APP_REVIEW_API_ORIGIN, process.env.LIONCLUBS_REVIEW_PASSWORD)));
  } catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "REVIEW_CHECK_CONFIGURATION_INVALID";
    console.error(code);
    process.exitCode = 1;
  }
}
