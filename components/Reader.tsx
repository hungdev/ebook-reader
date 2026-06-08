"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { unlockAudioPlayback } from "@/lib/audio-unlock";
import { splitIntoSentences } from "@/lib/tts";
import {
  getSavedTTSMode,
  saveTTSMode,
} from "@/lib/tts-prefs";
import type { Book, ReadingProgress, TTSMode } from "@/lib/types";
import { TTSControls } from "./TTSControls";
import { useOnlineSpeech } from "@/hooks/useOnlineSpeech";
import { useSpeech } from "@/hooks/useSpeech";

interface ReaderProps {
  book: Book;
  onBack: () => void;
  onProgressChange: (
    progress: ReadingProgress,
    immediate?: boolean,
  ) => void;
}

export function Reader({ book, onBack, onProgressChange }: ReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const autoContinueRef = useRef(false);
  const speakNextChapterRef = useRef(false);
  const progressRef = useRef(book.progress);
  const scrollObserverRef = useRef<IntersectionObserver | null>(null);

  const [ttsMode, setTTSMode] = useState<TTSMode>(() => getSavedTTSMode());
  const [showResumePrompt, setShowResumePrompt] = useState(
    () => book.progress.wasListening === true,
  );

  const chapterIndex = book.progress.chapterIndex;
  const chapter = book.chapters[chapterIndex];

  const sentences = useMemo(
    () => (chapter ? splitIntoSentences(chapter.content) : []),
    [chapter],
  );

  useEffect(() => {
    progressRef.current = book.progress;
  }, [book.progress]);

  const saveProgress = useCallback(
    (
      nextChapterIndex: number,
      sentenceIndex: number,
      options?: { wasListening?: boolean; immediate?: boolean },
    ) => {
      const progress: ReadingProgress = {
        chapterIndex: nextChapterIndex,
        sentenceIndex,
        wasListening:
          options?.wasListening ?? progressRef.current.wasListening,
      };
      progressRef.current = progress;
      onProgressChange(progress, options?.immediate);
    },
    [onProgressChange],
  );

  const scrollToSentence = useCallback((index: number, smooth = true) => {
    const el = contentRef.current?.querySelector(
      `[data-sentence="${index}"]`,
    );
    el?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "center",
    });
  }, []);

  useEffect(() => {
    scrollObserverRef.current?.disconnect();
    scrollObserverRef.current = null;

    const container = contentRef.current;
    if (!container || sentences.length === 0) return;

    const targetIndex = Math.min(
      book.progress.sentenceIndex,
      sentences.length - 1,
    );

    const timer = window.setTimeout(() => {
      scrollToSentence(targetIndex, false);

      const observer = new IntersectionObserver(
        (entries) => {
          if (autoContinueRef.current) return;

          let bestIndex = -1;
          let bestRatio = 0;

          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const index = Number.parseInt(
              (entry.target as HTMLElement).dataset.sentence ?? "-1",
              10,
            );
            if (index < 0) continue;
            if (entry.intersectionRatio >= bestRatio) {
              bestRatio = entry.intersectionRatio;
              bestIndex = index;
            }
          }

          if (bestIndex >= 0) {
            saveProgress(chapterIndex, bestIndex, { wasListening: false });
          }
        },
        { threshold: [0.35, 0.5, 0.75] },
      );

      container.querySelectorAll("[data-sentence]").forEach((el) => {
        observer.observe(el);
      });
      scrollObserverRef.current = observer;
    }, 150);

    return () => {
      window.clearTimeout(timer);
      scrollObserverRef.current?.disconnect();
      scrollObserverRef.current = null;
    };
  }, [
    book.id,
    book.progress.sentenceIndex,
    chapterIndex,
    saveProgress,
    sentences.length,
    scrollToSentence,
  ]);

  const handleSentenceChange = useCallback(
    (index: number) => {
      saveProgress(chapterIndex, index, {
        wasListening: true,
        immediate: true,
      });
      scrollToSentence(index);
    },
    [chapterIndex, saveProgress, scrollToSentence],
  );

  const handleComplete = useCallback(() => {
    if (autoContinueRef.current && chapterIndex < book.chapters.length - 1) {
      speakNextChapterRef.current = true;
      saveProgress(chapterIndex + 1, 0, {
        wasListening: true,
        immediate: true,
      });
    } else {
      autoContinueRef.current = false;
      saveProgress(chapterIndex, progressRef.current.sentenceIndex, {
        wasListening: false,
        immediate: true,
      });
    }
  }, [book.chapters.length, chapterIndex, saveProgress]);

  const systemSpeech = useSpeech({
    onSentenceChange: handleSentenceChange,
    onComplete: handleComplete,
  });

  const onlineSpeech = useOnlineSpeech({
    onSentenceChange: handleSentenceChange,
    onComplete: handleComplete,
  });

  const activeSpeech = ttsMode === "online" ? onlineSpeech : systemSpeech;

  const stopSystem = systemSpeech.stop;
  const stopOnline = onlineSpeech.stop;

  useEffect(
    () => () => {
      stopSystem();
      stopOnline();
    },
    [stopSystem, stopOnline],
  );

  useEffect(() => {
    if (!activeSpeech.isPlaying) return;

    const interval = window.setInterval(() => {
      saveProgress(
        progressRef.current.chapterIndex,
        activeSpeech.currentSentenceIndex,
        { wasListening: true, immediate: true },
      );
    }, 3000);

    return () => window.clearInterval(interval);
  }, [
    activeSpeech.isPlaying,
    activeSpeech.currentSentenceIndex,
    saveProgress,
  ]);

  const startPlayback = useCallback(
    (sentenceIndex?: number) => {
      if (!chapter) return;

      const startAt = sentenceIndex ?? progressRef.current.sentenceIndex;
      autoContinueRef.current = true;
      setShowResumePrompt(false);

      saveProgress(chapterIndex, startAt, {
        wasListening: true,
        immediate: true,
      });

      if (ttsMode === "online") {
        unlockAudioPlayback();
      }

      activeSpeech.speak(chapter.content, startAt);
    },
    [activeSpeech, chapter, chapterIndex, saveProgress, ttsMode],
  );

  const handleModeChange = (mode: TTSMode) => {
    autoContinueRef.current = false;
    speakNextChapterRef.current = false;
    activeSpeech.stop();
    setTTSMode(mode);
    saveTTSMode(mode);
  };

  const handleStop = useCallback(() => {
    saveProgress(chapterIndex, activeSpeech.currentSentenceIndex, {
      wasListening: false,
      immediate: true,
    });
    autoContinueRef.current = false;
    speakNextChapterRef.current = false;
    setShowResumePrompt(false);
    stopSystem();
    stopOnline();
  }, [
    activeSpeech.currentSentenceIndex,
    chapterIndex,
    saveProgress,
    stopOnline,
    stopSystem,
  ]);

  const handlePlay = () => {
    startPlayback();
  };

  const goToChapter = (index: number) => {
    autoContinueRef.current = false;
    speakNextChapterRef.current = false;
    setShowResumePrompt(false);
    activeSpeech.stop();
    saveProgress(index, 0, { wasListening: false, immediate: true });
  };

  const handleBack = () => {
    saveProgress(
      progressRef.current.chapterIndex,
      progressRef.current.sentenceIndex,
      { wasListening: false, immediate: true },
    );
    onBack();
  };

  const onlineSpeak = onlineSpeech.speak;
  const systemSpeak = systemSpeech.speak;

  useEffect(() => {
    if (!speakNextChapterRef.current || !chapter) return;

    speakNextChapterRef.current = false;
    if (ttsMode === "online") {
      unlockAudioPlayback();
      onlineSpeak(chapter.content, 0);
    } else {
      systemSpeak(chapter.content, 0);
    }
  }, [chapterIndex, chapter, ttsMode, onlineSpeak, systemSpeak]);

  if (!chapter) {
    return (
      <div className="reader">
        <button type="button" className="btn btn--ghost" onClick={handleBack}>
          ← Thư viện
        </button>
        <p>Không tìm thấy chương.</p>
      </div>
    );
  }

  const resumeSentence = Math.min(
    book.progress.sentenceIndex + 1,
    sentences.length,
  );

  return (
    <div className="reader">
      <header className="reader__header">
        <button type="button" className="btn btn--ghost" onClick={handleBack}>
          ← Thư viện
        </button>
        <div className="reader__meta">
          <h1 className="reader__title">{book.title}</h1>
          {book.author && (
            <p className="reader__author">{book.author}</p>
          )}
        </div>
      </header>

      {book.chapters.length > 1 && (
        <nav className="reader__chapters">
          <label className="reader__chapters-label">
            Chương
            <select
              className="reader__chapters-select"
              value={chapterIndex}
              onChange={(e) => goToChapter(parseInt(e.target.value, 10))}
            >
              {book.chapters.map((ch, i) => (
                <option key={ch.id} value={i}>
                  {ch.title}
                </option>
              ))}
            </select>
          </label>
        </nav>
      )}

      {showResumePrompt && (
        <button
          type="button"
          className="reader__resume-banner"
          onClick={() => startPlayback(book.progress.sentenceIndex)}
        >
          <span className="reader__resume-banner-icon">▶</span>
          <span>
            Tiếp tục nghe từ câu {resumeSentence}
            <span className="reader__resume-banner-hint">
              iPhone cần bấm để phát lại sau khi refresh
            </span>
          </span>
        </button>
      )}

      <article className="reader__content" ref={contentRef}>
        <h2 className="reader__chapter-title">{chapter.title}</h2>
        <div className="reader__text">
          {sentences.map((sentence, i) => (
            <span
              key={i}
              data-sentence={i}
              className={
                i === book.progress.sentenceIndex &&
                !activeSpeech.isPlaying
                  ? "reader__sentence reader__sentence--resume"
                  : activeSpeech.isPlaying &&
                      i >= activeSpeech.currentSentenceIndex &&
                      i <= activeSpeech.highlightEndIndex
                    ? "reader__sentence reader__sentence--active"
                    : "reader__sentence"
              }
              onClick={() => {
                autoContinueRef.current = false;
                speakNextChapterRef.current = false;
                setShowResumePrompt(false);
                activeSpeech.stop();
                saveProgress(chapterIndex, i, {
                  wasListening: false,
                  immediate: true,
                });
              }}
            >
              {sentence}{" "}
            </span>
          ))}
        </div>
      </article>

      <footer className="reader__footer">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={chapterIndex === 0}
          onClick={() => goToChapter(chapterIndex - 1)}
        >
          ← Chương trước
        </button>
        <span className="reader__progress">
          {chapterIndex + 1} / {book.chapters.length}
        </span>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={chapterIndex >= book.chapters.length - 1}
          onClick={() => goToChapter(chapterIndex + 1)}
        >
          Chương sau →
        </button>
      </footer>

      <TTSControls
        mode={ttsMode}
        onModeChange={handleModeChange}
        systemVoices={systemSpeech.voices}
        selectedVoiceURI={systemSpeech.selectedVoiceURI}
        onSystemVoiceChange={systemSpeech.setSelectedVoiceURI}
        onlineVoices={onlineSpeech.voices}
        selectedVoiceId={onlineSpeech.selectedVoiceId}
        onOnlineVoiceChange={onlineSpeech.setSelectedVoiceId}
        rate={activeSpeech.rate}
        onRateChange={activeSpeech.setRate}
        isPlaying={activeSpeech.isPlaying}
        isPaused={activeSpeech.isPaused}
        isLoading={ttsMode === "online" ? onlineSpeech.isLoading : false}
        isLoadingVoices={systemSpeech.isLoadingVoices}
        error={ttsMode === "online" ? onlineSpeech.error : null}
        onPlay={handlePlay}
        onPause={activeSpeech.pause}
        onResume={activeSpeech.resume}
        onStop={handleStop}
        onRefreshVoices={systemSpeech.refreshVoices}
      />
    </div>
  );
}
