import { buildChapterChunks } from "./tts";
import type { ReadingProgress } from "./types";

export function getChunkSentenceIndex(
  chapterContent: string,
  speechChunkIndex: number | undefined | null,
  fallback: number,
): number {
  if (speechChunkIndex == null) return fallback;
  const chunks = buildChapterChunks(chapterContent);
  const chunk = chunks[speechChunkIndex];
  return chunk ? chunk.startIndex : fallback;
}

export function normalizeProgressForChapter(
  chapterContent: string,
  progress: ReadingProgress,
): ReadingProgress {
  const sentenceIndex = getChunkSentenceIndex(
    chapterContent,
    progress.speechChunkIndex,
    progress.sentenceIndex,
  );
  return { ...progress, sentenceIndex };
}

export function hasSavedSpeechChunk(progress: ReadingProgress): boolean {
  return progress.speechChunkIndex != null;
}
