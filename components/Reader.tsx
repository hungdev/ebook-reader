"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { splitIntoSentences } from "@/lib/tts";
import type { Book } from "@/lib/types";
import { TTSControls } from "./TTSControls";
import { useSpeech } from "@/hooks/useSpeech";

interface ReaderProps {
  book: Book;
  onBack: () => void;
  onProgressChange: (
    chapterIndex: number,
    sentenceIndex: number,
  ) => void;
}

export function Reader({ book, onBack, onProgressChange }: ReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const chapterIndex = book.progress.chapterIndex;
  const chapter = book.chapters[chapterIndex];

  const sentences = useMemo(
    () => (chapter ? splitIntoSentences(chapter.content) : []),
    [chapter],
  );

  const handleSentenceChange = useCallback(
    (index: number) => {
      onProgressChange(chapterIndex, index);
      const el = contentRef.current?.querySelector(
        `[data-sentence="${index}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [chapterIndex, onProgressChange],
  );

  const {
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
  } = useSpeech({
    onSentenceChange: handleSentenceChange,
    onComplete: () => {
      if (chapterIndex < book.chapters.length - 1) {
        onProgressChange(chapterIndex + 1, 0);
      }
    },
  });

  useEffect(() => () => stop(), [stop]);

  const handlePlay = () => {
    if (!chapter) return;
    speak(chapter.content, book.progress.sentenceIndex);
  };

  const goToChapter = (index: number) => {
    stop();
    onProgressChange(index, 0);
  };

  if (!chapter) {
    return (
      <div className="reader">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Thư viện
        </button>
        <p>Không tìm thấy chương.</p>
      </div>
    );
  }

  return (
    <div className="reader">
      <header className="reader__header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
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

      <TTSControls
        voices={voices}
        selectedVoiceURI={selectedVoiceURI}
        onVoiceChange={setSelectedVoiceURI}
        rate={rate}
        onRateChange={setRate}
        isPlaying={isPlaying}
        isPaused={isPaused}
        onPlay={handlePlay}
        onPause={pause}
        onResume={resume}
        onStop={stop}
      />

      <article className="reader__content" ref={contentRef}>
        <h2 className="reader__chapter-title">{chapter.title}</h2>
        <div className="reader__text">
          {sentences.map((sentence, i) => (
            <span
              key={i}
              data-sentence={i}
              className={
                isPlaying && currentSentenceIndex === i
                  ? "reader__sentence reader__sentence--active"
                  : "reader__sentence"
              }
              onClick={() => {
                stop();
                onProgressChange(chapterIndex, i);
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
    </div>
  );
}
