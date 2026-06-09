"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getFileExtension,
  isUploadExtension,
  needsConversion,
} from "@/lib/book-formats";
import { convertToEpub } from "@/lib/convert-client";
import { parseEpub, parseTxt } from "@/lib/epub";
import { flushProgressSave, scheduleProgressSave } from "@/lib/progress-save";
import {
  clearLastBookId,
  getLastBookId,
  saveLastBookId,
} from "@/lib/reading-session";
import {
  deleteBook,
  getAllBooks,
  getBook,
  saveBook,
} from "@/lib/storage";
import { generateId } from "@/lib/id";
import type { Book, ReadingProgress } from "@/lib/types";
import { Library } from "./Library";
import { Reader } from "./Reader";

export function EbookApp() {
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const activeBookIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeBookIdRef.current = activeBook?.id ?? null;
  }, [activeBook?.id]);

  useEffect(() => {
    const init = async () => {
      const loaded = await getAllBooks();
      setBooks(loaded);

      const lastBookId = getLastBookId();
      if (lastBookId) {
        const fresh = await getBook(lastBookId);
        if (fresh) {
          setActiveBook(fresh);
        } else {
          clearLastBookId();
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
        let format: Book["format"] = "epub";

        if (ext === "epub") {
          parsed = await parseEpub(await file.arrayBuffer());
        } else if (ext === "txt" || ext === "text") {
          parsed = await parseTxt(await file.arrayBuffer(), file.name);
          format = "txt";
        } else if (needsConversion(ext)) {
          const epubBuffer = await convertToEpub(file);
          parsed = await parseEpub(epubBuffer);
        } else {
          errors.push(`"${file.name}": định dạng không hỗ trợ`);
          continue;
        }

        const book: Book = {
          id: generateId(),
          title: parsed.title,
          author: parsed.author,
          format,
          chapters: parsed.chapters,
          addedAt: Date.now(),
          progress: { chapterIndex: 0, sentenceIndex: 0 },
        };

        await saveBook(book);
        newBooks.push(book);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Không đọc được file";
        errors.push(`"${file.name}": ${message}`);
      }
    }

    if (newBooks.length > 0) {
      setBooks((prev) => [...newBooks, ...prev]);
    }

    if (errors.length > 0) {
      setUploadError(errors.join("\n"));
    }

    setIsUploading(false);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setActiveBook((prev) => (prev?.id === id ? null : prev));
    if (getLastBookId() === id) {
      clearLastBookId();
    }
  }, []);

  const handleOpen = useCallback(async (book: Book) => {
    const fresh = await getBook(book.id);
    const opened: Book = fresh ?? book;
    saveLastBookId(opened.id);
    setActiveBook(opened);
  }, []);

  const handleBack = useCallback(async () => {
    await flushProgressSave();
    clearLastBookId();
    setActiveBook(null);
  }, []);

  const handleProgressChange = useCallback(
    (progress: ReadingProgress, immediate = false) => {
      const bookId = activeBookIdRef.current;
      if (!bookId) return;

      setActiveBook((prev) =>
        prev ? { ...prev, progress } : prev,
      );
      setBooks((prev) =>
        prev.map((b) => (b.id === bookId ? { ...b, progress } : b)),
      );
      scheduleProgressSave(bookId, progress, immediate);
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
        <p>Đang tải thư viện...</p>
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
