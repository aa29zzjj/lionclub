import assert from "node:assert/strict";
import { test } from "node:test";
import { AVATAR_MAX_BYTES, ProfileSaveCancelled, readProfileDraft, saveProfileDraft, validateAvatar, type ProfileDraft } from "../mobile-app/src/profile-draft";
import { readExperienceDraft, type ExperienceDraft } from "../mobile-app/src/experience-draft";
import type { MemberExperience } from "../mobile-app/src/contract";

const profile: ProfileDraft = { name: "合成測試會員", nickname: "", title: "既有職稱", email: "member@example.invalid", phone: "", birthday: "", bio: "原介紹", tags: ["既有自訂標籤"] };
const photo = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
function profileHarness() {
  const calls: string[] = [], patches: unknown[] = [];
  let current = true;
  const api = {
    async createAvatarUpload() { calls.push("presign"); return { uploadUrl: "https://uploads.example.invalid/signed", photoUrl: "https://images.example.invalid/avatar" }; },
    async updateProfile(patch: unknown) { calls.push("patch"); patches.push(patch); return { id: "synthetic-member", emailVerifiedAt: null }; },
  };
  return { calls, patches, api, isCurrent: () => current, leave: () => { current = false; }, upload: async () => { calls.push("upload"); } };
}

test("profile preserves existing text/tags and omits photoUrl when no replacement was selected", async () => {
  const h = profileHarness();
  const updated = await saveProfileDraft({ memberId: "synthetic-member", draft: profile, isCurrent: h.isCurrent, api: h.api, upload: h.upload });
  assert.deepEqual(h.calls, ["patch"]);
  assert.deepEqual(h.patches, [profile]);
  assert.equal(updated.emailVerifiedAt, null);
});
test("avatar is signed and uploaded before the new photoUrl is attached to this member's patch", async () => {
  const h = profileHarness();
  await saveProfileDraft({ memberId: "synthetic-member", draft: { ...profile, email: " new@example.invalid " }, avatar: photo(), isCurrent: h.isCurrent, api: h.api, upload: h.upload });
  assert.deepEqual(h.calls, ["presign", "upload", "patch"]);
  assert.deepEqual(h.patches, [{ ...profile, email: "new@example.invalid", photoUrl: "https://images.example.invalid/avatar" }]);
});
test("invalid email, impossible birthday and invalid avatar fail before any upload or profile mutation", async () => {
  for (const draft of [{ ...profile, email: "wrong" }, { ...profile, birthday: "2025-02-29" }, { ...profile, name: "   " }]) {
    const h = profileHarness();
    await assert.rejects(saveProfileDraft({ memberId: "synthetic-member", draft, avatar: photo(), isCurrent: h.isCurrent, api: h.api, upload: h.upload }));
    assert.deepEqual(h.calls, []);
  }
  assert.doesNotThrow(() => validateAvatar({ type: "image/webp", size: AVATAR_MAX_BYTES }));
  for (const file of [{ type: "image/svg+xml", size: 10 }, { type: "image/png", size: 0 }, { type: "image/jpeg", size: AVATAR_MAX_BYTES + 1 }]) assert.throws(() => validateAvatar(file));
  assert.equal(readProfileDraft(profile).tags[0], "既有自訂標籤");
});
test("leaving or switching account during avatar presign prevents upload and profile mutation", async () => {
  const h = profileHarness();
  const api = { ...h.api, async createAvatarUpload() { const result = await h.api.createAvatarUpload(); h.leave(); return result; } };
  await assert.rejects(saveProfileDraft({ memberId: "synthetic-member", draft: profile, avatar: photo(), isCurrent: h.isCurrent, api, upload: h.upload }), ProfileSaveCancelled);
  assert.deepEqual(h.calls, ["presign"]);
});
test("a finished or failed upload cannot attach its URL after the screen/account has changed", async () => {
  const h = profileHarness();
  await assert.rejects(saveProfileDraft({ memberId: "synthetic-member", draft: profile, avatar: photo(), isCurrent: h.isCurrent, api: h.api,
    upload: async () => { h.calls.push("upload"); h.leave(); } }), ProfileSaveCancelled);
  assert.deepEqual(h.calls, ["presign", "upload"]);
  const failed = profileHarness();
  await assert.rejects(saveProfileDraft({ memberId: "synthetic-member", draft: profile, avatar: photo(), isCurrent: failed.isCurrent, api: failed.api,
    upload: async () => { throw Error("synthetic upload failed"); } }), /synthetic upload failed/);
  assert.deepEqual(failed.calls, ["presign"]);
});
test("a profile response for another member is rejected instead of replacing the visible identity", async () => {
  const h = profileHarness();
  await assert.rejects(saveProfileDraft({ memberId: "synthetic-member", draft: profile, isCurrent: h.isCurrent,
    api: { ...h.api, updateProfile: async () => ({ id: "different-member" }) }, upload: h.upload }), /更新結果尚未確認/);
});

