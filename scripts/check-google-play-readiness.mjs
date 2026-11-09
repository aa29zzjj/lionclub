#!/usr/bin/env node
// Read-only public-source inventory. Never opens credentials, contacts Google,
// starts Gradle/adb, accepts a license, signs or uploads an artifact.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args=process.argv.slice(2);
if(args.some(arg=>!["--strict","--json"].includes(arg))) throw Error("Use --json and/or --strict only");
const read=path=>readFileSync(resolve(root,path),"utf8");
const meta=JSON.parse(read("docs/app-store/GOOGLE_PLAY_PREPARATION.zh-Hant.json"));
const manifest=read("android/app/src/main/AndroidManifest.xml");
const variables=read("android/variables.gradle"), gradle=read("android/app/build.gradle");
const checks=[];
const add=(id,ok,detail)=>checks.push({id,ok,detail});
add("android-host",existsSync(resolve(root,"android/gradlew")),"Local engineering host only");
add("api-36",/targetSdkVersion\s*=\s*36\b/.test(variables)&&/compileSdkVersion\s*=\s*36\b/.test(variables),"2026-11-05 new-app baseline");
add("package-candidate",gradle.includes(`applicationId "${meta.applicationIdCandidate}"`),"Play Console identity not yet confirmed");
add("no-cleartext",manifest.includes('android:usesCleartextTraffic="false"'),"Manifest source only, not a network acceptance test");
add("no-backup",manifest.includes('android:allowBackup="false"')&&manifest.includes("data_extraction_rules"),"Inspect merged manifest and device behavior before release");
add("listing-lengths",meta.listing.name.length<=30&&meta.listing.shortDescription.length<=80&&meta.listing.fullDescription.length<=4000,"Draft only");
for(const field of ["applicationIdConfirmedInPlayConsole","accountExistenceVerified","developerVerificationComplete","playConsoleAppCreated"]) add(field,meta[field]===true,"Requires actual account verification");
for(const field of ["debugBuildVerified","releaseBundleVerified","signingConfigured","physicalDeviceVerified","pageSize16KbVerified","oauthSingleUsePkceVerified","backgroundPrivacyVerified"]) add(field,meta.technical[field]===true,"Evidence must be recorded before setting true");
for(const field of ["dedicatedAccountVerified","dataSafetyReviewed","privacyPolicyReconciled","deletionFlowVerified","ugcReportAndBlockVerified","internalTestingComplete","closedTestingRequirementDetermined"]) add(field,meta.review[field]===true,"Cannot inherit iOS acceptance");
if (["SOCIAL", "DATING"].includes(String(meta.listing.categoryCandidate).toUpperCase())) {
  for(const field of ["publishedStandardsVerified","inAppReportingVerifiedOnAndroid","moderationAndCsamProcessConfirmed","legalReportingProcessConfirmed","designatedContactVerified","consoleDeclarationCompleted"]) add(`childSafety.${field}`,meta.childSafety?.[field]===true,"Social/Dating child safety declaration needs actual public policy and operational evidence; a draft alone does not pass");
  add("childSafety.public-standards-url", /^https:\/\//.test(meta.childSafety?.publicStandardsUrl || ""), "Public HTML policy must be verified accessible; no draft or PDF URL");
}
for(const field of ["targetAudienceConfirmed","contentRatingCompleted","countriesConfirmed","listingApprovedForPublication"]) add(field,meta.listing[field]===true,"Needs final Play Console review");
add("play-assets",Boolean(meta.assets.playIcon512&&meta.assets.featureGraphic1024x500&&meta.assets.androidScreenshots.length>=2),"Need final Android assets and accurate screenshots");
const report={checkedOn:meta.reviewedOn,readOnly:true,checks,missing:checks.filter(c=>!c.ok).length,submissionReady:meta.ready===true&&checks.every(c=>c.ok)};
if(args.includes("--json")) console.log(JSON.stringify(report,null,2));
else { console.log("Google Play candidate inventory; presence is not device acceptance."); for(const c of checks) console.log(`${c.ok?"PRESENT":"PENDING"} ${c.id}: ${c.detail}`); console.log(`Submission ready: ${report.submissionReady}; pending: ${report.missing}`); }
if(args.includes("--strict")&&!report.submissionReady) process.exitCode=1;
