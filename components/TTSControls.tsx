"use client";

import { detectPlatform } from "@/lib/tts";
import type { SpeechVoiceOption } from "@/lib/types";

interface TTSControlsProps {
  voices: SpeechVoiceOption[];
  selectedVoiceURI: string;
  onVoiceChange: (uri: string) => void;
  rate: number;
  onRateChange: (rate: number) => void;
  isPlaying: boolean;
  isPaused: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function TTSControls({
  voices,
  selectedVoiceURI,
  onVoiceChange,
  rate,
  onRateChange,
  isPlaying,
  isPaused,
  onPlay,
  onPause,
  onResume,
  onStop,
}: TTSControlsProps) {
  const platform = detectPlatform();
  const siriVoices = voices.filter((v) => v.isSiri);

  return (
    <div className="tts-controls">
      <div className="tts-controls__header">
        <span className="tts-controls__title">Đọc thành tiếng</span>
        {platform === "ios" && (
          <span className="tts-controls__badge">iOS — Giọng Siri khả dụng</span>
        )}
      </div>

      {platform === "ios" && siriVoices.length === 0 && (
        <p className="tts-controls__hint">
          Để dùng giọng Siri: Cài đặt → Trợ năng → Nội dung được đọc → Giọng
          nói → tải giọng Siri (Tiếng Việt hoặc Tiếng Anh).
        </p>
      )}

      <div className="tts-controls__row">
        <label className="tts-controls__label">
          Giọng đọc
          <select
            className="tts-controls__select"
            value={selectedVoiceURI}
            onChange={(e) => onVoiceChange(e.target.value)}
          >
            {voices.length === 0 && (
              <option value="">Đang tải giọng...</option>
            )}
            {voices.map(({ voice, label, isSiri, isEnhanced }) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {isSiri ? "🎙 " : isEnhanced ? "✨ " : ""}
                {label} ({voice.lang})
              </option>
            ))}
          </select>
        </label>

        <label className="tts-controls__label">
          Tốc độ: {rate.toFixed(1)}x
          <input
            type="range"
            className="tts-controls__range"
            min={0.5}
            max={2}
            step={0.1}
            value={rate}
            onChange={(e) => onRateChange(parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div className="tts-controls__buttons">
        {!isPlaying ? (
          <button type="button" className="btn btn--primary" onClick={onPlay}>
            ▶ Đọc
          </button>
        ) : isPaused ? (
          <button type="button" className="btn btn--primary" onClick={onResume}>
            ▶ Tiếp tục
          </button>
        ) : (
          <button type="button" className="btn btn--secondary" onClick={onPause}>
            ⏸ Tạm dừng
          </button>
        )}
        {isPlaying && (
          <button type="button" className="btn btn--ghost" onClick={onStop}>
            ⏹ Dừng
          </button>
        )}
      </div>
    </div>
  );
}
