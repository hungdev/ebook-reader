"use client";

import { useState } from "react";
import { detectPlatform } from "@/lib/tts";
import type { OnlineVoiceOption, SpeechVoiceOption, TTSMode } from "@/lib/types";

interface TTSControlsProps {
  mode: TTSMode;
  onModeChange: (mode: TTSMode) => void;
  systemVoices: SpeechVoiceOption[];
  selectedVoiceURI: string;
  onSystemVoiceChange: (uri: string) => void;
  onlineVoices: OnlineVoiceOption[];
  selectedVoiceId: string;
  onOnlineVoiceChange: (id: string) => void;
  rate: number;
  onRateChange: (rate: number) => void;
  isPlaying: boolean;
  isPaused: boolean;
  isLoading?: boolean;
  isLoadingVoices?: boolean;
  error?: string | null;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRefreshVoices?: () => void;
}

function getVoiceLabel(
  mode: TTSMode,
  onlineVoices: OnlineVoiceOption[],
  selectedVoiceId: string,
  systemVoices: SpeechVoiceOption[],
  selectedVoiceURI: string,
): string {
  if (mode === "online") {
    return onlineVoices.find((v) => v.id === selectedVoiceId)?.label ?? "Giọng AI";
  }
  return (
    systemVoices.find((v) => v.voice.voiceURI === selectedVoiceURI)?.label ??
    "Giọng máy"
  );
}

export function TTSControls({
  mode,
  onModeChange,
  systemVoices,
  selectedVoiceURI,
  onSystemVoiceChange,
  onlineVoices,
  selectedVoiceId,
  onOnlineVoiceChange,
  rate,
  onRateChange,
  isPlaying,
  isPaused,
  isLoading,
  isLoadingVoices,
  error,
  onPlay,
  onPause,
  onResume,
  onStop,
  onRefreshVoices,
}: TTSControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const platform = detectPlatform();
  const voiceLabel = getVoiceLabel(
    mode,
    onlineVoices,
    selectedVoiceId,
    systemVoices,
    selectedVoiceURI,
  );

  const statusLabel = error
    ? "Lỗi"
    : isLoading
      ? "Đang tải..."
      : isPlaying
        ? isPaused
          ? "Tạm dừng"
          : "Đang đọc"
        : "Sẵn sàng";

  return (
    <div className={`tts-player${expanded ? " tts-player--expanded" : ""}`}>
      {expanded && (
        <div className="tts-player__panel" id="tts-settings-panel">
          <div className="tts-player__segmented" role="group" aria-label="Chế độ giọng">
            <button
              type="button"
              className={
                mode === "online"
                  ? "tts-player__segment tts-player__segment--active"
                  : "tts-player__segment"
              }
              onClick={() => onModeChange("online")}
            >
              AI trực tuyến
            </button>
            <button
              type="button"
              className={
                mode === "system"
                  ? "tts-player__segment tts-player__segment--active"
                  : "tts-player__segment"
              }
              onClick={() => onModeChange("system")}
            >
              Giọng máy
            </button>
          </div>

          <div className="tts-player__field">
            <label className="tts-player__field-label" htmlFor="tts-voice">
              Giọng đọc
            </label>
            {mode === "online" ? (
              <select
                id="tts-voice"
                className="tts-player__select"
                value={selectedVoiceId}
                onChange={(e) => onOnlineVoiceChange(e.target.value)}
              >
                {onlineVoices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label} ({voice.gender})
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="tts-voice"
                className="tts-player__select"
                value={selectedVoiceURI}
                onChange={(e) => onSystemVoiceChange(e.target.value)}
                disabled={isLoadingVoices || systemVoices.length === 0}
              >
                {isLoadingVoices && <option value="">Đang tải...</option>}
                {!isLoadingVoices && systemVoices.length === 0 && (
                  <option value="">Không có giọng</option>
                )}
                {systemVoices.map(({ voice, label, isSiri, isEnhanced }) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {isSiri ? "Siri · " : isEnhanced ? "✦ " : ""}
                    {label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="tts-player__field">
            <div className="tts-player__field-row">
              <label className="tts-player__field-label" htmlFor="tts-rate">
                Tốc độ
              </label>
              <span className="tts-player__rate-value">{rate.toFixed(1)}x</span>
            </div>
            <input
              id="tts-rate"
              type="range"
              className="tts-player__range"
              min={0.5}
              max={2}
              step={0.1}
              value={rate}
              onChange={(e) => onRateChange(parseFloat(e.target.value))}
            />
          </div>

          {mode === "system" && onRefreshVoices && (
            <button
              type="button"
              className="tts-player__link"
              onClick={onRefreshVoices}
              disabled={isLoadingVoices}
            >
              Làm mới danh sách giọng
            </button>
          )}

          {mode === "online" && (
            <p className="tts-player__note">
              Giọng AI tự nhiên hơn — cần internet.
            </p>
          )}

          {mode === "system" && platform === "ios" && (
            <p className="tts-player__note">
              iPhone không hỗ trợ Siri trong web. Dùng chế độ AI để nghe tốt hơn.
            </p>
          )}

          {error && (
            <p className="tts-player__error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="tts-player__bar">
        <div className="tts-player__transport">
          {!isPlaying ? (
            <button
              type="button"
              className="tts-player__btn tts-player__btn--primary"
              onClick={onPlay}
              disabled={isLoading}
              aria-label="Đọc"
            >
              {isLoading ? "…" : "▶"}
            </button>
          ) : isPaused ? (
            <button
              type="button"
              className="tts-player__btn tts-player__btn--primary"
              onClick={onResume}
              aria-label="Tiếp tục"
            >
              ▶
            </button>
          ) : (
            <button
              type="button"
              className="tts-player__btn tts-player__btn--secondary"
              onClick={onPause}
              aria-label="Tạm dừng"
            >
              ⏸
            </button>
          )}
          {isPlaying && (
            <button
              type="button"
              className="tts-player__btn tts-player__btn--ghost"
              onClick={onStop}
              aria-label="Dừng"
            >
              ⏹
            </button>
          )}
        </div>

        <button
          type="button"
          className="tts-player__info"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="tts-settings-panel"
        >
          <span className="tts-player__status">{statusLabel}</span>
          <span className={`tts-player__meta${error ? " tts-player__meta--error" : ""}`}>
            {error ? error : `${voiceLabel} · ${rate.toFixed(1)}x`}
          </span>
        </button>

        <button
          type="button"
          className="tts-player__toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Thu gọn cài đặt" : "Mở cài đặt"}
        >
          {expanded ? "▾" : "▴"}
        </button>
      </div>
    </div>
  );
}
