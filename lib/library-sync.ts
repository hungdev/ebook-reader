import { parseEpub, parseTxt } from "./epub";
import {
  downloadBookFile,
  fetchBookCatalog,
  type LibraryBookRecord,
} from "./library-client";
import {
  deleteBooksNotIn,
  getAllBooks,
  getBook,
  saveBook,
} from "./storage";
import type { Book, ReadingProgress } from "./types";

function isCacheFresh(
  cached: Book,
  remoteUpdatedAt: number,
): boolean {
  return (
    cached.chapters.length > 0 &&
    (cached.sourceUpdatedAt ?? 0) >= remoteUpdatedAt
  );
}

async function hydrateBookFromFile(
  meta: LibraryBookRecord,
  buffer: ArrayBuffer,
  progress: ReadingProgress,
): Promise<Book> {
  const parsed =
    meta.format === "txt"
      ? await parseTxt(buffer, meta.title)
      : await parseEpub(buffer);

  const parsedAuthor =
    "author" in parsed && typeof parsed.author === "string"
      ? parsed.author
      : undefined;

  return {
    id: meta.syncKey,
    syncKey: meta.syncKey,
    title: meta.title,
    author: meta.author ?? parsedAuthor,
    format: meta.format,
    chapters: parsed.chapters,
    addedAt: meta.addedAt,
    progress,
    sourceUpdatedAt: meta.updatedAt,
    cachedAt: Date.now(),
  };
}

async function loadBookFromRemote(
  meta: LibraryBookRecord,
  existingProgress?: ReadingProgress,
): Promise<Book> {
  const buffer = await downloadBookFile(meta.syncKey, meta.format);
  const progress = existingProgress ?? {
    chapterIndex: 0,
    sentenceIndex: 0,
  };

  return hydrateBookFromFile(meta, buffer, progress);
}

export async function syncLibraryFromServer(): Promise<{
  books: Book[];
  synced: boolean;
}> {
  const catalog = await fetchBookCatalog();
  if (!catalog) {
    return { books: await getAllBooks(), synced: false };
  }

  const remoteKeys = catalog.map((book) => book.syncKey);
  const books: Book[] = [];

  for (const meta of catalog) {
    const cached = await getBook(meta.syncKey);

    if (cached && isCacheFresh(cached, meta.updatedAt)) {
      books.push(cached);
      continue;
    }

    try {
      const book = await loadBookFromRemote(meta, cached?.progress);
      await saveBook(book);
      books.push(book);
    } catch {
      if (cached) {
        books.push(cached);
      }
    }
  }

  await deleteBooksNotIn(remoteKeys);
  books.sort((a, b) => b.addedAt - a.addedAt);
  return { books, synced: true };
}

export async function cacheUploadedBook(
  meta: LibraryBookRecord,
  chapters: Book["chapters"],
  author?: string,
): Promise<Book> {
  const book: Book = {
    id: meta.syncKey,
    syncKey: meta.syncKey,
    title: meta.title,
    author: author ?? meta.author,
    format: meta.format,
    chapters,
    addedAt: meta.addedAt,
    progress: { chapterIndex: 0, sentenceIndex: 0 },
    sourceUpdatedAt: meta.updatedAt,
    cachedAt: Date.now(),
  };

  await saveBook(book);
  return book;
}

export { hydrateBookFromFile, loadBookFromRemote };
