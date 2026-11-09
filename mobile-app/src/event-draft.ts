import { z } from "zod";
import { taipeiEventStartAt } from "../../src/lib/event-calendar";
import type { CreateEventInput, EventCard } from "./contract";

export const EVENT_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const EVENT_CAPACITY_MAX = 2_147_483_647; // Prisma/PostgreSQL Int, not JS infinity.
const SCOPES = ["CLUB", "ZONE", "REGION", "DISTRICT"] as const;
export type OfficialEventScope = typeof SCOPES[number];
export type EventPublicationOption = { scope: OfficialEventScope; hostOrganizationId: string; hostOrganizationName: string };
export const eventPublicationLabels: Record<OfficialEventScope, string> = { CLUB: "本分會", ZONE: "分區", REGION: "專區", DISTRICT: "整個區" };
export type EventDraft = {
  title: string; date: string; time: string; location: string; capacity: string; description: string;
  category: "PERSONAL" | "CLUB_OFFICIAL"; publicationKey: string;
};
export type EventCover = { webPath: string; blob: Blob; contentType: string };
export class EventDraftError extends Error {}
export class EventPublishCancelled extends Error {
  constructor() { super("畫面或登入已更新，停止後續發布；已送出的要求不會自動撤回。"); }
}
export class EventPublicationUnknown extends Error {
  constructor() { super("發布結果尚未確認，請先返回活動列表核對，不要直接再次發布。"); }
}
const singleLine = (max: number) => z.string().trim().min(1).max(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const identifier = z.string().min(1).max(200).refine(value => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value));
const hostSchema = z.object({ scope: z.enum(SCOPES), hostOrganizationId: identifier, hostOrganizationName: singleLine(200) });
export function eventPublicationKey(option: Pick<EventPublicationOption, "scope" | "hostOrganizationId">): string {
  return JSON.stringify([option.scope, option.hostOrganizationId]);
}
/** Only pairs actually returned by the API can appear in the official selector.
 * A member title, an allowed scope alone or the home organization grants nothing. */
export function readEventPublishingOptions(value: unknown): EventPublicationOption[] {
  const parsed = z.object({ allowedScopes: z.array(z.enum(SCOPES)).max(64), officialHosts: z.array(hostSchema).max(64) }).safeParse(value);
  if (!parsed.success || parsed.data.officialHosts.some(option => !parsed.data.allowedScopes.includes(option.scope))) {
    throw new EventDraftError("活動發布權限資料尚未確認，請重新讀取。");
  }
  return [...new Map(parsed.data.officialHosts.map(option => [eventPublicationKey(option), option])).values()];
}

const eventCardSchema = z.object({
  id: identifier, title: singleLine(160), location: z.string().max(240), hostChapter: singleLine(200),
  startAt: z.string().datetime({ offset: true }), category: z.enum(["PERSONAL", "CLUB_OFFICIAL"]), scope: z.enum(SCOPES),
  description: z.string().max(3000).optional(), coverPhotoUrl: z.string().max(8192).optional(),
  capacity: z.number().int().positive().max(EVENT_CAPACITY_MAX).optional(), registeredCount: z.number().int().nonnegative(),
  isRegistered: z.boolean(), isFull: z.boolean(),
});
export function readEventCards(value: unknown): EventCard[] {
  const parsed = z.array(eventCardSchema).safeParse(value);
  if (!parsed.success || new Set(parsed.data.map(event => event.id)).size !== parsed.data.length) {
    throw new EventDraftError("活動資料尚未完整讀取，不能視為沒有活動；請重新載入。");
  }
  return parsed.data;
}

export function readEventDraft(draft: EventDraft, options: readonly EventPublicationOption[]): CreateEventInput {
  const fields = z.object({ title: singleLine(160), location: singleLine(240), description: z.string().trim().max(3000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)), category: z.enum(["PERSONAL", "CLUB_OFFICIAL"]) }).safeParse(draft);
  if (!fields.success) {
    const field = fields.error.issues[0]?.path[0];
    throw new EventDraftError(field === "title" ? "活動名稱須為 1 至 160 字的有效文字" : field === "location" ? "地點須為 1 至 240 字的有效文字" : field === "description" ? "活動說明最多 3000 字，且不可含無效控制字元" : "請確認活動類型");
  }
  const startAt = taipeiEventStartAt(draft.date, draft.time);
  if (!startAt) throw new EventDraftError("請填寫實際存在的日期與正確時間（台灣時間）");
  const rawCapacity = draft.capacity.trim();
  const capacity = rawCapacity ? Number(rawCapacity) : undefined;
  if (capacity !== undefined && (!/^\d+$/.test(rawCapacity) || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > EVENT_CAPACITY_MAX)) {
    throw new EventDraftError("名額須為 1 至 2147483647 的整數，或留空不限制");
  }
  const body: CreateEventInput = { ...fields.data, startAt, capacity, description: fields.data.description || undefined };
  if (fields.data.category === "CLUB_OFFICIAL") {
    const option = options.find(item => eventPublicationKey(item) === draft.publicationKey);
    if (!option || !hostSchema.safeParse(option).success) throw new EventDraftError("請選擇 API 已授權的官方發布層級與主辦單位");
    body.scope = option.scope; body.hostOrganizationId = option.hostOrganizationId;
  }
  return body;
}

