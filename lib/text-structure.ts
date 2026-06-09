import type { SpeechChunk } from "./types";

export function splitParagraphIntoSentences(paragraph: string): string[] {
  const normalized = paragraph.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const parts = normalized.split(
    /(?<=[.!?…])\s+(?=[A-ZÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ"'])/u,
  );

  if (parts.length <= 1) {
    return normalized
      .split(/[,;]\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return parts.map((s) => s.trim()).filter(Boolean);
}

export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

export function splitIntoSentences(text: string): string[] {
  return splitIntoParagraphs(text).flatMap(splitParagraphIntoSentences);
}

export function structureChapterParagraphs(text: string): string[][] {
  return splitIntoParagraphs(text).map(splitParagraphIntoSentences);
}

export function groupParagraphsIntoChunks(
  paragraphs: string[][],
  maxChars = 700,
): SpeechChunk[] {
  const chunks: SpeechChunk[] = [];
  let offset = 0;

  for (const para of paragraphs) {
    let i = 0;
    while (i < para.length) {
      let text = para[i];
      let end = i;

      while (
        end + 1 < para.length &&
        text.length + para[end + 1].length + 1 <= maxChars
      ) {
        end += 1;
        text += ` ${para[end]}`;
      }

      chunks.push({
        text,
        startIndex: offset + i,
        endIndex: offset + end,
      });
      i = end + 1;
    }
    offset += para.length;
  }

  return chunks;
}

export function buildChapterChunks(
  text: string,
  maxChars = 700,
): SpeechChunk[] {
  return groupParagraphsIntoChunks(
    structureChapterParagraphs(text),
    maxChars,
  );
}