const initial: MemberExperience = { id: "synthetic-exp", kind: "position", level: "club", positionCode: "club_secretary", positionName: "秘書", organizationName: "合成分會", organizationIsUnlisted: false,
  multipleDistrictCode: "300", districtCode: "300A1", startYear: 2020, startMonth: null, endYear: 2022, datePrecision: "lions-year", isCurrent: true, verificationStatus: "under-review", visibility: "members", note: "原備註" };
const draft: ExperienceDraft = { kind: "position", level: "club", positionCode: "club_secretary", customPositionLabel: "", organizationName: "合成分會", multipleDistrictCode: "300", districtCode: "300A1", startYear: "2020", startMonth: "", endYear: "2022", isCurrent: true, visibility: "members", note: "原備註" };

test("editing a note preserves listed organization, district codes, precision and explicit end year even when current", () => {
  const result = readExperienceDraft({ ...draft, note: "補充來源" }, initial);
  assert.equal(result.organizationName, initial.organizationName);
  assert.equal(result.organizationIsUnlisted, false);
  assert.equal(result.multipleDistrictCode, "300"); assert.equal(result.districtCode, "300A1");
  assert.equal(result.datePrecision, "lions-year"); assert.equal(result.endYear, 2022);
});
test("blank membership organization is refused and a changed organization is not silently claimed as listed", () => {
  assert.throws(() => readExperienceDraft({ ...draft, kind: "membership", organizationName: "   " }, null), /實際分會／組織名稱/);
  assert.equal(readExperienceDraft({ ...draft, organizationName: "另一合成分會" }, initial).organizationIsUnlisted, true);
  assert.equal(readExperienceDraft(draft, { ...initial, organizationIsUnlisted: true }).organizationIsUnlisted, true);
});
test("clearing a known membership month sends explicit null and the corresponding approximate precision", () => {
  const membership = { ...initial, kind: "membership", positionCode: "membership_joined", startMonth: 5, datePrecision: "month" };
  const result = readExperienceDraft({ ...draft, kind: "membership", startMonth: "" }, membership);
  assert.equal(result.startMonth, null); assert.equal(result.datePrecision, "approximate");
  assert.equal(result.positionCode, "membership_joined"); assert.equal(result.endYear, undefined);
  const known = readExperienceDraft({ ...draft, kind: "membership", startMonth: "5" }, membership);
  assert.equal(known.startMonth, 5); assert.equal(known.datePrecision, "month");
});
test("experience rejects invalid calendar bounds, reversed terms, excessive text and mismatched position level", () => {
  for (const bad of [{ startYear: "2201" }, { startYear: "2020.5" }, { endYear: "2019" }, { organizationName: "長".repeat(161) }, { multipleDistrictCode: "x".repeat(21) }, { districtCode: "x".repeat(31) }, { note: "長".repeat(1001) }, { level: "district" as const }]) {
    assert.throws(() => readExperienceDraft({ ...draft, ...bad }, initial));
  }
  for (const startMonth of ["0", "13", "1.5"]) assert.throws(() => readExperienceDraft({ ...draft, kind: "membership", startMonth }, null), /月份/);
});
test("unchanged legacy custom position identifiers are preserved and not replaced by their display labels", () => {
  const other = { ...initial, kind: "other", positionCode: "special_role", positionName: "其他職務" };
  assert.equal(readExperienceDraft({ ...draft, kind: "other", customPositionLabel: "其他職務" }, other).positionCode, "special_role");
  const legacy = { ...initial, positionCode: "legacy_custom", positionName: "歷史職務", datePrecision: "approximate" };
  assert.equal(readExperienceDraft({ ...draft, positionCode: "legacy_custom" }, legacy).positionCode, "legacy_custom");
  assert.equal(readExperienceDraft({ ...draft, positionCode: "legacy_custom" }, legacy).datePrecision, "approximate");
  assert.throws(() => readExperienceDraft({ ...draft, positionCode: "legacy_custom" }, null), /職務/);
});
