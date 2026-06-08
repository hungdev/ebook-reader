import { splitIntoSentences } from "./tts";
import type { Book } from "./types";

export function hasReadingProgress(book: Book): boolean {
  return book.progress.chapterIndex > 0 || book.progress.sentenceIndex > 0;
}

export function formatReadingProgress(book: Book): string | null {
  if (!hasReadingProgress(book)) return null;

  const { chapterIndex, sentenceIndex } = book.progress;
  const chapter = book.chapters[chapterIndex];
  const chapterTitle = chapter?.title ?? `Chương ${chapterIndex + 1}`;
  const percent = getReadingPercent(book);

  if (sentenceIndex > 0) {
    return `Tiếp tục ${chapterTitle} · câu ${sentenceIndex + 1} (${percent}%)`;
  }

  return `Tiếp tục ${chapterTitle} (${percent}%)`;
}

export function getReadingPercent(book: Book): number {
  if (book.chapters.length === 0) return 0;

  const { chapterIndex, sentenceIndex } = book.progress;
  const chapter = book.chapters[chapterIndex];
  const sentences = chapter ? splitIntoSentences(chapter.content) : [];
  const sentenceFrac =
    sentences.length > 0 ? sentenceIndex / sentences.length : 0;

  return Math.min(
    100,
    Math.round(((chapterIndex + sentenceFrac) / book.chapters.length) * 100),
  );
}
