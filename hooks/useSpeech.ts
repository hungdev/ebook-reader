"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  categorizeVoices,
  getDefaultVoice,
  splitIntoSentences,
} from "@/lib/tts";
import type { SpeechVoiceOption } from "@/lib/types";

interface UseSpeechOptions {
  onSentenceChange?: (index: number) => void;
  onComplete?: () => void;
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const [voices, setVoices] = useState<SpeechVoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const [rate, setRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);

  const sentencesRef = useRef<string[]>([]);
  const sentenceIndexRef = useRef(0);
  const rateRef = useRef(rate);
  const voiceURIRef = useRef(selectedVoiceURI);
  const onSentenceChangeRef = useRef(options.onSentenceChange);
  const onCompleteRef = useRef(options.onComplete);

  useEffect(() => {
    onSentenceChangeRef.current = options.onSentenceChange;
    onCompleteRef.current = options.onComplete;
  });

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    voiceURIRef.current = selectedVoiceURI;
  }, [selectedVoiceURI]);

  const loadVoices = useCallback(() => {
    const available = speechSynthesis.getVoices();
    if (available.length === 0) return;

    const categorized = categorizeVoices(available);
    setVoices(categorized);

    setSelectedVoiceURI((prev) => {
      if (prev && available.some((v) => v.voiceURI === prev)) return prev;
      const defaultVoice = getDefaultVoice(available);
      return defaultVoice?.voiceURI ?? available[0].voiceURI;
    });
  }, []);

  useEffect(() => {
    const handleVoicesChanged = () => loadVoices();

    handleVoicesChanged();
    speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    const timer = setTimeout(handleVoicesChanged, 500);

    return () => {
      speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      clearTimeout(timer);
      speechSynthesis.cancel();
    };
  }, [loadVoices]);

  const speak = useCallback((text: string, startIndex = 0) => {
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) return;

    speechSynthesis.cancel();

    sentencesRef.current = sentences;
    sentenceIndexRef.current = startIndex;
    setCurrentSentenceIndex(startIndex);
    setIsPlaying(true);
    setIsPaused(false);

    for (let i = startIndex; i < sentences.length; i++) {
      const utterance = new SpeechSynthesisUtterance(sentences[i]);
      const voice = speechSynthesis
        .getVoices()
        .find((v) => v.voiceURI === voiceURIRef.current);
      if (voice) utterance.voice = voice;

      utterance.rate = rateRef.current;
      utterance.pitch = 1;

      const index = i;
      utterance.onstart = () => {
        sentenceIndexRef.current = index;
        setCurrentSentenceIndex(index);
        onSentenceChangeRef.current?.(index);
      };

      if (i === sentences.length - 1) {
        utterance.onend = () => {
          setIsPlaying(false);
          setIsPaused(false);
          onCompleteRef.current?.();
        };
      }

      utterance.onerror = (event) => {
        if (event.error === "interrupted" || event.error === "canceled") return;
        setIsPlaying(false);
        setIsPaused(false);
      };

      speechSynthesis.speak(utterance);
    }
  }, []);

  const pause = useCallback(() => {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
      speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  const stop = useCallback(() => {
    speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    sentenceIndexRef.current = 0;
    setCurrentSentenceIndex(0);
  }, []);

  const getSentenceIndex = useCallback(() => sentenceIndexRef.current, []);

  return {
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    rate,
    setRate,
    isPlaying,
    isPaused,
    currentSentenceIndex,
    speak,
    pause,
    resume,
    stop,
    getSentenceIndex,
  };
}
