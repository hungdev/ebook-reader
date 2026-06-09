"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { unlockAudioPlayback } from "@/lib/audio-unlock";
import { flushProgressSave } from "@/lib/progress-save";
import {
  getChunkSentenceIndex,
  hasSavedSpeechChunk,
  normalizeProgressForChapter,
} from "@/lib/reading-progress";
import { formatChapterLabel } from "@/lib/epub";
import {
  buildChapterChunks,
  findChunkForSentence,
  structureChapterParagraphs,
} from "@/lib/tts";
import { ChapterToc } from "./ChapterToc";
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
  const scrollSaveTimerRef = useRef<number | null>(null);
  const chapterGuardUntilRef = useRef(0);
  const userScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef(false);
  const restoreProgressRef = useRef(book.progress);

  const [ttsMode, setTTSMode] = useState<TTSMode>(() => getSavedTTSMode());
  const [tocOpen, setTocOpen] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(
    () => book.progress.wasListening === true,
  );
  const showResumePromptRef = useRef(showResumePrompt);

  useEffect(() => {
    showResumePromptRef.current = showResumePrompt;
  }, [showResumePrompt]);

  const chapterIndex = book.progress.chapterIndex;
  const chapter = book.chapters[chapterIndex];

  const paragraphSentences = useMemo(
    () => (chapter ? structureChapterParagraphs(chapter.content) : []),
    [chapter],
  );

  const sentences = useMemo(
    () => paragraphSentences.flat(),
    [paragraphSentences],
  );

  const sentenceOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const para of paragraphSentences) {
      offsets.push(acc);
      acc += para.length;
    }
    return offsets;
  }, [paragraphSentences]);

  const chapterLabel = chapter
    ? formatChapterLabel(chapter, chapterIndex, book.title)
    : "";

  const resumeSentenceIndex = useMemo(
    () =>
      chapter
        ? getChunkSentenceIndex(
            chapter.content,
            book.progress.speechChunkIndex,
            book.progress.sentenceIndex,
          )
        : book.progress.sentenceIndex,
    [
      book.progress.sentenceIndex,
      book.progress.speechChunkIndex,
      chapter,
    ],
  );

  useEffect(() => {
    progressRef.current = book.progress;
  }, [book.progress]);

  useEffect(() => {
    restoreProgressRef.current = book.progress;
    chapterGuardUntilRef.current = Date.now() + 3000;
  }, [book.id, chapterIndex]);

  useEffect(() => {
    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      userScrollingRef.current = true;
      if (scrollIdleTimerRef.current) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }
      scrollIdleTimerRef.current = window.setTimeout(() => {
        userScrollingRef.current = false;
      }, 1000);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollIdleTimerRef.current) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }
    };
  }, [book.id, chapterIndex]);

  const saveProgress = useCallback(
    (
      nextChapterIndex: number,
      sentenceIndex: number,
      options?: {
        wasListening?: boolean;
        speechChunkIndex?: number | null;
        immediate?: boolean;
      },
    ) => {
      const progress: ReadingProgress = {
        chapterIndex: nextChapterIndex,
        sentenceIndex,
        wasListening:
          options?.wasListening ?? progressRef.current.wasListening,
      };

      if (options && "speechChunkIndex" in options) {
        if (options.speechChunkIndex == null) {
          delete progress.speechChunkIndex;
        } else {
          progress.speechChunkIndex = options.speechChunkIndex;
        }
      } else if (progressRef.current.speechChunkIndex != null) {
        progress.speechChunkIndex = progressRef.current.speechChunkIndex;
      }

      progressRef.current = progress;
      onProgressChange(progress, options?.immediate);
    },
    [onProgressChange],
  );

  const scrollToSentence = useCallback((index: number, smooth = true) => {
    programmaticScrollRef.current = true;
    const el = contentRef.current?.querySelector(
      `[data-sentence="${index}"]`,
    );
    el?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "center",
    });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 100);
  }, []);

  useEffect(() => {
    if (sentences.length === 0 || !chapter) return;

    const saved = restoreProgressRef.current;
    const targetIndex = Math.min(
      getChunkSentenceIndex(
        chapter.content,
        saved.speechChunkIndex,
        saved.sentenceIndex,
      ),
      sentences.length - 1,
    );

    const timer = window.setTimeout(() => {
      scrollToSentence(targetIndex, false);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [book.id, chapterIndex, sentences.length, scrollToSentence]);

  useEffect(() => {
    scrollObserverRef.current?.disconnect();
    scrollObserverRef.current = null;

    const container = contentRef.current;
    if (!container || sentences.length === 0) return;

    const timer = window.setTimeout(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (
            autoContinueRef.current ||
            showResumePromptRef.current ||
            hasSavedSpeechChunk(progressRef.current) ||
            (userScrollingRef.current && !programmaticScrollRef.current) ||
            Date.now() < chapterGuardUntilRef.current
          ) {
            return;
          }

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

          if (bestIndex < 0) return;

          if (scrollSaveTimerRef.current) {
            window.clearTimeout(scrollSaveTimerRef.current);
          }

          scrollSaveTimerRef.current = window.setTimeout(() => {
            const nextProgress: ReadingProgress = {
              ...progressRef.current,
              chapterIndex,
              sentenceIndex: bestIndex,
              wasListening: false,
            };
            progressRef.current = nextProgress;
            onProgressChange(nextProgress, false);
          }, 800);
        },
        { threshold: [0.5] },
      );

      container.querySelectorAll("[data-sentence]").forEach((el) => {
        observer.observe(el);
      });
      scrollObserverRef.current = observer;
    }, 500);

    return () => {
      window.clearTimeout(timer);
      if (scrollSaveTimerRef.current) {
        window.clearTimeout(scrollSaveTimerRef.current);
      }
      scrollObserverRef.current?.disconnect();
      scrollObserverRef.current = null;
    };
  }, [book.id, chapterIndex, onProgressChange, sentences.length]);

  const handleChunkStart = useCallback(
    (chunkIndex: number, sentenceIndex: number) => {
      saveProgress(chapterIndex, sentenceIndex, {
        wasListening: true,
        speechChunkIndex: chunkIndex,
        immediate: true,
      });
    },
    [chapterIndex, saveProgress],
  );

  const handleSentenceChange = useCallback(
    (index: number) => {
      scrollToSentence(index);
    },
    [scrollToSentence],
  );

  const handleComplete = useCallback(() => {
    if (autoContinueRef.current && chapterIndex < book.chapters.length - 1) {
      speakNextChapterRef.current = true;
      saveProgress(chapterIndex + 1, 0, {
        wasListening: true,
        speechChunkIndex: null,
        immediate: true,
      });
    } else {
      autoContinueRef.current = false;
      saveProgress(chapterIndex, progressRef.current.sentenceIndex, {
        wasListening: false,
        speechChunkIndex: null,
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
    onChunkStart: handleChunkStart,
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
      const speechChunkIndex =
        ttsMode === "online"
          ? onlineSpeech.getPlayingChunkIndex()
          : progressRef.current.speechChunkIndex;

      saveProgress(
        progressRef.current.chapterIndex,
        activeSpeech.currentSentenceIndex,
        {
          wasListening: true,
          speechChunkIndex: speechChunkIndex ?? null,
          immediate: true,
        },
      );
    }, 3000);

    return () => window.clearInterval(interval);
  }, [
    activeSpeech.isPlaying,
    activeSpeech.currentSentenceIndex,
    onlineSpeech,
    saveProgress,
    ttsMode,
  ]);

  const startPlayback = useCallback(
    (sentenceIndex?: number, resume = false) => {
      if (!chapter) return;

      const startAt = sentenceIndex ?? progressRef.current.sentenceIndex;
      const chunks = buildChapterChunks(chapter.content);
      let chunkIdx = findChunkForSentence(chunks, startAt);
      if (chunkIdx < 0) chunkIdx = 0;

      if (resume && progressRef.current.speechChunkIndex != null) {
        const saved = chunks[progressRef.current.speechChunkIndex];
        if (saved) chunkIdx = progressRef.current.speechChunkIndex;
      }

      autoContinueRef.current = true;
      setShowResumePrompt(false);

      saveProgress(chapterIndex, startAt, {
        wasListening: true,
        speechChunkIndex: chunkIdx,
        immediate: true,
      });

      if (ttsMode === "online") {
        unlockAudioPlayback();
        onlineSpeech.speak(chapter.content, startAt, {
          chunkIndex: chunkIdx,
        });
      } else {
        systemSpeech.speak(chapter.content, startAt);
      }
    },
    [chapter, chapterIndex, onlineSpeech, saveProgress, systemSpeech, ttsMode],
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
      speechChunkIndex: null,
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
    startPlayback(undefined, false);
  };

  const goToChapter = (index: number) => {
    autoContinueRef.current = false;
    speakNextChapterRef.current = false;
    setShowResumePrompt(false);
    activeSpeech.stop();
    chapterGuardUntilRef.current = Date.now() + 3000;
    saveProgress(index, 0, {
      wasListening: false,
      speechChunkIndex: null,
      immediate: true,
    });
  };

  const handleBack = async () => {
    if (scrollSaveTimerRef.current) {
      window.clearTimeout(scrollSaveTimerRef.current);
      scrollSaveTimerRef.current = null;
    }

    const chunkIdx =
      ttsMode === "online"
        ? onlineSpeech.getPlayingChunkIndex()
        : progressRef.current.speechChunkIndex;

    activeSpeech.stop();
    autoContinueRef.current = false;

    const rawProgress: ReadingProgress = {
      ...progressRef.current,
      wasListening: false,
      speechChunkIndex:
        chunkIdx ?? progressRef.current.speechChunkIndex ?? undefined,
    };

    const normalized = chapter
      ? normalizeProgressForChapter(chapter.content, rawProgress)
      : rawProgress;

    if (normalized.speechChunkIndex == null) {
      delete normalized.speechChunkIndex;
    }

    progressRef.current = normalized;
    onProgressChange(normalized, true);
    await flushProgressSave();
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

  const resumeSentence = Math.min(resumeSentenceIndex + 1, sentences.length);

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
        {book.chapters.length > 1 && (
          <button
            type="button"
            className="btn btn--ghost reader__toc-btn"
            onClick={() => setTocOpen(true)}
          >
            ☰ Mục lục
          </button>
        )}
      </header>

      <ChapterToc
        chapters={book.chapters}
        bookTitle={book.title}
        currentIndex={chapterIndex}
        open={tocOpen}
        onSelect={goToChapter}
        onClose={() => setTocOpen(false)}
      />

      {showResumePrompt && (
        <button
          type="button"
          className="reader__resume-banner"
          onClick={() => startPlayback(resumeSentenceIndex, true)}
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
        <h2 className="reader__chapter-title">{chapterLabel}</h2>
        <div className="reader__text">
          {paragraphSentences.map((paraSentences, pIdx) => (
            <p key={pIdx} className="reader__paragraph">
              {paraSentences.map((sentence, sIdx) => {
                const i = sentenceOffsets[pIdx] + sIdx;
                return (
                  <span
                    key={i}
                    data-sentence={i}
                    className={
                      i === resumeSentenceIndex && !activeSpeech.isPlaying
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
                        speechChunkIndex: null,
                        immediate: true,
                      });
                    }}
                  >
                    {sentence}{" "}
                  </span>
                );
              })}
            </p>
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
