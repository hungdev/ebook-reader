"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSharedAudio, unlockAudioPlayback } from "@/lib/audio-unlock";
import {
  enqueueTTSRequest,
  fetchWithRetry,
} from "@/lib/tts-request-queue";
import {
  findChunkForSentence,
  groupSentencesIntoChunks,
  ONLINE_VOICES,
  splitIntoSentences,
} from "@/lib/tts";
import {
  getSavedOnlineVoice,
  getSavedRate,
  saveOnlineVoice,
  saveRate,
} from "@/lib/tts-prefs";
import type { SpeechChunk } from "@/lib/types";

export interface SpeakOptions {
  chunkIndex?: number;
}

interface UseOnlineSpeechOptions {
  onSentenceChange?: (index: number) => void;
  onChunkStart?: (chunkIndex: number, sentenceIndex: number) => void;
  onComplete?: () => void;
}

const PREFETCH_AHEAD = 2;

export function useOnlineSpeech(options: UseOnlineSpeechOptions = {}) {
  const [selectedVoiceId, setSelectedVoiceIdState] = useState(
    () => getSavedOnlineVoice() ?? "vi-VN-HoaiMyNeural",
  );
  const [rate, setRateState] = useState(() => getSavedRate());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [highlightEndIndex, setHighlightEndIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const chunksRef = useRef<SpeechChunk[]>([]);
  const rateRef = useRef(rate);
  const voiceRef = useRef(selectedVoiceId);
  const stoppedRef = useRef(false);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const prefetchMapRef = useRef<Map<number, string>>(new Map());
  const prefetchingRef = useRef<Set<number>>(new Set());
  const inflightRef = useRef<Map<number, Promise<string>>>(new Map());
  const playingChunkIndexRef = useRef<number | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    voiceRef.current = selectedVoiceId;
  }, [selectedVoiceId]);

  const setSelectedVoiceId = useCallback((id: string) => {
    setSelectedVoiceIdState(id);
    saveOnlineVoice(id);
  }, []);

  const applyPlaybackRate = useCallback((value: number) => {
    getSharedAudio().playbackRate = value;
  }, []);

  const setRate = useCallback(
    (value: number) => {
      setRateState(value);
      rateRef.current = value;
      saveRate(value);
      applyPlaybackRate(value);
    },
    [applyPlaybackRate],
  );

  const revokeBlob = useCallback((url: string) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(url);
    }
  }, []);

  const clearPrefetch = useCallback(() => {
    prefetchMapRef.current.forEach((url) => revokeBlob(url));
    prefetchMapRef.current.clear();
    prefetchingRef.current.clear();
  }, [revokeBlob]);

  const revokeAllBlobs = useCallback(() => {
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlsRef.current.clear();
    clearPrefetch();
  }, [clearPrefetch]);

  const requestAudio = useCallback(async (text: string): Promise<string> => {
    const response = await fetchWithRetry("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: voiceRef.current,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(
        (data as { error?: string }).error ?? "Không tạo được giọng đọc",
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    blobUrlsRef.current.add(url);
    return url;
  }, []);

  const fetchChunkAudio = useCallback(
    (chunkIndex: number): Promise<string> => {
      const cached = prefetchMapRef.current.get(chunkIndex);
      if (cached) {
        prefetchMapRef.current.delete(chunkIndex);
        return Promise.resolve(cached);
      }

      const inflight = inflightRef.current.get(chunkIndex);
      if (inflight) return inflight;

      const text = chunksRef.current[chunkIndex]?.text;
      if (!text) {
        return Promise.reject(new Error("Không tìm thấy đoạn cần đọc"));
      }

      const promise = enqueueTTSRequest(() => requestAudio(text)).finally(
        () => {
          inflightRef.current.delete(chunkIndex);
        },
      );

      inflightRef.current.set(chunkIndex, promise);
      return promise;
    },
    [requestAudio],
  );

  const prefetchChunks = useCallback(
    (currentChunkIndex: number) => {
      const chunks = chunksRef.current;
      for (let offset = 1; offset <= PREFETCH_AHEAD; offset += 1) {
        const chunkIndex = currentChunkIndex + offset;
        if (chunkIndex >= chunks.length) break;
        if (
          prefetchMapRef.current.has(chunkIndex) ||
          prefetchingRef.current.has(chunkIndex)
        ) {
          continue;
        }

        prefetchingRef.current.add(chunkIndex);
        void fetchChunkAudio(chunkIndex)
          .then((url) => {
            prefetchingRef.current.delete(chunkIndex);
            if (stoppedRef.current) {
              revokeBlob(url);
              return;
            }
            const existing = prefetchMapRef.current.get(chunkIndex);
            if (existing) revokeBlob(existing);
            prefetchMapRef.current.set(chunkIndex, url);
          })
          .catch(() => {
            prefetchingRef.current.delete(chunkIndex);
          });
      }
    },
    [fetchChunkAudio, revokeBlob],
  );

  const takeChunkUrl = useCallback(
    async (chunkIndex: number): Promise<string> => {
      for (const [index, url] of prefetchMapRef.current.entries()) {
        if (index !== chunkIndex) {
          revokeBlob(url);
          prefetchMapRef.current.delete(index);
        }
      }

      return fetchChunkAudio(chunkIndex);
    },
    [fetchChunkAudio, revokeBlob],
  );

  const playUrl = useCallback(
    (
      url: string,
      chunkIndex: number,
      chunk: SpeechChunk,
      onStart: () => void,
    ): Promise<void> =>
      new Promise((resolve, reject) => {
        const audio = getSharedAudio();

        const cleanup = () => {
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
        };

        const onEnded = () => {
          cleanup();
          revokeBlob(url);
          resolve();
        };

        const onError = () => {
          cleanup();
          revokeBlob(url);
          reject(
            new Error("Không phát được âm thanh. Hãy nhấn Đọc lại."),
          );
        };

        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);
        audio.volume = 1;
        audio.playbackRate = rateRef.current;
        audio.src = url;
        void audio
          .play()
          .then(() => {
            playingChunkIndexRef.current = chunkIndex;
            setCurrentSentenceIndex(chunk.startIndex);
            setHighlightEndIndex(chunk.endIndex);
            onStart();
          })
          .catch((err: Error) => {
            cleanup();
            revokeBlob(url);
            reject(err);
          });
      }),
    [revokeBlob],
  );

  const playNextRef = useRef<(chunkIndex: number) => void>(() => {});

  const playChunk = useCallback(
    async (chunkIndex: number) => {
      if (stoppedRef.current) return;

      const chunks = chunksRef.current;
      if (chunkIndex >= chunks.length) {
        setIsPlaying(false);
        setIsPaused(false);
        setIsLoading(false);
        optionsRef.current.onComplete?.();
        return;
      }

      const chunk = chunks[chunkIndex];
      setError(null);

      const hasCached = prefetchMapRef.current.has(chunkIndex);
      if (!hasCached) setIsLoading(true);

      try {
        const url = await takeChunkUrl(chunkIndex);
        if (stoppedRef.current) {
          revokeBlob(url);
          return;
        }

        setIsLoading(false);
        prefetchChunks(chunkIndex);
        await playUrl(url, chunkIndex, chunk, () => {
          optionsRef.current.onChunkStart?.(
            chunkIndex,
            chunk.startIndex,
          );
          optionsRef.current.onSentenceChange?.(chunk.startIndex);
        });

        if (!stoppedRef.current) {
          playNextRef.current(chunkIndex + 1);
        }
      } catch (err) {
        if (!stoppedRef.current) {
          const message =
            err instanceof Error ? err.message : "Lỗi đọc thành tiếng";
          setError(message);
          setIsPlaying(false);
          setIsPaused(false);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [playUrl, prefetchChunks, revokeBlob, takeChunkUrl],
  );

  useEffect(() => {
    playNextRef.current = (chunkIndex: number) => {
      void playChunk(chunkIndex);
    };
  }, [playChunk]);

  const speak = useCallback(
    (text: string, startIndex = 0, speakOptions?: SpeakOptions) => {
      const sentences = splitIntoSentences(text);
      if (sentences.length === 0) return;

      unlockAudioPlayback();

      stoppedRef.current = true;
      const audio = getSharedAudio();
      audio.pause();
      revokeAllBlobs();

      const chunks = groupSentencesIntoChunks(sentences);
      const chunkIndex =
        speakOptions?.chunkIndex ??
        Math.max(0, findChunkForSentence(chunks, startIndex));

      stoppedRef.current = false;
      setError(null);
      chunksRef.current = chunks;
      setIsPlaying(true);
      setIsPaused(false);

      void playChunk(chunkIndex);
    },
    [playChunk, revokeAllBlobs],
  );

  const pause = useCallback(() => {
    const audio = getSharedAudio();
    if (!audio.paused && audio.src) {
      audio.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    const audio = getSharedAudio();
    if (audio.paused && audio.src) {
      unlockAudioPlayback();
      audio.volume = 1;
      audio.playbackRate = rateRef.current;
      void audio.play().then(() => setIsPaused(false));
    }
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    const audio = getSharedAudio();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    revokeAllBlobs();
    inflightRef.current.clear();
    setIsPlaying(false);
    setIsPaused(false);
    setIsLoading(false);
    playingChunkIndexRef.current = null;
    setCurrentSentenceIndex(0);
    setHighlightEndIndex(0);
  }, [revokeAllBlobs]);

  const getPlayingChunkIndex = useCallback(
    () => playingChunkIndexRef.current,
    [],
  );

  useEffect(() => () => stop(), [stop]);

  return {
    voices: ONLINE_VOICES,
    selectedVoiceId,
    setSelectedVoiceId,
    rate,
    setRate,
    isPlaying,
    isPaused,
    isLoading,
    currentSentenceIndex,
    highlightEndIndex,
    error,
    speak,
    getPlayingChunkIndex,
    pause,
    resume,
    stop,
  };
}
