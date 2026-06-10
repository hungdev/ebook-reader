import type { ReadingProgress } from "./types";
import { getSyncUserId } from "./sync-user";
import type { SyncPutBody, SyncState } from "./sync/types";

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchSyncState(): Promise<SyncState | null> {
  const syncUserId = getSyncUserId();

  try {
    const response = await fetch(
      `/api/sync?syncUserId=${encodeURIComponent(syncUserId)}`,
      { cache: "no-store" },
    );

    if (!response.ok) return null;
    return parseJsonResponse<SyncState>(response);
  } catch {
    return null;
  }
}

export async function pushSyncProgress(
  bookKey: string,
  progress: ReadingProgress,
): Promise<void> {
  const body: SyncPutBody = {
    syncUserId: getSyncUserId(),
    progress: { bookKey, progress },
  };

  try {
    await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // offline-first: local cache remains source of truth until next sync
  }
}

export async function pushSyncSession(lastBookKey: string): Promise<void> {
  const body: SyncPutBody = {
    syncUserId: getSyncUserId(),
    session: { lastBookKey, updatedAt: Date.now() },
  };

  try {
    await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // offline-first
  }
}
