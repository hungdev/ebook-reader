import { pushSyncProgress } from "./progress-sync.client";
import { updateProgress } from "./storage";
import type { ReadingProgress } from "./types";

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: {
  id: string;
  bookKey: string;
  progress: ReadingProgress;
} | null = null;

export function scheduleProgressSave(
  id: string,
  bookKey: string,
  progress: ReadingProgress,
  immediate = false,
): void {
  pending = {
    id,
    bookKey,
    progress: { ...progress, updatedAt: Date.now() },
  };

  if (immediate) {
    void flushProgressSave();
    return;
  }

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void flushProgressSave();
  }, 300);
}

export async function flushProgressSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!pending) return;

  const { id, bookKey, progress } = pending;
  pending = null;

  await updateProgress(id, progress);
  void pushSyncProgress(bookKey, progress);
}
