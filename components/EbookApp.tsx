"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseEpub, parseTxt } from "@/lib/epub";
import { flushProgressSave, scheduleProgressSave } from "@/lib/progress-save";
import {
  deleteBook,
  getAllBooks,
  getBook,
  saveBook,
} from "@/lib/storage";
import type { Book } from "@/lib/types";
import { Library } from "./Library";
import { Reader } from "./Reader";

function generateId(): string {
  return crypto.randomUUID();
}

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
    getAllBooks().then((loaded) => {
      setBooks(loaded);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    const handleUnload = () => {
      void flushProgressSave();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  const handleUpload = useCallback(async (files: FileList) => {
    setIsUploading(true);
    setUploadError(null);
    const newBooks: Book[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["epub", "txt", "text"].includes(ext)) {
        errors.push(`"${file.name}": định dạng không hỗ trợ`);
        continue;
      }

      try {
        const buffer = await file.arrayBuffer();
        let parsed: {
          title: string;
          author?: string;
          chapters: Book["chapters"];
        };

        if (ext === "epub") {
          parsed = await parseEpub(buffer);
        } else {
          parsed = await parseTxt(buffer, file.name);
        }

        const book: Book = {
          id: generateId(),
          title: parsed.title,
          author: parsed.author,
          format: ext === "epub" ? "epub" : "txt",
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
  }, []);

  const handleOpen = useCallback(async (book: Book) => {
    const fresh = await getBook(book.id);
    setActiveBook(fresh ?? book);
  }, []);

  const handleBack = useCallback(async () => {
    await flushProgressSave();
    setActiveBook(null);
  }, []);

  const handleProgressChange = useCallback(
    (chapterIndex: number, sentenceIndex: number) => {
      const bookId = activeBookIdRef.current;
      if (!bookId) return;

      const progress = { chapterIndex, sentenceIndex };

      setActiveBook((prev) =>
        prev ? { ...prev, progress } : prev,
      );
      setBooks((prev) =>
        prev.map((b) => (b.id === bookId ? { ...b, progress } : b)),
      );
      scheduleProgressSave(bookId, progress);
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
