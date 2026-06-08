export type BookFormat = "epub" | "txt";

export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export interface ReadingProgress {
  chapterIndex: number;
  sentenceIndex: number;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  chapters: Chapter[];
  addedAt: number;
  progress: ReadingProgress;
}

export type TTSMode = "system" | "online";

export interface SpeechVoiceOption {
  voice: SpeechSynthesisVoice;
  label: string;
  isSiri: boolean;
  isEnhanced: boolean;
}

export interface OnlineVoiceOption {
  id: string;
  label: string;
  lang: string;
  gender: string;
}
