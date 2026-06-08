"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyVoiceToUtterance,
  categorizeVoices,
  getDefaultVoice,
  loadVoicesReliably,
  splitIntoSentences,
  warmUpSpeechSynthesis,
} from "@/lib/tts";
import {
  getSavedSystemVoice,
  saveSystemVoice,
} from "@/lib/tts-prefs";
import type { SpeechVoiceOption } from "@/lib/types";

interface UseSpeechOptions {
  onSentenceChange?: (index: number) => void;
  onComplete?: () => void;
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const [voices, setVoices] = useState<SpeechVoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURIState] = useState("");
  const [rate, setRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);

  const sentencesRef = useRef<string[]>([]);
  const sentenceIndexRef = useRef(0);
  const rateRef = useRef(rate);
  const voiceURIRef = useRef(selectedVoiceURI);
  const warmedUpRef = useRef(false);
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

  const setSelectedVoiceURI = useCallback((uri: string) => {
    setSelectedVoiceURIState(uri);
    saveSystemVoice(uri);
  }, []);

  const refreshVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    if (!warmedUpRef.current) {
      warmUpSpeechSynthesis();
      warmedUpRef.current = true;
    }

    const available = await loadVoicesReliably();
    const categorized = categorizeVoices(available);
    setVoices(categorized);

    const saved = getSavedSystemVoice();
    const savedValid = saved && available.some((v) => v.voiceURI === saved);

    if (savedValid) {
      setSelectedVoiceURIState(saved);
    } else {
      const defaultVoice = getDefaultVoice(available);
      const uri = defaultVoice?.voiceURI ?? available[0]?.voiceURI ?? "";
      setSelectedVoiceURIState(uri);
      if (uri) saveSystemVoice(uri);
    }

    setIsLoadingVoices(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!warmedUpRef.current) {
        warmUpSpeechSynthesis();
        warmedUpRef.current = true;
      }

      const available = await loadVoicesReliably();
      if (cancelled) return;

      const categorized = categorizeVoices(available);
      setVoices(categorized);

      const saved = getSavedSystemVoice();
      const savedValid = saved && available.some((v) => v.voiceURI === saved);

      if (savedValid) {
        setSelectedVoiceURIState(saved);
      } else {
        const defaultVoice = getDefaultVoice(available);
        const uri = defaultVoice?.voiceURI ?? available[0]?.voiceURI ?? "";
        setSelectedVoiceURIState(uri);
        if (uri) saveSystemVoice(uri);
      }

      setIsLoadingVoices(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const speak = useCallback((text: string, startIndex = 0) => {
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) return;

    if (!warmedUpRef.current) {
      warmUpSpeechSynthesis();
      warmedUpRef.current = true;
    }

    speechSynthesis.cancel();

    sentencesRef.current = sentences;
    sentenceIndexRef.current = startIndex;
    setCurrentSentenceIndex(startIndex);
    setIsPlaying(true);
    setIsPaused(false);

    for (let i = startIndex; i < sentences.length; i++) {
      const utterance = new SpeechSynthesisUtterance(sentences[i]);
      applyVoiceToUtterance(utterance, voiceURIRef.current);
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

  return {
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    rate,
    setRate,
    isPlaying,
    isPaused,
    currentSentenceIndex,
    highlightEndIndex: currentSentenceIndex,
    isLoadingVoices,
    refreshVoices,
    speak,
    pause,
    resume,
    stop,
  };
}
