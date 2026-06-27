import { Communicate } from "edge-tts-universal";
import { formatRateForEdge, ONLINE_VOICES } from "@/lib/tts";

export const DEFAULT_ONLINE_VOICE = "vi-VN-HoaiMyNeural";
export const MAX_TTS_TEXT_LENGTH = 5000;
const MAX_ATTEMPTS = 4;

export function isValidOnlineVoice(voice: string): boolean {
  return ONLINE_VOICES.some((item) => item.id === voice);
}

export function resolveOnlineVoice(voice?: string): string {
  if (voice && isValidOnlineVoice(voice)) {
    return voice;
  }
  return DEFAULT_ONLINE_VOICE;
}

export async function synthesizeSpeechMp3(
  text: string,
  voice: string,
  rate = 1,
): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("INVALID_TEXT");
  }

  if (trimmed.length > MAX_TTS_TEXT_LENGTH) {
    throw new Error("TEXT_TOO_LONG");
  }

  let lastError = "TTS failed";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }

    try {
      const communicate = new Communicate(trimmed, {
        voice,
        rate: formatRateForEdge(rate),
      });

      const chunks: Buffer[] = [];
      for await (const chunk of communicate.stream()) {
        if (chunk.type === "audio" && chunk.data) {
          chunks.push(chunk.data);
        }
      }

      if (chunks.length === 0) {
        throw new Error("No audio received");
      }

      return Buffer.concat(chunks);
    } catch (err) {
      lastError = err instanceof Error ? err.message : "TTS failed";
    }
  }

  throw new Error(lastError);
}