export function validateEventCover(file: Pick<Blob, "type" | "size">): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > EVENT_COVER_MAX_BYTES) {
    throw new EventDraftError("封面須為 5 MB 內的 JPG、PNG 或 WebP 圖片");
  }
}
async function validateCoverSignature(blob: Blob) {
  validateEventCover(blob);
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const matches = blob.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : blob.type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
      : bytes.length >= 12 && [82, 73, 70, 70].every((value, index) => bytes[index] === value) && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value);
  if (!matches) throw new EventDraftError("照片內容與格式不符，請重新選擇圖片");
}
export function isEventCameraCancellation(error: unknown): boolean {
  const value = error as { message?: unknown; code?: unknown } | null;
  return Boolean(value && (value.message === "User cancelled photos app" || value.message === "User canceled photos app"
    || value.code === "USER_CANCELLED" || value.code === "USER_CANCELED"));
}
export async function readEventCameraPhoto(input: {
  photo: { webPath?: string }; pageHref: string; isCurrent: () => boolean;
  fetcher: typeof fetch;
}): Promise<EventCover> {
  const check = () => { if (!input.isCurrent()) throw new EventPublishCancelled(); };
  check();
  const path = input.photo.webPath;
  if (typeof path !== "string" || !path || path.length > 8 * 1024 * 1024) throw new EventDraftError("相機未回傳可讀取的照片，請重新拍攝");
  let page: URL, url: URL;
  try { page = new URL(input.pageHref); url = new URL(path, page); }
  catch { throw new EventDraftError("照片來源無法讀取，請重新拍攝"); }
  if (url.username || url.password || url.hash) throw new EventDraftError("照片來源不符本機讀取範圍，未讀取外部網址");
  const localFile = url.protocol === page.protocol && url.host === page.host && /^\/_capacitor_(?:file|content)_\//.test(url.pathname);
  const localBlob = url.protocol === "blob:";
  const inlineImage = /^data:image\/(?:jpeg|png|webp);base64,/i.test(path);
  if (!localFile && !localBlob && !inlineImage) throw new EventDraftError("照片來源不符本機讀取範圍，未讀取外部網址");
  const response = await input.fetcher(url.href, { credentials: "omit", cache: "no-store", redirect: "error" });
  check();
  if (!response.ok || Number(response.headers.get("content-length") ?? 0) > EVENT_COVER_MAX_BYTES) throw new EventDraftError("無法讀取這張照片，或照片超過 5 MB，請重新選擇");
  const blob = await response.blob(); check(); await validateCoverSignature(blob); check();
  return { webPath: url.href, blob, contentType: blob.type };
}

function knownRejection(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}
export async function publishEventDraft(input: {
  draft: EventDraft; options: readonly EventPublicationOption[]; cover?: EventCover | null; isCurrent: () => boolean;
  api: {
    createEventCoverUpload(type: string, size: number): Promise<{ uploadUrl: string; coverPhotoUrl: string }>;
    createEvent(body: CreateEventInput): Promise<{ eventId: string }>;
  };
  upload(url: string, type: string, blob: Blob): Promise<void>;
}): Promise<{ eventId: string }> {
  const body = readEventDraft(input.draft, input.options);
  const check = () => { if (!input.isCurrent()) throw new EventPublishCancelled(); };
  check();
  if (input.cover) {
    if (input.cover.contentType !== input.cover.blob.type) throw new EventDraftError("照片格式已變更，請重新選擇");
    await validateCoverSignature(input.cover.blob); check();
    const signed = await input.api.createEventCoverUpload(input.cover.contentType, input.cover.blob.size); check();
    try {
      for (const value of [signed.uploadUrl, signed.coverPhotoUrl]) {
        if (typeof value !== "string" || value.length > 8192 || value !== value.trim()) throw Error();
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) throw Error();
      }
    } catch { throw new EventDraftError("封面上傳回覆不完整，未繼續發布"); }
    await input.upload(signed.uploadUrl, input.cover.contentType, input.cover.blob); check();
    body.coverPhotoUrl = signed.coverPhotoUrl;
  }
  check();
  try {
    const result = await input.api.createEvent(body); check();
    if (!result || !identifier.safeParse(result.eventId).success
      || ((result as { ok?: unknown }).ok !== undefined && (result as { ok?: unknown }).ok !== true)) throw new EventPublicationUnknown();
    return result;
  } catch (failure) {
    if (!input.isCurrent() || failure instanceof EventPublishCancelled) throw new EventPublishCancelled();
    if (knownRejection(failure)) throw failure;
    throw new EventPublicationUnknown();
  }
}

/** Synchronous lock: React state alone is too late to stop two same-turn taps. */
export function createEventSubmissionLock() {
  let busy = false;
  return {
    isBusy: () => busy,
    async run<T>(work: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try { return await work(); } finally { busy = false; }
    },
  };
}
