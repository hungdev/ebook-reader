import { updateProgress } from "./storage";
import type { ReadingProgress } from "./types";

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { id: string; progress: ReadingProgress } | null = null;

export function scheduleProgressSave(
  id: string,
  progress: ReadingProgress,
  immediate = false,
): void {
  pending = {
    id,
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

  const { id, progress } = pending;
  pending = null;
  await updateProgress(id, progress);
}
