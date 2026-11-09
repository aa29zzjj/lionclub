// Generate a separate simulator-only host; canonical ios/ and production bundle
// are never modified. Does not install, launch, provision, request permission or upload.
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const preview = resolve(root, "tmp/native-ui-preview");
const evidence = JSON.parse(readFileSync(resolve(preview, "build-evidence.json"), "utf8"));
if (evidence.mode !== "isolated-native-ui-candidate-synthetic-only" || evidence.networkAllowed !== false || evidence.keychainAccess !== false
  || evidence.credentialsIncluded !== false || evidence.sources.some(path => /mobile-app\/src\/(?:contract|native-push)\.ts$|node_modules\/@(?:capacitor|aparajita)\//.test(path))) throw Error("ISOLATED_PREVIEW_REQUIRED");
mkdirSync(resolve(root, "tmp"), { recursive: true });
const host = mkdtempSync(resolve(root, "tmp/native-ui-host-"));
cpSync(resolve(root, "ios"), resolve(host, "ios"), { recursive: true, errorOnExist: true, force: false,
  filter: path => !/(?:^|\/)(?:build|output|DerivedData|xcuserdata|public|\.build)(?:\/|$)/.test(relative(resolve(root, "ios"), path)) });
symlinkSync(resolve(root, "node_modules"), resolve(host, "node_modules"), "dir");
const project = resolve(host, "ios/App/App.xcodeproj/project.pbxproj");
let source = readFileSync(project, "utf8");
if (!source.includes("PRODUCT_BUNDLE_IDENTIFIER = com.lionclubsmembership.app;")) throw Error("UNEXPECTED_IOS_PROJECT");
source = source.replaceAll("PRODUCT_BUNDLE_IDENTIFIER = com.lionclubsmembership.app;", "PRODUCT_BUNDLE_IDENTIFIER = com.lionclubsmembership.uipreview;");
// A production push entitlement must never leak into the synthetic host.
// The preview has no Apple App ID or provisioning profile and cannot register APNs.
source = source.replace(/^\s*CODE_SIGN_ENTITLEMENTS\s*=\s*[^;]+;\s*$/gm, "");
writeFileSync(project, source);
const infoPath = resolve(host, "ios/App/App/Info.plist");
const info = JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", infoPath], { encoding: "utf8" }));
info.CFBundleDisplayName = "LionClubs UI 預覽";
delete info.CFBundleURLTypes; // Never intercept real OAuth callbacks.
delete info.UIBackgroundModes;
writeFileSync(infoPath, JSON.stringify(info));
execFileSync("/usr/bin/plutil", ["-convert", "xml1", infoPath]);
const destination = resolve(host, "ios/App/App/public");
mkdirSync(destination, { recursive: true });
cpSync(preview, destination, { recursive: true });
const configPath = resolve(host, "ios/App/App/capacitor.config.json");
const config = existsSync(resolve(root, "ios/App/App/capacitor.config.json"))
  ? JSON.parse(readFileSync(resolve(root, "ios/App/App/capacitor.config.json"), "utf8")) : {};
if (config.server) throw Error("REMOTE_SERVER_FORBIDDEN_IN_PREVIEW");
writeFileSync(configPath, JSON.stringify({ ...config, appId: "com.lionclubsmembership.uipreview", appName: "LionClubs UI 預覽", webDir: "public" }, null, 2));
writeFileSync(resolve(host, "NATIVE_UI_PREVIEW_ONLY.json"), JSON.stringify({ synthetic: true, productionChanged: false,
  bundleId: "com.lionclubsmembership.uipreview", oauthSchemeRegistered: false, networkAllowed: false, credentialsIncluded: false }));
console.log(host);
