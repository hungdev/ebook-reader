import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { getDb } from "../mongodb";
import type { BookFormat } from "../types";
import {
  getBookExtension,
  getBookFilePath,
  UPLOADS_DIR,
} from "./paths.server";

const LIBRARY_COLLECTION = "library_books";

let indexesReady: Promise<void> | null = null;

export interface LibraryBookRecord {
  syncKey: string;
  title: string;
  author?: string;
  format: BookFormat;
  fileSize: number;
  addedAt: number;
  updatedAt: number;
}

interface LibraryBookDocument {
  syncKey: string;
  title: string;
  author?: string;
  format: BookFormat;
  fileSize: number;
  addedAt: Date;
  updatedAt: Date;
}

function isValidSyncKey(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value);
}

function isValidFormat(value: string): value is BookFormat {
  return value === "epub" || value === "txt";
}

function toRecord(doc: LibraryBookDocument): LibraryBookRecord {
  return {
    syncKey: doc.syncKey,
    title: doc.title,
    author: doc.author,
    format: doc.format,
    fileSize: doc.fileSize,
    addedAt: doc.addedAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
  };
}

async function ensureIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = (async () => {
      const db = await getDb();
      await db
        .collection(LIBRARY_COLLECTION)
        .createIndex({ syncKey: 1 }, { unique: true });
    })();
  }
  await indexesReady;
}

export async function ensureUploadsDir(): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

export async function listLibraryBooks(): Promise<LibraryBookRecord[]> {
  await ensureIndexes();
  const db = await getDb();
  const docs = await db
    .collection<LibraryBookDocument>(LIBRARY_COLLECTION)
    .find({})
    .sort({ addedAt: -1 })
    .toArray();
  return docs.map(toRecord);
}

export async function getLibraryBook(
  syncKey: string,
): Promise<LibraryBookRecord | null> {
  if (!isValidSyncKey(syncKey)) return null;

  await ensureIndexes();
  const db = await getDb();
  const doc = await db
    .collection<LibraryBookDocument>(LIBRARY_COLLECTION)
    .findOne({ syncKey });
  return doc ? toRecord(doc) : null;
}

export async function saveLibraryBookFile(
  syncKey: string,
  format: BookFormat,
  buffer: Buffer,
): Promise<void> {
  await ensureUploadsDir();
  await writeFile(getBookFilePath(syncKey, format), buffer);
}

export async function readLibraryBookFile(
  syncKey: string,
  format: BookFormat,
): Promise<Buffer | null> {
  try {
    return await readFile(getBookFilePath(syncKey, format));
  } catch {
    return null;
  }
}

export interface UpsertLibraryBookInput {
  syncKey: string;
  title: string;
  author?: string;
  format: BookFormat;
  fileSize: number;
}

export async function upsertLibraryBook(
  input: UpsertLibraryBookInput,
): Promise<LibraryBookRecord> {
  if (!isValidSyncKey(input.syncKey)) {
    throw new Error("Invalid syncKey");
  }
  if (!isValidFormat(input.format)) {
    throw new Error("Invalid format");
  }
  if (!input.title.trim()) {
    throw new Error("Invalid title");
  }

  await ensureIndexes();
  const db = await getDb();
  const now = new Date();
  const existing = await db
    .collection<LibraryBookDocument>(LIBRARY_COLLECTION)
    .findOne({ syncKey: input.syncKey });

  const addedAt = existing?.addedAt ?? now;
  const doc: LibraryBookDocument = {
    syncKey: input.syncKey,
    title: input.title.trim(),
    author: input.author?.trim() || undefined,
    format: input.format,
    fileSize: input.fileSize,
    addedAt,
    updatedAt: now,
  };

  await db.collection<LibraryBookDocument>(LIBRARY_COLLECTION).updateOne(
    { syncKey: input.syncKey },
    { $set: doc },
    { upsert: true },
  );

  return toRecord(doc);
}

export async function deleteLibraryBook(syncKey: string): Promise<boolean> {
  if (!isValidSyncKey(syncKey)) return false;

  await ensureIndexes();
  const db = await getDb();
  const existing = await db
    .collection<LibraryBookDocument>(LIBRARY_COLLECTION)
    .findOne({ syncKey });

  if (!existing) return false;

  await db.collection(LIBRARY_COLLECTION).deleteOne({ syncKey });
  await unlink(getBookFilePath(syncKey, existing.format)).catch(() => undefined);
  return true;
}

export function validateSyncKeyParam(value: string): string | null {
  return isValidSyncKey(value) ? value : null;
}

export function getContentType(format: BookFormat): string {
  return format === "txt" ? "text/plain; charset=utf-8" : "application/epub+zip";
}

export function getBookExtensionForFormat(format: BookFormat): string {
  return getBookExtension(format);
}
