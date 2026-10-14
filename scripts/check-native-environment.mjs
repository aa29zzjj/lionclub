#!/usr/bin/env node
// Read-only inventory: no installs, SDK/license acceptance, device discovery,
// Keychain, signing identities, keystores, .env, accounts or credential files.
import { accessSync, constants, existsSync, readFileSync, readdirSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/check-native-environment.mjs [--json] [--strict]");
  console.log("Read-only local tool inventory. Default exits 0; --strict exits 1 for missing prerequisites.");
  process.exit(0);
}
if (args.some(arg => !["--json", "--strict"].includes(arg))) { console.error("Unknown argument; use --help."); process.exit(2); }
const checks = [];
const record = (id, ok, detail) => checks.push({ id, status: ok === null ? "INFO" : ok ? "PASS" : "MISSING", detail });
const entries = path => { try { return readdirSync(path); } catch { return []; } };
const executable = path => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } };
const onPath = name => (process.env.PATH || "").split(delimiter).filter(Boolean).map(path => join(path, name)).find(executable);
const command = (path, commandArgs) => {
  if (!path) return { ok: false, text: "not available" };
  const result = spawnSync(path, commandArgs, { encoding: "utf8", timeout: 8000, maxBuffer: 32768, stdio: ["ignore", "pipe", "pipe"] });
  // Only the explicitly allowlisted version/path commands below may run.
  const text = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  return { ok: result.status === 0, text };
};
const atLeast = (version, minimum) => {
  const actual = version.split(".").map(Number), required = minimum.split(".").map(Number);
  for (let i = 0; i < required.length; i++) { if ((actual[i] || 0) > required[i]) return true; if ((actual[i] || 0) < required[i]) return false; }
  return true;
};

record("host", null, `${process.platform}/${process.arch}`);
record("node-22", Number(process.versions.node.split(".")[0]) >= 22, `${process.version}; executable ${process.execPath}`);
const applicationRoots = process.platform === "darwin" ? ["/Applications", join(homedir(), "Applications")] : [];
const applications = applicationRoots.flatMap(path => entries(path).filter(name => /^(Xcode.*|Android Studio.*)\.app$/.test(name)).map(name => join(path, name)));
const xcodes = applications.filter(path => /\/Xcode[^/]*\.app$/.test(path));
if (process.platform === "darwin") {
  const mac = command("/usr/bin/sw_vers", ["-productVersion"]);
  record("macos-version", null, mac.ok ? mac.text : "not detected");
  const selection = command("/usr/bin/xcode-select", ["-p"]);
  record("xcode-app-presence", xcodes.length > 0, xcodes.join(", ") || "No Xcode.app found in standard Applications folders; custom locations are not scanned.");
  record("selected-developer-directory", selection.ok && !selection.text.includes("CommandLineTools"), selection.ok ? selection.text : "not configured");
  const xcode = command("/usr/bin/xcodebuild", ["-version"]);
  const version = xcode.text.match(/Xcode\s+(\d+(?:\.\d+)*)/)?.[1];
  const available = xcode.ok && Boolean(version);
  record("xcode-26", available && atLeast(version, "26.0"), available ? xcode.text.replace(/\n/g, " / ") : "Full selected Xcode is not usable; Command Line Tools alone cannot archive iOS.");
  if (available) {
    const sdk = command("/usr/bin/xcrun", ["--sdk", "iphoneos", "--show-sdk-version"]);
    const sdkVersion = sdk.text.match(/^(\d+(?:\.\d+)*)/)?.[1];
    record("ios-sdk-26", sdk.ok && Boolean(sdkVersion) && atLeast(sdkVersion, "26.0"), sdk.ok ? sdk.text : "iPhoneOS SDK not available");
  } else record("ios-sdk-26", false, "Not queried because a usable full Xcode is missing.");
} else record("xcode-26", false, "An iOS archive needs a macOS/Xcode build host; this host is not macOS.");

const studios = applications.filter(path => /\/Android Studio[^/]*\.app$/.test(path));
let studioVersion;
if (studios[0]) {
  const version = command("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", join(studios[0], "Contents/Info.plist")]);
  if (version.ok) studioVersion = version.text;
}
record("android-studio-presence", studios.length > 0, studios.length ? `${studios.join(", ")}${studioVersion ? `; ${studioVersion}` : "; version not verified"}` : "Android Studio not found in standard macOS Applications folders; a headless build host may use equivalent tools.");
record("android-studio-2025.2.1", Boolean(studioVersion) && atLeast(studioVersion.match(/\d+(?:\.\d+)*/)?.[0] || "0", "2025.2.1"), studioVersion || "Version not verified.");

