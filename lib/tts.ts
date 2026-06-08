import type { SpeechVoiceOption } from "./types";

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

function isSiriVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  const uri = (voice as SpeechSynthesisVoice & { voiceURI?: string }).voiceURI?.toLowerCase() ?? "";
  return name.includes("siri") || uri.includes("siri");
}

function isEnhancedVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  return (
    name.includes("enhanced") ||
    name.includes("premium") ||
    name.includes("nâng cao") ||
    voice.localService === true
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

  const siriAny = categorized.find((v) => v.isSiri);
  if (siriAny) return siriAny.voice;

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
