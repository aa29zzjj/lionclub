export type SessionGuard = () => boolean;
export type SessionStopResult = { serverConfirmed: boolean; nativeConfirmed: boolean };
export type SessionEndDependencies = {
  stopPush(): Promise<SessionStopResult>;
  endSession(): Promise<SessionGuard>;
  errorGuard(error: unknown): SessionGuard | undefined;
  onStart(): void;
  onComplete(stopped: SessionStopResult): void;
  onUnconfirmed(): void;
  onOwnershipLost(): void;
  onSettled(): void;
};

const owns = (guard: SessionGuard | undefined): boolean => {
  try { return guard?.() === true; } catch { return false; }
};

/** One UI cleanup wave, with only explicitly requested session guards.
 * Guards refer to exact session epochs; this controller never captures a new
 * identity or interprets tokens. A confirmed loss can supersede an older
 * logout while push cleanup is still pending, without releasing its overlay. */
export function createSessionEndController(deps: SessionEndDependencies) {
  let pending: SessionGuard | undefined;
  let active: SessionGuard | undefined;
  let flight: Promise<void> | undefined;

  function takePending() {
    const next = pending;
    pending = undefined;
    return owns(next) ? next : undefined;
  }
  function reportOwnershipLost() {
    deps.onOwnershipLost();
    return takePending();
  }
  function afterFailure(error: unknown, original: SessionGuard) {
    const guard = deps.errorGuard(error) ?? original;
    if (owns(guard)) {
      deps.onUnconfirmed();
      // A later explicit request can retry. Failure itself never retries.
      return takePending();
    }
    return takePending() ?? reportOwnershipLost();
  }

  async function run() {
    let started = false;
    try {
      let current = takePending();
      if (!current) return;
      active = current;
      started = true; deps.onStart();
      while (current) {
        active = current;
        if (!owns(current)) {
          current = takePending() ?? reportOwnershipLost();
          continue;
        }
        let stopped: SessionStopResult;
        try { stopped = await deps.stopPush(); }
        catch (error) { current = afterFailure(error, current); continue; }

        // Take a new, still-owned recovery request before calling the end API.
        // Ordinary concurrent requests for the same epoch are already merged.
        current = takePending() ?? (owns(current) ? current : undefined);
        if (!current) { current = reportOwnershipLost(); continue; }
        const ending = current;
        active = ending;
        let ownsEndedSession: SessionGuard;
        try {
          ownsEndedSession = await deps.endSession();
        } catch (error) { current = afterFailure(error, ending); continue; }
        // UI callback failures are not an unconfirmed end API result. Let them
        // reject this wave after its final cleanup, without retrying logout.
        if (owns(ownsEndedSession)) {
          deps.onComplete(stopped);
          const next = takePending();
          // Requests for this same ended epoch are fulfilled by this result.
          // A different current epoch needs its own explicitly queued job.
          current = next && !owns(ownsEndedSession) ? next : undefined;
        } else current = takePending() ?? reportOwnershipLost();
      }
    } finally {
      active = undefined;
      flight = undefined;
      if (started) deps.onSettled();
    }
  }

  function request(isCurrent: SessionGuard): Promise<void> {
    if (!owns(isCurrent)) return flight ?? Promise.resolve();
    if (flight && owns(active)) return flight;
    pending = isCurrent;
    if (flight) return flight;
    let resolve!: () => void, reject!: (error: unknown) => void;
    const result = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
    // Publish the wave before onStart/stopPush can synchronously emit recovery.
    flight = result;
    void run().then(resolve, reject);
    return result;
  }
  return { request };
}
