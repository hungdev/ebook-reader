import { pushSyncSession } from "./progress-sync.client";

const LAST_SESSION_KEY = "ebook-reader-last-session";
const LEGACY_LAST_BOOK_KEY = "ebook-reader-last-book";

interface ReadingSession {
  bookId: string;
  bookKey: string;
  updatedAt: number;
}

function readSession(): ReadingSession | null {
  const raw = localStorage.getItem(LAST_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ReadingSession;
    if (
      typeof parsed.bookId === "string" &&
      typeof parsed.bookKey === "string" &&
      typeof parsed.updatedAt === "number"
    ) {
      return parsed;
    }
  } catch {
    // ignore invalid cache
  }

  return null;
}

function readLegacyBookId(): string | null {
  const legacy = localStorage.getItem(LEGACY_LAST_BOOK_KEY);
  if (!legacy) return null;
  localStorage.removeItem(LEGACY_LAST_BOOK_KEY);
  return legacy;
}

export function saveLastBookSession(bookId: string, bookKey: string): void {
  const session: ReadingSession = {
    bookId,
    bookKey,
    updatedAt: Date.now(),
  };
  localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
  void pushSyncSession(bookKey);
}

export function getLastBookSession(): ReadingSession | null {
  return readSession();
}

export function getLegacyLastBookId(): string | null {
  return readLegacyBookId();
}

export function clearLastBookSession(): void {
  localStorage.removeItem(LAST_SESSION_KEY);
  localStorage.removeItem(LEGACY_LAST_BOOK_KEY);
}

export function applyRemoteLastBookSession(
  bookId: string,
  bookKey: string,
  updatedAt: number,
): void {
  const current = readSession();
  if (current && current.updatedAt >= updatedAt) return;

  const session: ReadingSession = { bookId, bookKey, updatedAt };
  localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
}
