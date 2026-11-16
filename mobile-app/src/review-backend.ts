export const isolatedReviewerEmail = "reviewer@lionclubs-review.example.test";

export function isIsolatedReviewer(email: string) {
  return email.trim().toLowerCase() === isolatedReviewerEmail;
}

export function isolatedReviewToken(token: string) {
  try {
    const segments = token.split(".");
    if (segments.length !== 3) return false;
    const payload: unknown = JSON.parse(atob(segments[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload || typeof payload !== "object" || !("email" in payload) || typeof payload.email !== "string") return false;
    return isIsolatedReviewer(payload.email);
  } catch {
    return false;
  }
}

export function selectBackend(primary: string, review: string, request: { email?: string; token?: string | null }) {
  const isolated = request.email !== undefined ? isIsolatedReviewer(request.email) : Boolean(request.token && isolatedReviewToken(request.token));
  if (!isolated) return primary;
  if (!review) throw new Error("ISOLATED_REVIEW_BACKEND_UNCONFIGURED");
  return review;
}

export function tokenPairMatchesBackend(pair: { accessToken: string; refreshToken: string }, isolated: boolean) {
  return isolatedReviewToken(pair.accessToken) === isolated && isolatedReviewToken(pair.refreshToken) === isolated;
}
