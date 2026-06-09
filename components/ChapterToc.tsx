"use client";

import { formatChapterLabel } from "@/lib/epub";
import type { Chapter } from "@/lib/types";

interface ChapterTocProps {
  chapters: Chapter[];
  bookTitle: string;
  currentIndex: number;
  open: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export function ChapterToc({
  chapters,
  bookTitle,
  currentIndex,
  open,
  onSelect,
  onClose,
}: ChapterTocProps) {
  if (!open) return null;

  return (
    <div className="chapter-toc">
      <button
        type="button"
        className="chapter-toc__backdrop"
        aria-label="Đóng mục lục"
        onClick={onClose}
      />
      <aside className="chapter-toc__panel">
        <header className="chapter-toc__header">
          <h2 className="chapter-toc__title">Mục lục</h2>
          <button
            type="button"
            className="chapter-toc__close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </header>
        <ol className="chapter-toc__list">
          {chapters.map((chapter, i) => {
            const label = formatChapterLabel(chapter, i, bookTitle);
            const isPart = /^(phần|part|book)\s/i.test(chapter.title);
            const level = chapter.tocLevel ?? 0;
            const isActive = i === currentIndex;

            return (
              <li key={chapter.id}>
                <button
                  type="button"
                  className={[
                    "chapter-toc__item",
                    isActive ? "chapter-toc__item--active" : "",
                    isPart ? "chapter-toc__item--part" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ paddingLeft: `${0.75 + level * 1}rem` }}
                  onClick={() => {
                    onSelect(i);
                    onClose();
                  }}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
