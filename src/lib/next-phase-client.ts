import type { NextPhaseAction, NextPhaseQuery } from "./next-phase-contract";

export class NextPhaseError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export type NextPhaseTransport = ReturnType<typeof createNextPhaseTransport>;
export function createNextPhaseTransport(request: (method: "GET" | "POST", query: string, body?: NextPhaseAction) => Promise<{ status: number; data: unknown }>) {
  return async function send<T>(operation: NextPhaseQuery | NextPhaseAction): Promise<T> {
    const mutation = "action" in operation;
    const query = mutation ? "" : new URLSearchParams(operation).toString();
    const result = await request(mutation ? "POST" : "GET", query, mutation ? operation : undefined);
    if (result.status !== 200 || !result.data) {
      const error = result.data as { error?: string; code?: string } | null;
      throw new NextPhaseError(error?.error ?? "目前無法讀取或儲存，請再試一次。", result.status, error?.code);
    }
    return result.data as T;
  };
}
