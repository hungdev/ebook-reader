import { getBookSyncKey } from "./book-sync-key";
import { applyRemoteLastBookSession } from "./reading-session";
import { updateProgress } from "./storage";
import type { SyncState } from "./sync/types";
import type { Book, ReadingProgress } from "./types";

function isRemoteProgressNewer(
  local: ReadingProgress,
  remote: ReadingProgress,
): boolean {
  const localUpdatedAt = local.updatedAt ?? 0;
  const remoteUpdatedAt = remote.updatedAt ?? 0;
  return remoteUpdatedAt > localUpdatedAt;
}

export async function mergeRemoteSyncState(
  books: Book[],
  remote: SyncState,
): Promise<{ books: Book[]; resumeBookId: string | null }> {
  const progressByKey = new Map(
    remote.progress.map((entry) => [entry.bookKey, entry.progress]),
  );

  const nextBooks = [...books];
  let resumeBookId: string | null = null;

  for (let index = 0; index < nextBooks.length; index += 1) {
    const book = nextBooks[index];
    const bookKey = await getBookSyncKey(book);
    const remoteProgress = progressByKey.get(bookKey);

    if (!remoteProgress || !isRemoteProgressNewer(book.progress, remoteProgress)) {
      continue;
    }

    await updateProgress(book.id, remoteProgress);
    nextBooks[index] = { ...book, progress: remoteProgress };
  }

  if (remote.session) {
    for (const book of nextBooks) {
      const bookKey = await getBookSyncKey(book);
      if (bookKey !== remote.session.lastBookKey) continue;

      applyRemoteLastBookSession(
        book.id,
        bookKey,
        remote.session.updatedAt,
      );
      resumeBookId = book.id;
      break;
    }
  }

  return { books: nextBooks, resumeBookId };
}
