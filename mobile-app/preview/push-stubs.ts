import type { PushNative, PushStore } from "../src/push-controller";

async function unavailable(): Promise<never> { throw new Error("PREVIEW_NATIVE_PUSH_DISABLED"); }
export const nativePush: PushNative = {
  supported: false, permission: unavailable, requestPermission: unavailable,
  register: unavailable, unregister: unavailable, listen: unavailable,
};
export const pushStore: PushStore = {
  installationId: unavailable, nextRevision: unavailable, optedIn: unavailable,
  setOptedIn: unavailable, linkedMember: unavailable, setLinkedMember: unavailable,
};
