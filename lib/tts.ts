import type { OnlineVoiceOption, SpeechChunk, SpeechVoiceOption } from "./types";

export const ONLINE_VOICES: OnlineVoiceOption[] = [
  {
    id: "vi-VN-HoaiMyNeural",
    label: "Hoài My",
    lang: "vi-VN",
    gender: "Nữ",
  },
  {
    id: "vi-VN-NamMinhNeural",
    label: "Nam Minh",
    lang: "vi-VN",
    gender: "Nam",
  },
  {
    id: "en-US-AriaNeural",
    label: "Aria",
    lang: "en-US",
    gender: "Nữ",
  },
  {
    id: "en-US-GuyNeural",
    label: "Guy",
    lang: "en-US",
    gender: "Nam",
  },
  {
    id: "fr-FR-DeniseNeural",
    label: "Denise",
    lang: "fr-FR",
    gender: "Nữ",
  },
];

export function splitIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
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

export function groupSentencesIntoChunks(
  sentences: string[],
  maxChars = 700,
): SpeechChunk[] {
  if (sentences.length === 0) return [];

  const chunks: SpeechChunk[] = [];
  let i = 0;

  while (i < sentences.length) {
    let text = sentences[i];
    const start = i;
    let end = i;

    while (
      end + 1 < sentences.length &&
      text.length + sentences[end + 1].length + 1 <= maxChars
    ) {
      end += 1;
      text += ` ${sentences[end]}`;
    }

    chunks.push({ text, startIndex: start, endIndex: end });
    i = end + 1;
  }

  return chunks;
}

export function findChunkForSentence(
  chunks: SpeechChunk[],
  sentenceIndex: number,
): number {
  return chunks.findIndex(
    (chunk) =>
      sentenceIndex >= chunk.startIndex && sentenceIndex <= chunk.endIndex,
  );
}

function isSiriVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  const uri =
    (voice as SpeechSynthesisVoice & { voiceURI?: string }).voiceURI?.toLowerCase() ??
    "";
  return (
    name.includes("siri") ||
    uri.includes("siri") ||
    uri.includes("ttsbundle.siri")
  );
}

function isEnhancedVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  return (
    name.includes("enhanced") ||
    name.includes("premium") ||
    name.includes("nâng cao") ||
    name.includes("nang cao")
  );
}

export function categorizeVoices(
  voices: SpeechSynthesisVoice[],
): SpeechVoiceOption[] {
  return voices
    .map((voice) => ({
      voice,
      label: voice.name,
      isSiri: isSiriVoice(voice),
      isEnhanced: isEnhancedVoice(voice),
    }))
    .sort((a, b) => {
      const aVi = a.voice.lang.startsWith("vi");
      const bVi = b.voice.lang.startsWith("vi");
      if (aVi !== bVi) return aVi ? -1 : 1;
      if (a.isSiri !== b.isSiri) return a.isSiri ? -1 : 1;
      if (a.isEnhanced !== b.isEnhanced) return a.isEnhanced ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}

export function getDefaultVoice(
  voices: SpeechSynthesisVoice[],
  lang = "vi-VN",
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const categorized = categorizeVoices(voices);

  const siriVi = categorized.find(
    (v) => v.isSiri && v.voice.lang.startsWith("vi"),
  );
  if (siriVi) return siriVi.voice;

  const viEnhanced = categorized.find(
    (v) => v.isEnhanced && v.voice.lang.startsWith("vi"),
  );
  if (viEnhanced) return viEnhanced.voice;

  const viVoice = voices.find((v) => v.lang.startsWith("vi"));
  if (viVoice) return viVoice;

  const langVoice = voices.find((v) => v.lang.startsWith(lang.split("-")[0]));
  if (langVoice) return langVoice;

  return voices[0];
}

export function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function getDefaultTTSMode(): "system" | "online" {
  return detectPlatform() === "ios" ? "online" : "online";
}

export function warmUpSpeechSynthesis(): void {
  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.volume = 0;
  utterance.rate = 10;
  speechSynthesis.speak(utterance);
}

export function applyVoiceToUtterance(
  utterance: SpeechSynthesisUtterance,
  voiceURI: string,
): void {
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.voiceURI === voiceURI);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
}

export function formatRateForEdge(rate: number): string {
  const percent = Math.round((rate - 1) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

export function loadVoicesReliably(timeout = 4000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const collected: SpeechSynthesisVoice[] = [];

    const check = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > collected.length) {
        collected.length = 0;
        collected.push(...voices);
      }
      if (collected.length > 0) resolve(collected);
    };

    const onChange = () => check();
    speechSynthesis.addEventListener("voiceschanged", onChange);
    check();

    const interval = setInterval(check, 250);
    const timers = [100, 500, 1000, 2000].map((ms) => setTimeout(check, ms));

    setTimeout(() => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
      speechSynthesis.removeEventListener("voiceschanged", onChange);
      resolve(collected.length > 0 ? collected : speechSynthesis.getVoices());
    }, timeout);
  });
}
