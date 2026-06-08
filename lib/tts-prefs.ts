import type { TTSMode } from "./types";

const MODE_KEY = "ebook-reader-tts-mode";
const SYSTEM_VOICE_KEY = "ebook-reader-system-voice";
const ONLINE_VOICE_KEY = "ebook-reader-online-voice";

export function getSavedTTSMode(): TTSMode {
  if (typeof window === "undefined") return "online";
  const saved = localStorage.getItem(MODE_KEY);
  return saved === "system" ? "system" : "online";
}

export function saveTTSMode(mode: TTSMode): void {
  localStorage.setItem(MODE_KEY, mode);
}

export function getSavedSystemVoice(): string | null {
  return localStorage.getItem(SYSTEM_VOICE_KEY);
}

export function saveSystemVoice(uri: string): void {
  localStorage.setItem(SYSTEM_VOICE_KEY, uri);
}

export function getSavedOnlineVoice(): string | null {
  return localStorage.getItem(ONLINE_VOICE_KEY);
}

export function saveOnlineVoice(id: string): void {
  localStorage.setItem(ONLINE_VOICE_KEY, id);
}
