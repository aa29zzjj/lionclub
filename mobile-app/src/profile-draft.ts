import { z } from "zod";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const profileSchema = z.object({
  name: z.string().trim().min(1, "請填寫姓名"),
  nickname: z.union([z.string().trim().min(1).max(50), z.literal("")]),
  title: z.string(),
  email: z.string().trim().email("請填寫正確的 Email").max(254),
  phone: z.string(),
  birthday: z.union([z.string().date("請填寫正確的生日日期"), z.literal("")]),
  bio: z.string(),
  tags: z.array(z.string()),
});
export type ProfileDraft = z.input<typeof profileSchema>;
export type ProfilePatch = z.output<typeof profileSchema> & { photoUrl?: string };

export function readProfileDraft(draft: ProfileDraft): ProfilePatch {
  const result = profileSchema.safeParse(draft);
  if (!result.success) {
    const field = result.error.issues[0]?.path[0];
    if (field === "nickname") throw new Error("暱稱請留空，或填寫 50 字以內的內容");
    if (field === "birthday") throw new Error("生日須為有效日期，或留空");
    if (field === "email") throw new Error("請填寫 254 字以內的有效 Email");
    throw new Error(result.error.issues[0]?.message ?? "請確認個人資料格式");
  }
  return result.data;
}
export function validateAvatar(file: Pick<Blob, "type" | "size">): void {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type) || !Number.isSafeInteger(file.size)
    || file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    throw new Error("請選擇 5 MB 內的 JPG、PNG 或 WebP 圖片");
  }
}

export class ProfileSaveCancelled extends Error {
  constructor() { super("本人帳號或畫面已變更，未繼續更新個人資料"); }
}

/** Fence every upload phase against leaving this screen or switching account.
 * Never attach an already uploaded photo to whichever account happens to be
 * signed in later. The shared API client still enforces its own session epoch. */
export async function saveProfileDraft<T extends { id: string }>(input: {
  memberId: string;
  draft: ProfileDraft;
  avatar?: Blob | null;
  isCurrent: () => boolean;
  api: {
    createAvatarUpload: (contentType: string, size: number) => Promise<{ uploadUrl: string; photoUrl: string }>;
    updateProfile: (patch: ProfilePatch) => Promise<T>;
  };
  upload: (url: string, contentType: string, blob: Blob) => Promise<void>;
}): Promise<T> {
  const patch = readProfileDraft(input.draft);
  const current = () => { if (!input.isCurrent()) throw new ProfileSaveCancelled(); };
  if (input.avatar) validateAvatar(input.avatar);
  current();
  if (input.avatar) {
    const signed = await input.api.createAvatarUpload(input.avatar.type, input.avatar.size);
    current();
    await input.upload(signed.uploadUrl, input.avatar.type, input.avatar);
    current();
    patch.photoUrl = signed.photoUrl;
  }
  current();
  const updated = await input.api.updateProfile(patch);
  current();
  if (updated.id !== input.memberId) throw new Error("更新結果尚未確認，請重新載入本人資料");
  return updated;
}
