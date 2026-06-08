"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const indexRef = useRef(0);
  const rateRef = useRef(rate);
  const voiceRef = useRef(selectedVoiceId);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stoppedRef = useRef(false);
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

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src.startsWith("blob:")) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      audioRef.current = null;
    }
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
    return URL.createObjectURL(blob);
  }, []);

  const playNextRef = useRef<(index: number) => Promise<void>>(async () => {});

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

      indexRef.current = index;
      setCurrentSentenceIndex(index);
      optionsRef.current.onSentenceChange?.(index);
      setIsLoading(true);
      setError(null);

      try {
        cleanupAudio();
        const url = await fetchAudio(sentences[index]);
        if (stoppedRef.current) {
          URL.revokeObjectURL(url);
          return;
        }

        const audio = new Audio(url);
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Không phát được âm thanh"));
          };
          audio.play().catch(reject);
        });

        if (!stoppedRef.current) {
          await playNextRef.current(index + 1);
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
    [cleanupAudio, fetchAudio],
  );

  useEffect(() => {
    playNextRef.current = playFromIndex;
  }, [playFromIndex]);

  const speak = useCallback(
    async (text: string, startIndex = 0) => {
      const sentences = splitIntoSentences(text);
      if (sentences.length === 0) return;

      stoppedRef.current = true;
      cleanupAudio();
      stoppedRef.current = false;
      setError(null);
      sentencesRef.current = sentences;
      setIsPlaying(true);
      setIsPaused(false);
      await playFromIndex(startIndex);
    },
    [cleanupAudio, playFromIndex],
  );

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current?.paused) {
      audioRef.current.play();
      setIsPaused(false);
    }
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    cleanupAudio();
    setIsPlaying(false);
    setIsPaused(false);
    setIsLoading(false);
    indexRef.current = 0;
    setCurrentSentenceIndex(0);
  }, [cleanupAudio]);

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
