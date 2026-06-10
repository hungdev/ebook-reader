import type { Book } from "./types";

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeBookSyncKey(
  book: Pick<Book, "title" | "author" | "chapters">,
): Promise<string> {
  const firstChapter = book.chapters[0];
  const sample = firstChapter?.content.slice(0, 4096) ?? "";
  const payload = [
    book.title.trim().toLowerCase(),
    (book.author ?? "").trim().toLowerCase(),
    String(book.chapters.length),
    sample,
  ].join("\0");

  const hash = await sha256(payload);
  return hash.slice(0, 32);
}

export async function getBookSyncKey(book: Book): Promise<string> {
  if (book.syncKey) return book.syncKey;
  return computeBookSyncKey(book);
}
