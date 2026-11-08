/** Foreground reads never end a session or mutate a draft. The caller keeps its
 * signed-in subtree mounted and hides it until this exact account is verified. */
export class ForegroundIdentityMismatch extends Error {}

export function createForegroundRevalidator<T extends { id: string }>(input: {
  memberId: string;
  getMember: () => Promise<T>;
  captureSessionGuard: () => () => boolean;
  getGeneration: () => number;
  advanceGeneration: () => number;
  isReady: () => boolean;
  onPending: (pending: boolean) => void;
  onVerified: (member: T) => void;
  onUnavailable: (failure: unknown) => void;
}) {
  let disposed = false;
  let failed = false;
  let revision = 0;
  let ownedGeneration = input.getGeneration();
  let isActive: boolean | null = null;
  let running = false;
  let requested = false;
  const ownerSession = input.captureSessionGuard();
  // An external generation advance belongs to login/logout/recovery. Do not
  // supersede it just because a delayed native app-state event arrives.
  const owns = () => !disposed && !failed && input.isReady() && ownerSession()
    && input.getGeneration() === ownedGeneration;

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (requested && isActive && owns()) {
        requested = false;
        const attemptRevision = revision;
        ownedGeneration = input.advanceGeneration();
        const generation = ownedGeneration;
        const sessionCurrent = input.captureSessionGuard();
        const current = () => owns() && isActive === true && revision === attemptRevision
          && input.getGeneration() === generation && sessionCurrent();
        try {
          const result = await input.getMember();
          if (!current()) continue;
          if (!result || result.id !== input.memberId) throw new ForegroundIdentityMismatch();
          input.onVerified(result);
          input.onPending(false);
        } catch (failure) {
          if (!current()) continue;
          failed = true;
          input.onUnavailable(failure);
          // The unavailable callback hides/removes member data via its phase;
          // do not momentarily expose the old subtree by clearing pending here.
        }
      }
    } finally { running = false; }
  }

  return {
    handleState(active: boolean) {
      if (!owns() || isActive === active) return;
      isActive = active;
      revision++;
      input.onPending(true);
      requested = active;
      if (active) void drain();
    },
    unavailable(failure: unknown) {
      if (!owns()) return;
      revision++;
      requested = false;
      input.onPending(true);
      failed = true;
      input.onUnavailable(failure);
    },
    dispose() { disposed = true; revision++; requested = false; },
  };
}

/** A listener can resolve after React cleanup. Remove that late handle too;
 * never leave a rejected registration/removal promise unobserved. */
export function attachForegroundListener(input: {
  addListener: (listener: (event: { isActive: boolean }) => void) => Promise<{ remove(): Promise<void> }>;
  onState: (active: boolean) => void;
  onUnavailable: (failure: unknown) => void;
}): () => void {
  let disposed = false;
  let handle: { remove(): Promise<void> } | null = null;
  const remove = (value: { remove(): Promise<void> }) => { void Promise.resolve().then(() => value.remove()).catch(() => {}); };
  void Promise.resolve().then(() => input.addListener(event => {
    if (!disposed && typeof event.isActive === "boolean") input.onState(event.isActive);
  })).then(value => {
    if (disposed) remove(value);
    else handle = value;
  }).catch(failure => { if (!disposed) input.onUnavailable(failure); });
  return () => {
    if (disposed) return;
    disposed = true;
    if (handle) remove(handle);
  };
}