let javaHome = process.env.JAVA_HOME;
if (!javaHome && process.platform === "darwin") {
  const home = command("/usr/libexec/java_home", ["-v", "17+"]);
  if (home.ok) javaHome = home.text;
}
const javaCandidates = [javaHome && join(javaHome, "bin/java"), ...studios.map(path => join(path, "Contents/jbr/Contents/Home/bin/java"))].filter(Boolean);
const pathJava = onPath("java");
// /usr/bin/java on macOS is only a launcher and may display an install prompt.
if (pathJava && !(process.platform === "darwin" && pathJava === "/usr/bin/java")) javaCandidates.push(pathJava);
const java = javaCandidates.find(executable);
const javaVersion = java ? command(java, ["-version"]) : { ok: false, text: "No JDK found; the macOS /usr/bin/java launcher alone is not a JDK." };
const major = Number(javaVersion.text.match(/version\s+"?(\d+)/)?.[1] || 0);
record("jdk-17-minimum", javaVersion.ok && major >= 17, javaVersion.ok ? `${java}; ${javaVersion.text.split("\n")[0]}` : javaVersion.text);
record("jdk-compatibility", null, "JDK 17 is the Android Gradle Plugin 8.x minimum, not a promise that every newer JDK works. Use the generated wrapper/AGP and Android Studio bundled JBR compatibility matrix.");

const sdkCandidates = [...new Set([process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.platform === "darwin" && join(homedir(), "Library/Android/sdk"), process.platform === "linux" && join(homedir(), "Android/Sdk")].filter(Boolean))];
const sdk = sdkCandidates.find(existsSync);
record("android-sdk", Boolean(sdk), sdk || "No Android SDK found in ANDROID_HOME, ANDROID_SDK_ROOT or standard user SDK location.");
const platforms = sdk ? entries(join(sdk, "platforms")).filter(name => /^android-\d+$/.test(name)) : [];
record("android-api-36", platforms.includes("android-36"), platforms.join(", ") || "No installed Android platform detected.");
const buildTools = sdk ? entries(join(sdk, "build-tools")) : [];
record("android-build-tools", buildTools.length > 0, buildTools.join(", ") || "No installed build-tools detected.");
const sdkManagers = sdk ? [join(sdk, "cmdline-tools/latest/bin/sdkmanager"), ...entries(join(sdk, "cmdline-tools")).map(name => join(sdk, "cmdline-tools", name, "bin/sdkmanager"))] : [];
record("sdkmanager-presence", sdkManagers.some(executable) || Boolean(onPath("sdkmanager")), "Presence only; not run, no downloads or license acceptance.");
record("adb-presence", Boolean(sdk && executable(join(sdk, "platform-tools/adb"))) || Boolean(onPath("adb")), "Presence only; not run, no daemon or device enumeration.");

let pkg = {};
try { pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")); } catch { /* inventory reports below */ }
record("capacitor-package", Boolean(pkg.dependencies?.["@capacitor/core"] || pkg.devDependencies?.["@capacitor/core"]), "Read package.json only; no npx, dependency installation or package scripts executed.");
record("native-projects", ["ios/App/App.xcodeproj/project.pbxproj", "native/ios/App/App.xcodeproj/project.pbxproj", "mobile/ios/App/App.xcodeproj/project.pbxproj"].some(path => existsSync(join(root, path))) && ["android/app/build.gradle", "android/app/build.gradle.kts", "native/android/app/build.gradle", "mobile/android/app/build.gradle"].some(path => existsSync(join(root, path))), "Checks standard project file presence only; no Gradle/Xcode build or signing performed.");
record("signing-and-accounts", null, "NOT CHECKED: Apple/Google accounts, Team IDs, certificates, provisioning, Keychain, keystores, tokens and secrets. Availability is not inferred.");

const missing = checks.filter(check => check.status === "MISSING").length;
const report = { checkedAt: new Date().toISOString(), readOnly: true, checks, missing };
if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log("Native build environment inventory — read-only; no installs, builds, credentials or network checks.");
  for (const check of checks) console.log(`${check.status} ${check.id}: ${check.detail}`);
  console.log(`\n${missing} missing prerequisites. PASS means local tool/file presence only, not signing, functional or store approval.`);
}
process.exitCode = args.includes("--strict") && missing > 0 ? 1 : 0;
