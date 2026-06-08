"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSharedAudio, unlockAudioPlayback } from "@/lib/audio-unlock";
import { ONLINE_VOICES, splitIntoSentences } from "@/lib/tts";
import {
  getSavedOnlineVoice,
  saveOnlineVoice,
} from "@/lib/tts-prefs";

interface UseOnlineSpeechOptions {
  onSentenceChange?: (index: number) => void;
  onComplete?: () => void;
}

export function useOnlineSpeech(options: UseOnlineSpeechOptions = {}) {
  const [selectedVoiceId, setSelectedVoiceIdState] = useState(
    () => getSavedOnlineVoice() ?? "vi-VN-HoaiMyNeural",
  );
  const [rate, setRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sentencesRef = useRef<string[]>([]);
  const rateRef = useRef(rate);
  const voiceRef = useRef(selectedVoiceId);
  const stoppedRef = useRef(false);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const prefetchRef = useRef<{ index: number; url: string } | null>(null);
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

  const revokeBlob = useCallback((url: string) => {
    if (url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(url);
    }
  }, []);

  const revokeAllBlobs = useCallback(() => {
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlsRef.current.clear();
    prefetchRef.current = null;
  }, []);

  const fetchAudio = useCallback(async (text: string): Promise<string> => {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: voiceRef.current,
        rate: rateRef.current,
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

  const prefetchSentence = useCallback(
    (index: number) => {
      const sentences = sentencesRef.current;
      if (index >= sentences.length) return;

      void fetchAudio(sentences[index]).then((url) => {
        if (stoppedRef.current) {
          revokeBlob(url);
          return;
        }
        if (prefetchRef.current?.index === index) {
          revokeBlob(prefetchRef.current.url);
        }
        prefetchRef.current = { index, url };
      });
    },
    [fetchAudio, revokeBlob],
  );

  const getAudioUrl = useCallback(
    async (index: number): Promise<string> => {
      const cached = prefetchRef.current;
      if (cached?.index === index) {
        prefetchRef.current = null;
        return cached.url;
      }
      if (cached) {
        revokeBlob(cached.url);
        prefetchRef.current = null;
      }
      return fetchAudio(sentencesRef.current[index]);
    },
    [fetchAudio, revokeBlob],
  );

  const playUrl = useCallback(
    (url: string): Promise<void> =>
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
            new Error(
              "Không phát được âm thanh. Hãy nhấn Đọc lại.",
            ),
          );
        };

        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);
        audio.src = url;
        audio.load();
        audio.play().catch((err: Error) => {
          cleanup();
          revokeBlob(url);
          reject(err);
        });
      }),
    [revokeBlob],
  );

  const playNextRef = useRef<(index: number) => void>(() => {});

  const playFromIndex = useCallback(
    async (index: number) => {
      if (stoppedRef.current) return;

      const sentences = sentencesRef.current;
      if (index >= sentences.length) {
        setIsPlaying(false);
        setIsPaused(false);
        setIsLoading(false);
        optionsRef.current.onComplete?.();
        return;
      }

      setCurrentSentenceIndex(index);
      optionsRef.current.onSentenceChange?.(index);
      setIsLoading(index === 0 || !prefetchRef.current);
      setError(null);

      try {
        const url = await getAudioUrl(index);
        if (stoppedRef.current) {
          revokeBlob(url);
          return;
        }

        prefetchSentence(index + 1);
        setIsLoading(false);

        await playUrl(url);

        if (!stoppedRef.current) {
          playNextRef.current(index + 1);
        }
      } catch (err) {
        if (!stoppedRef.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Lỗi đọc thành tiếng";
          setError(message);
          setIsPlaying(false);
          setIsPaused(false);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [getAudioUrl, playUrl, prefetchSentence, revokeBlob],
  );

  useEffect(() => {
    playNextRef.current = (index: number) => {
      void playFromIndex(index);
    };
  }, [playFromIndex]);

  const speak = useCallback(
    (text: string, startIndex = 0) => {
      const sentences = splitIntoSentences(text);
      if (sentences.length === 0) return;

      unlockAudioPlayback();

      stoppedRef.current = true;
      const audio = getSharedAudio();
      audio.pause();
      revokeAllBlobs();

      stoppedRef.current = false;
      setError(null);
      sentencesRef.current = sentences;
      setIsPlaying(true);
      setIsPaused(false);

      void playFromIndex(startIndex);
    },
    [playFromIndex, revokeAllBlobs],
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
    setIsPlaying(false);
    setIsPaused(false);
    setIsLoading(false);
    setCurrentSentenceIndex(0);
  }, [revokeAllBlobs]);

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
    error,
    speak,
    pause,
    resume,
    stop,
  };
}
