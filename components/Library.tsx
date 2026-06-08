"use client";

import { formatReadingProgress, getReadingPercent } from "@/lib/progress";
import type { Book } from "@/lib/types";

interface LibraryProps {
  books: Book[];
  onOpen: (book: Book) => void;
  onDelete: (id: string) => void;
  onUpload: (files: FileList) => void;
  isUploading: boolean;
  uploadError: string | null;
  onDismissError: () => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function Library({
  books,
  onOpen,
  onDelete,
  onUpload,
  isUploading,
  uploadError,
  onDismissError,
}: LibraryProps) {
  return (
    <div className="library">
      <header className="library__header">
        <div>
          <h1 className="library__title">Thư viện sách</h1>
          <p className="library__subtitle">
            Tải ebook từ máy cá nhân — hỗ trợ EPUB và TXT
          </p>
        </div>
        <label className="btn btn--primary library__upload">
          {isUploading ? "Đang xử lý..." : "+ Thêm sách"}
          <input
            type="file"
            accept=".epub,.txt,.text"
            multiple
            className="sr-only"
            disabled={isUploading}
            onChange={(e) => {
              if (e.target.files?.length) onUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </header>

      {uploadError && (
        <div className="library__error" role="alert">
          <p className="library__error-title">Không thể thêm sách</p>
          <pre className="library__error-message">{uploadError}</pre>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onDismissError}
          >
            Đóng
          </button>
        </div>
      )}

      {books.length === 0 ? (
        <div className="library__empty">
          <div className="library__empty-icon">📚</div>
          <h2>Chưa có sách nào</h2>
          <p>Nhấn &quot;Thêm sách&quot; để tải file EPUB hoặc TXT từ máy bạn.</p>
        </div>
      ) : (
        <ul className="library__list">
          {books.map((book) => {
            const resumeLabel = formatReadingProgress(book);
            const percent = getReadingPercent(book);

            return (
            <li key={book.id} className="library__item">
              <button
                type="button"
                className="library__item-main"
                onClick={() => onOpen(book)}
              >
                <span className="library__item-format">
                  {book.format.toUpperCase()}
                </span>
                <div className="library__item-info">
                  <span className="library__item-title">{book.title}</span>
                  {book.author && (
                    <span className="library__item-author">{book.author}</span>
                  )}
                  <span className="library__item-meta">
                    {book.chapters.length} chương · {formatDate(book.addedAt)}
                  </span>
                  {resumeLabel && (
                    <span className="library__item-resume">{resumeLabel}</span>
                  )}
                  {percent > 0 && (
                    <span
                      className="library__item-progress-bar"
                      style={{ width: `${percent}%` }}
                    />
                  )}
                </div>
              </button>
              <button
                type="button"
                className="library__item-delete"
                onClick={() => onDelete(book.id)}
                aria-label={`Xóa ${book.title}`}
              >
                ✕
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
