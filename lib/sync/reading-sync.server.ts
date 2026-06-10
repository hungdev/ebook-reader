import { getDb } from "../mongodb";
import type {
  SyncProgressEntry,
  SyncProgressUpdate,
  SyncSession,
  SyncSessionUpdate,
  SyncState,
} from "./types";
import type { ReadingProgress } from "../types";

const PROGRESS_COLLECTION = "reading_progress";
const SESSION_COLLECTION = "reading_sessions";

let indexesReady: Promise<void> | null = null;

async function ensureIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await Promise.all([
        db
          .collection(PROGRESS_COLLECTION)
          .createIndex(
            { syncUserId: 1, bookKey: 1 },
            { unique: true },
          ),
        db
          .collection(SESSION_COLLECTION)
          .createIndex({ syncUserId: 1 }, { unique: true }),
      ]);
    })();
  }
  await indexesReady;
}

interface ProgressDocument {
  syncUserId: string;
  bookKey: string;
  progress: ReadingProgress;
  updatedAt: Date;
}

interface SessionDocument {
  syncUserId: string;
  lastBookKey: string;
  updatedAt: Date;
}

function isValidSyncUserId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}

function isValidBookKey(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value);
}

function parseProgress(value: unknown): ReadingProgress | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const chapterIndex = record.chapterIndex;
  const sentenceIndex = record.sentenceIndex;

  if (
    typeof chapterIndex !== "number" ||
    !Number.isInteger(chapterIndex) ||
    chapterIndex < 0 ||
    typeof sentenceIndex !== "number" ||
    !Number.isInteger(sentenceIndex) ||
    sentenceIndex < 0
  ) {
    return null;
  }

  const progress: ReadingProgress = { chapterIndex, sentenceIndex };

  if (
    typeof record.speechChunkIndex === "number" &&
    Number.isInteger(record.speechChunkIndex) &&
    record.speechChunkIndex >= 0
  ) {
    progress.speechChunkIndex = record.speechChunkIndex;
  }

  if (typeof record.wasListening === "boolean") {
    progress.wasListening = record.wasListening;
  }

  if (typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)) {
    progress.updatedAt = record.updatedAt;
  }

  return progress;
}

export function validateSyncUserId(value: unknown): string | null {
  if (typeof value !== "string" || !isValidSyncUserId(value)) return null;
  return value;
}

export async function getSyncState(syncUserId: string): Promise<SyncState> {
  await ensureIndexes();
  const db = await getDb();

  const [progressDocs, sessionDoc] = await Promise.all([
    db
      .collection<ProgressDocument>(PROGRESS_COLLECTION)
      .find({ syncUserId })
      .toArray(),
    db
      .collection<SessionDocument>(SESSION_COLLECTION)
      .findOne({ syncUserId }),
  ]);

  const progress = progressDocs.flatMap((doc) => {
    const parsed = parseProgress(doc.progress);
    if (!parsed) return [];

    return [
      {
        bookKey: doc.bookKey,
        progress: {
          ...parsed,
          updatedAt: doc.updatedAt.getTime(),
        },
      },
    ];
  });

  const session: SyncSession | null = sessionDoc
    ? {
        lastBookKey: sessionDoc.lastBookKey,
        updatedAt: sessionDoc.updatedAt.getTime(),
      }
    : null;

  return { progress, session };
}

export async function upsertSyncProgress(
  syncUserId: string,
  update: SyncProgressUpdate,
): Promise<void> {
  if (!isValidBookKey(update.bookKey)) {
    throw new Error("Invalid bookKey");
  }

  const progress = parseProgress(update.progress);
  if (!progress) {
    throw new Error("Invalid progress");
  }

  const updatedAt = progress.updatedAt ?? Date.now();
  progress.updatedAt = updatedAt;

  await ensureIndexes();
  const db = await getDb();

  await db.collection<ProgressDocument>(PROGRESS_COLLECTION).updateOne(
    { syncUserId, bookKey: update.bookKey },
    {
      $set: {
        syncUserId,
        bookKey: update.bookKey,
        progress,
        updatedAt: new Date(updatedAt),
      },
    },
    { upsert: true },
  );
}

export async function upsertSyncSession(
  syncUserId: string,
  update: SyncSessionUpdate,
): Promise<void> {
  if (!isValidBookKey(update.lastBookKey)) {
    throw new Error("Invalid lastBookKey");
  }

  await ensureIndexes();
  const db = await getDb();

  await db.collection<SessionDocument>(SESSION_COLLECTION).updateOne(
    { syncUserId },
    {
      $set: {
        syncUserId,
        lastBookKey: update.lastBookKey,
        updatedAt: new Date(update.updatedAt),
      },
    },
    { upsert: true },
  );
}
