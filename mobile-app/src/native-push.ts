import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import type { PushNative, PushPermission, PushStore } from "./push-controller";
import { actionFromApnsUserInfo } from "./push-controller";

const PREFIX = "lionclubs.push.";
let revisionQueue: Promise<unknown> = Promise.resolve();
const permission = (value: string): PushPermission => value === "granted" || value === "denied" ? value : "prompt";

export const nativePush: PushNative = {
  supported: Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios",
  async permission() { return permission((await PushNotifications.checkPermissions()).receive); },
  async requestPermission() { return permission((await PushNotifications.requestPermissions()).receive); },
  register: () => PushNotifications.register(),
  unregister: () => PushNotifications.unregister(),
  async listen(callbacks) {
    const handles: { remove(): Promise<void> }[] = [];
    try {
      handles.push(await PushNotifications.addListener("registration", event => callbacks.token(event.value)));
      handles.push(await PushNotifications.addListener("registrationError", () => callbacks.error()));
      handles.push(await PushNotifications.addListener("pushNotificationActionPerformed", event => callbacks.action(actionFromApnsUserInfo(event.notification.data))));
      handles.push(await PushNotifications.addListener("pushNotificationReceived", () => window.dispatchEvent(new Event("lion-notifications-refresh"))));
      handles.push(await App.addListener("appStateChange", event => { if (event.isActive) callbacks.resume(); }));
      return () => { for (const handle of handles) void handle.remove().catch(() => {}); };
    } catch {
      await Promise.all(handles.map(handle => handle.remove().catch(() => {}))); throw new Error("PUSH_LISTENERS_UNAVAILABLE");
    }
  },
};

export const pushStore: PushStore = {
  async installationId() {
    const existing = await SecureStorage.getItem(PREFIX + "installation");
    if (typeof existing === "string" && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const value = crypto.randomUUID();
    await SecureStorage.setItem(PREFIX + "installation", value); return value;
  },
  nextRevision() {
    const next = revisionQueue.catch(() => {}).then(async () => {
      const stored = await SecureStorage.getItem(PREFIX + "revision");
      const current = stored === null ? 0 : Number(stored);
      if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) throw Error("PUSH_REVISION_UNAVAILABLE");
      const value = current + 1;
      await SecureStorage.setItem(PREFIX + "revision", String(value)); return value;
    });
    revisionQueue = next; return next;
  },
  async optedIn(memberId) { return await SecureStorage.getItem(PREFIX + "optin." + memberId) === "true"; },
  async setOptedIn(memberId, enabled) { await SecureStorage.setItem(PREFIX + "optin." + memberId, String(enabled)); },
  async linkedMember() {
    const value = await SecureStorage.getItem(PREFIX + "linked-member"); return typeof value === "string" ? value : null;
  },
  async setLinkedMember(memberId) {
    if (memberId === null) await SecureStorage.removeItem(PREFIX + "linked-member");
    else await SecureStorage.setItem(PREFIX + "linked-member", memberId);
  },
};
