import { groupSentencesIntoChunks, splitIntoSentences } from "./tts";
import type { ReadingProgress } from "./types";

export function getChunkSentenceIndex(
  sentences: string[],
  speechChunkIndex: number | undefined | null,
  fallback: number,
): number {
  if (speechChunkIndex == null) return fallback;
  const chunks = groupSentencesIntoChunks(sentences);
  const chunk = chunks[speechChunkIndex];
  return chunk ? chunk.startIndex : fallback;
}

export function normalizeProgressForChapter(
  chapterContent: string,
  progress: ReadingProgress,
): ReadingProgress {
  const sentences = splitIntoSentences(chapterContent);
  const sentenceIndex = getChunkSentenceIndex(
    sentences,
    progress.speechChunkIndex,
    progress.sentenceIndex,
  );
  return { ...progress, sentenceIndex };
}

export function hasSavedSpeechChunk(progress: ReadingProgress): boolean {
  return progress.speechChunkIndex != null;
}
