"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeBookSyncKey, getBookSyncKey } from "@/lib/book-sync-key";
import {
  getFileExtension,
  isUploadExtension,
  needsConversion,
} from "@/lib/book-formats";
import { convertToEpub } from "@/lib/convert-client";
import { parseEpub, parseTxt } from "@/lib/epub";
import { deleteRemoteBook, uploadBookToServer } from "@/lib/library-client";
import { cacheUploadedBook, syncLibraryFromServer } from "@/lib/library-sync";
import { flushProgressSave, scheduleProgressSave } from "@/lib/progress-save";
import { fetchSyncState } from "@/lib/progress-sync.client";
import {
  clearLastBookSession,
  getLastBookSession,
  getLegacyLastBookId,
  saveLastBookSession,
} from "@/lib/reading-session";
import { mergeRemoteSyncState } from "@/lib/sync-merge";
import {
  deleteBook,
  getBook,
  saveBook,
} from "@/lib/storage";
import type { Book, BookFormat, ReadingProgress } from "@/lib/types";
import { Library } from "./Library";
import { Reader } from "./Reader";

export function EbookApp() {
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Đang tải thư viện...");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const activeBookIdRef = useRef<string | null>(null);
  const activeBookKeyRef = useRef<string | null>(null);

  useEffect(() => {
    activeBookIdRef.current = activeBook?.id ?? null;
  }, [activeBook?.id]);

  useEffect(() => {
    if (!activeBook) {
      activeBookKeyRef.current = null;
      return;
    }

    void getBookSyncKey(activeBook).then((bookKey) => {
      activeBookKeyRef.current = bookKey;
    });
  }, [activeBook]);

  useEffect(() => {
    const init = async () => {
      setLoadingMessage("Đang đồng bộ thư viện...");
      const { books: syncedBooks } = await syncLibraryFromServer();
      let loaded = syncedBooks;

      setLoadingMessage("Đang đồng bộ vị trí đọc...");
      const remote = await fetchSyncState();
      if (remote) {
        const merged = await mergeRemoteSyncState(loaded, remote);
        loaded = merged.books;
      }

      setBooks(loaded);

      const legacyBookId = getLegacyLastBookId();
      const session = getLastBookSession();
      const resumeBookId = session?.bookId ?? legacyBookId;
      if (resumeBookId) {
        const fresh = loaded.find((book) => book.id === resumeBookId)
          ?? (await getBook(resumeBookId));
        if (fresh) {
          if (legacyBookId && !session) {
            const bookKey = await getBookSyncKey(fresh);
            saveLastBookSession(fresh.id, bookKey);
          }
          setActiveBook(fresh);
        } else {
          clearLastBookSession();
        }
      }

      setIsLoading(false);
    };

    void init();
  }, []);

  useEffect(() => {
    const saveOnExit = () => {
      void flushProgressSave();
    };

    window.addEventListener("pagehide", saveOnExit);
    window.addEventListener("beforeunload", saveOnExit);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        saveOnExit();
      }
    });

    return () => {
      window.removeEventListener("pagehide", saveOnExit);
      window.removeEventListener("beforeunload", saveOnExit);
    };
  }, []);

  const handleUpload = useCallback(async (files: FileList) => {
    setIsUploading(true);
    setUploadError(null);
    const newBooks: Book[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      const ext = getFileExtension(file.name);
      if (!ext || !isUploadExtension(ext)) {
        errors.push(`"${file.name}": định dạng không hỗ trợ`);
        continue;
      }

      try {
        let parsed: {
          title: string;
          author?: string;
          chapters: Book["chapters"];
        };
        let storedFormat: BookFormat = "epub";
        let uploadFile: File = file;

        if (ext === "epub") {
          parsed = await parseEpub(await file.arrayBuffer());
        } else if (ext === "txt" || ext === "text") {
          parsed = await parseTxt(await file.arrayBuffer(), file.name);
          storedFormat = "txt";
        } else if (needsConversion(ext)) {
          const epubBuffer = await convertToEpub(file);
          parsed = await parseEpub(epubBuffer);
          const safeName = file.name.replace(/\.[^.]+$/, "");
          uploadFile = new File([epubBuffer], `${safeName}.epub`, {
            type: "application/epub+zip",
          });
        } else {
          errors.push(`"${file.name}": định dạng không hỗ trợ`);
          continue;
        }

        const syncKey = await computeBookSyncKey({
          title: parsed.title,
          author: parsed.author,
          chapters: parsed.chapters,
        });

        const remoteMeta = await uploadBookToServer(uploadFile, {
          syncKey,
          title: parsed.title,
          author: parsed.author,
          format: storedFormat,
        });

        const existing = await getBook(syncKey);
        const book = await cacheUploadedBook(
          remoteMeta,
          parsed.chapters,
          parsed.author,
        );

        if (existing?.progress) {
          book.progress = existing.progress;
          await saveBook(book);
        }

        newBooks.push(book);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Không đọc được file";
        errors.push(`"${file.name}": ${message}`);
      }
    }

    if (newBooks.length > 0) {
      setBooks((prev) => {
        const incomingIds = new Set(newBooks.map((book) => book.id));
        return [...newBooks, ...prev.filter((book) => !incomingIds.has(book.id))];
      });
    }

    if (errors.length > 0) {
      setUploadError(errors.join("\n"));
    }

    setIsUploading(false);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteRemoteBook(id);
    } catch {
      // vẫn xóa cache local nếu server không phản hồi
    }

    await deleteBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setActiveBook((prev) => (prev?.id === id ? null : prev));
    if (getLastBookSession()?.bookId === id) {
      clearLastBookSession();
    }
  }, []);

  const handleOpen = useCallback(async (book: Book) => {
    const fresh = await getBook(book.id);
    const opened: Book = fresh ?? book;
    const bookKey = await getBookSyncKey(opened);
    saveLastBookSession(opened.id, bookKey);
    activeBookKeyRef.current = bookKey;
    setBooks((prev) =>
      prev.map((b) => (b.id === opened.id ? opened : b)),
    );
    setActiveBook(opened);
  }, []);

  const handleBack = useCallback(async () => {
    await flushProgressSave();
    clearLastBookSession();
    setActiveBook(null);
  }, []);

  const handleProgressChange = useCallback(
    (progress: ReadingProgress, immediate = false) => {
      const bookId = activeBookIdRef.current;
      const bookKey = activeBookKeyRef.current;
      if (!bookId || !bookKey) return;

      setActiveBook((prev) =>
        prev ? { ...prev, progress } : prev,
      );
      setBooks((prev) =>
        prev.map((b) => (b.id === bookId ? { ...b, progress } : b)),
      );
      scheduleProgressSave(bookId, bookKey, progress, immediate);
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
        <p>{loadingMessage}</p>
      </div>
    );
  }

  if (activeBook) {
    return (
      <Reader
        book={activeBook}
        onBack={handleBack}
        onProgressChange={handleProgressChange}
      />
    );
  }

  return (
    <Library
      books={books}
      onOpen={handleOpen}
      onDelete={handleDelete}
      onUpload={handleUpload}
      isUploading={isUploading}
      uploadError={uploadError}
      onDismissError={() => setUploadError(null)}
    />
  );
}
