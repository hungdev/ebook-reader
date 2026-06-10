import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Book } from "./types";

interface EbookDB extends DBSchema {
  books: {
    key: string;
    value: Book;
    indexes: { "by-added": number };
  };
}

let dbPromise: Promise<IDBPDatabase<EbookDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<EbookDB>("ebook-reader", 1, {
      upgrade(db) {
        const store = db.createObjectStore("books", { keyPath: "id" });
        store.createIndex("by-added", "addedAt");
      },
    });
  }
  return dbPromise;
}

export async function getAllBooks(): Promise<Book[]> {
  const db = await getDB();
  const books = await db.getAllFromIndex("books", "by-added");
  return books.reverse();
}

export async function getBook(id: string): Promise<Book | undefined> {
  const db = await getDB();
  return db.get("books", id);
}

export async function saveBook(book: Book): Promise<void> {
  const db = await getDB();
  await db.put("books", book);
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("books", id);
}

export async function deleteBooksNotIn(ids: string[]): Promise<void> {
  const db = await getDB();
  const keep = new Set(ids);
  const all = await db.getAll("books");
  await Promise.all(
    all
      .filter((book) => !keep.has(book.id))
      .map((book) => db.delete("books", book.id)),
  );
}

export async function updateProgress(
  id: string,
  progress: Book["progress"],
): Promise<void> {
  const db = await getDB();
  const book = await db.get("books", id);
  if (!book) return;
  book.progress = progress;
  await db.put("books", book);
}
