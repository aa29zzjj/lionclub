#!/usr/bin/env node
// Read-only file/config/tool inventory. Presence does not prove runtime or policy compliance.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/check-app-store-readiness.mjs [--strict]");
  console.log("Read-only inventory. Default reports gaps and exits 0; --strict exits 1 if gaps exist.");
  process.exit(0);
}
if (args.some((arg) => arg !== "--strict")) {
  console.error("Unknown argument. Use --help for usage.");
  process.exit(2);
}

const results = [];
function record(ok, label, detail = "") {
  results.push({ ok, label, detail });
}
function hasFile(relativePath) {
  try {
    return statSync(resolve(root, relativePath)).isFile();
  } catch {
    return false;
  }
}
function checkAnyFile(label, paths) {
  const found = paths.find(hasFile);
  record(Boolean(found), label, found || `missing: ${paths.join(" OR ")}`);
}
function readField(object, key) {
  return key.split(".").reduce((value, part) => value?.[part], object);
}
function checkText(object, key) {
  const value = readField(object, key);
  record(typeof value === "string" && value.trim().length > 0, key, value == null ? "未提供" : typeof value);
}
function checkConfirmed(object, key) {
  record(readField(object, key) === true, key, "需實際確認／驗收，不能僅以檔案存在取代");
}
function checkAsset(object, key, multiple = false) {
  const value = readField(object, key);
  const paths = multiple ? (Array.isArray(value) ? value : []) : [value];
  const valid = paths.length > 0 && paths.every((path) => typeof path === "string" && path.trim() && existsSync(isAbsolute(path) ? path : resolve(root, path)));
  record(valid, key, valid ? "檔案存在；尺寸／內容尚需人工驗收" : "未提供可找到的素材路徑");
}

for (const path of [
  "docs/app-store/README.md",
  "docs/app-store/NATIVE_ARCHITECTURE.md",
  "docs/app-store/PRIVACY_AND_ACCOUNT_API_DRAFT.md",
  "docs/app-store/METADATA.zh-Hant.json",
]) record(hasFile(path), path);

let metadata;
try {
  metadata = JSON.parse(readFileSync(resolve(root, "docs/app-store/METADATA.zh-Hant.json"), "utf8"));
  record(true, "metadata JSON 語法");
} catch (error) {
  record(false, "metadata JSON 語法", error instanceof Error ? error.message : String(error));
}

if (metadata) {
  record(metadata.status === "ready", "metadata status", `${metadata.status ?? "未提供"}；完成準備與驗收後才設 ready`);
  for (const key of [
    "app.name", "app.bundleId", "app.androidApplicationId", "app.appleTeamId", "app.legalEntityName", "app.copyright",
    "contacts.supportEmail", "contacts.privacyEmail", "contacts.reviewContactName", "contacts.reviewContactEmail", "contacts.reviewContactPhone",
    "urls.support", "urls.privacyPolicy", "urls.accountDeletion",
    "listing.subtitle", "listing.description", "listing.keywords", "listing.googlePlayShortDescription",
    "release.version", "release.buildNumber", "release.nativeArchitecture", "release.googlePlayAccountType", "review.sampleQrPath",
  ]) checkText(metadata, key);
  for (const key of [
    "app.nameConfirmed", "app.brandAuthorizationConfirmed", "listing.categoryConfirmed",
    "release.appleDeveloperEnrollmentConfirmed", "release.appStoreConnectAppCreated", "release.signingConfigured", "release.physicalDeviceVerificationComplete",
    "review.demoAccountConfigured", "review.privacyLabelsReviewed", "review.dataSafetyReviewed", "review.accountDeletionImplemented", "review.ugcModerationImplemented",
  ]) checkConfirmed(metadata, key);
  record(readField(metadata, "listing.ageRating") != null, "listing.ageRating", "需依商店問卷確認");
  const territories = readField(metadata, "listing.territories");
  record(Array.isArray(territories) && territories.length > 0, "listing.territories", "需確認發行國家／地區");
  record(readField(metadata, "listing.price") != null, "listing.price", "需確認定價");
  for (const key of ["assets.appIcon1024", "assets.googlePlayIcon512", "assets.googlePlayFeatureGraphic"]) checkAsset(metadata, key);
  for (const key of ["assets.iphoneScreenshots", "assets.androidScreenshots"]) checkAsset(metadata, key, true);
}

checkAnyFile("公開隱私政策實作", ["src/app/privacy/page.tsx", "src/app/privacy-policy/page.tsx"]);
checkAnyFile("公開客服頁實作", ["src/app/support/page.tsx"]);
checkAnyFile("外部帳號刪除頁實作", ["src/app/account/delete/page.tsx"]);
checkAnyFile("帳號刪除 API 實作", ["src/app/api/me/account-deletion/route.ts"]);
checkAnyFile("內容檢舉 API 實作", ["src/app/api/reports/route.ts", "src/app/api/members/[memberId]/report/route.ts"]);
checkAnyFile("專用會員封鎖 API 實作", ["src/app/api/members/[id]/block/route.ts", "src/app/api/members/[memberId]/block/route.ts"]);
checkAnyFile("iOS 原生工程", ["ios/App/App.xcodeproj/project.pbxproj", "native/ios/App/App.xcodeproj/project.pbxproj", "mobile/ios/App/App.xcodeproj/project.pbxproj"]);
checkAnyFile("Android 原生工程", ["android/app/build.gradle", "android/app/build.gradle.kts", "native/android/app/build.gradle", "mobile/android/app/build.gradle"]);

if (process.platform === "darwin") {
  const xcode = spawnSync("xcodebuild", ["-version"], { encoding: "utf8", timeout: 8000, maxBuffer: 64 * 1024 });
  const output = (xcode.stdout || "").trim();
  const match = output.match(/Xcode\s+(\d+)(?:\.\d+)*/);
  const available = xcode.status === 0 && Boolean(match);
  record(available, "Xcode 可用", available ? output.replace(/\n/g, " / ") : "xcodebuild 不可用、未完成設定或只有 Command Line Tools");
  record(available && Number(match?.[1]) >= 26, "Xcode 26+ 建置基線", "依 2026-10-13 官方要求；提交前再核對 SDK 與商店規則");
} else {
  record(false, "Xcode 可用", `目前平台 ${process.platform}，iOS Archive 需 macOS／Xcode 或適當建置環境`);
}

console.log("獅子會 App 上架準備盤點（唯讀，不連線、不安裝、不修改）");
console.log("PASS 只表示檔案／設定存在，並非功能、真機、簽名或政策驗收通過。\n");
for (const result of results) console.log(`${result.ok ? "PASS" : "MISSING"} ${result.label}${result.detail ? ` — ${result.detail}` : ""}`);
const gaps = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - gaps}/${results.length} 項存在／已填；${gaps} 項需補齊。`);
console.log("本工具不讀取帳密、Cookie、AWS 或 Apple 憑證，也不檢查正式服務。");
process.exitCode = args.includes("--strict") && gaps > 0 ? 1 : 0;
