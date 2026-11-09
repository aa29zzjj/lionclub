/** Pure native-push coordinator. No tokens, member data or raw errors are logged. */
export type PushPermission = "prompt" | "granted" | "denied";
export type PushConfig = { enabled: boolean; privacyMode: "generic"; environment?: "sandbox" | "production" | null; topic?: string | null };
export type PushStatus = "checking" | "unavailable" | "off" | "denied" | "registering" | "on" | "error";
export type PushDeviceInput = { installationId: string; revision: number; token: string; authorization: "granted" };
export type PushApi = {
  getPushConfig(): Promise<PushConfig>;
  registerPushDevice(input: PushDeviceInput): Promise<void>;
  disablePushDevice(input: { installationId: string; revision: number }): Promise<void>;
};
export type PushStore = {
  installationId(): Promise<string>;
  nextRevision(): Promise<number>;
  optedIn(memberId: string): Promise<boolean>;
  setOptedIn(memberId: string, enabled: boolean): Promise<void>;
  linkedMember(): Promise<string | null>;
  setLinkedMember(memberId: string | null): Promise<void>;
};
export type PushNative = {
  supported: boolean;
  permission(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  listen(callbacks: { token(token: string): void; error(): void; action(data: unknown): void; resume(): void }): Promise<() => void>;
};
const KINDS = new Set(["activity", "friend_invitation", "experience_review", "membership_review"]);
export function isKnownPushAction(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const value = data as Record<string, unknown>;
  return value.version === 1 && typeof value.kind === "string" && KINDS.has(value.kind);
}
/** Capacitor iOS puts the whole APNs userInfo in notification.data. */
export function actionFromApnsUserInfo(userInfo: unknown): unknown {
  if (!userInfo || typeof userInfo !== "object" || Array.isArray(userInfo)) return null;
  const data = (userInfo as Record<string, unknown>).data;
  if (!isKnownPushAction(data)) return null;
  const value = data as { version: number; kind: string };
  return { version: value.version, kind: value.kind };
}

export function createPushController(options: {
  memberId: string; api: PushApi; native: PushNative; store: PushStore;
  changed(status: PushStatus): void; openNotifications(): void;
}) {
  const { memberId, api, native, store } = options;
  let generation = 0, disposed = false, stopping = false;
  let configuration: PushConfig | null = null;
  let removeListeners: (() => void) | undefined;
  let listenerSetup: Promise<void> | undefined;
  let pending: Promise<void> = Promise.resolve();
  let preferenceWrites: Promise<void> = Promise.resolve();
  const writePreference = (value: boolean) => {
    preferenceWrites = preferenceWrites.catch(() => {}).then(() => store.setOptedIn(memberId, value));
    return preferenceWrites;
  };
  const status = (value: PushStatus) => { if (!disposed) options.changed(value); };
  const current = (value: number) => !disposed && !stopping && generation === value;

  async function ensureListeners() {
    if (listenerSetup) return listenerSetup;
    listenerSetup = native.listen({
      token(token) {
        const attempt = generation;
        if (!current(attempt) || !configuration?.enabled || !/^(?:[a-fA-F0-9]{2}){16,256}$/.test(token)) return;
        pending = pending.catch(() => {}).then(async () => {
          if (!current(attempt) || !await store.optedIn(memberId) || !current(attempt)) return;
          const authorization = await native.permission();
          if (!current(attempt)) return;
          if (authorization !== "granted") { status(authorization === "denied" ? "denied" : "off"); return; }
          const installationId = await store.installationId(), revision = await store.nextRevision();
          if (!current(attempt)) return;
          // Remember an uncertain registration too, so logout still attempts revocation.
          await store.setLinkedMember(memberId);
          if (!current(attempt)) return;
          await api.registerPushDevice({ installationId, revision, token: token.toLowerCase(), authorization: "granted" });
          if (current(attempt)) status("on");
        }).catch(() => { if (current(attempt)) status("error"); });
      },
      error() { if (!stopping) status("error"); },
      action(data) { if (!disposed && !stopping && isKnownPushAction(data)) options.openNotifications(); },
      resume() { if (!stopping) void refresh(); },
    }).then(remove => { if (disposed) remove(); else removeListeners = remove; });
    return listenerSetup;
  }

  async function prepare(attempt: number) {
    if (!native.supported) { status("unavailable"); return false; }
    const loaded = await api.getPushConfig();
    if (!current(attempt)) return false;
    configuration = loaded;
    if (!configuration.enabled || configuration.privacyMode !== "generic") { status("unavailable"); return false; }
    await ensureListeners();
    return current(attempt);
  }

  async function refresh() {
    if (disposed || stopping) return;
    const attempt = ++generation;
    try {
      if (!await prepare(attempt)) return;
      const permission = await native.permission();
      if (!current(attempt)) return;
      if (permission === "denied") { status("denied"); return; }
      if (permission !== "granted" || !await store.optedIn(memberId)) { status("off"); return; }
      if (!current(attempt)) return;
      status("registering");
      await native.register(); // Token listener is installed first; no permission prompt here.
    } catch { if (current(attempt)) status("error"); }
  }

  async function enable() {
    if (disposed || stopping) return;
    const attempt = ++generation;
    status("checking");
    try {
      if (!await prepare(attempt)) return;
      let permission = await native.permission();
      if (!current(attempt)) return;
      // This function is called only by the explicit opt-in button.
      if (permission === "prompt") permission = await native.requestPermission();
      if (!current(attempt)) return;
      if (permission !== "granted") { status("denied"); return; }
      await writePreference(true);
      if (!current(attempt)) return;
      status("registering"); await native.register();
    } catch { if (current(attempt)) status("error"); }
  }

  async function disable() {
    stopping = true; generation++;
    let serverConfirmed = true, nativeConfirmed = true;
    try {
      const needed = await store.linkedMember() === memberId || await store.optedIn(memberId);
      await writePreference(false);
      await pending;
      if (needed) {
        // Higher durable revision fences a late/unknown registration on the server.
        try {
          const installationId = await store.installationId(), revision = await store.nextRevision();
          await api.disablePushDevice({ installationId, revision }); await store.setLinkedMember(null);
        } catch { serverConfirmed = false; }
        try { await native.unregister(); } catch { nativeConfirmed = false; }
      }
    } catch { serverConfirmed = false; nativeConfirmed = false; }
    stopping = false; status(serverConfirmed && nativeConfirmed ? "off" : "error");
    return { serverConfirmed, nativeConfirmed };
  }

  async function dispose() {
    disposed = true; generation++;
    removeListeners?.();
    await listenerSetup?.catch(() => {});
  }
  return { refresh, enable, disable, dispose };
}
