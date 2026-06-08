"use client";

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
  const platform = detectPlatform();
  const viSystemVoices = systemVoices.filter((v) =>
    v.voice.lang.startsWith("vi"),
  );

  return (
    <div className="tts-controls">
      <div className="tts-controls__header">
        <span className="tts-controls__title">Đọc thành tiếng</span>
        {mode === "online" && (
          <span className="tts-controls__badge">Giọng AI chất lượng cao</span>
        )}
      </div>

      <div className="tts-controls__mode">
        <label className="tts-controls__mode-option">
          <input
            type="radio"
            name="tts-mode"
            value="online"
            checked={mode === "online"}
            onChange={() => onModeChange("online")}
          />
          Trực tuyến (khuyên dùng)
        </label>
        <label className="tts-controls__mode-option">
          <input
            type="radio"
            name="tts-mode"
            value="system"
            checked={mode === "system"}
            onChange={() => onModeChange("system")}
          />
          Giọng hệ thống (offline)
        </label>
      </div>

      {mode === "online" ? (
        <p className="tts-controls__hint tts-controls__hint--positive">
          Giọng Hoài My / Nam Minh — tự nhiên hơn giọng Linh trên iPhone. Cần
          kết nối internet.
        </p>
      ) : platform === "ios" ? (
        <p className="tts-controls__hint">
          <strong>Lưu ý iPhone:</strong> Safari không cho web dùng giọng Siri.
          Trên iOS thường chỉ dùng được 1 giọng tiếng Việt (Linh). Để đổi giọng
          hệ thống: Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng
          Việt.
        </p>
      ) : null}

      {mode === "system" && platform === "ios" && viSystemVoices.length <= 1 && (
        <p className="tts-controls__hint">
          Chỉ thấy {viSystemVoices[0]?.label ?? "Linh"}? Đây là giới hạn của
          Safari trên iPhone — hãy chuyển sang chế độ &quot;Trực tuyến&quot; để
          có giọng đọc tự nhiên hơn.
        </p>
      )}

      <div className="tts-controls__row">
        {mode === "online" ? (
          <label className="tts-controls__label">
            Giọng đọc
            <select
              className="tts-controls__select"
              value={selectedVoiceId}
              onChange={(e) => onOnlineVoiceChange(e.target.value)}
            >
              {onlineVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label} ({voice.gender}) — {voice.lang}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="tts-controls__label">
            Giọng đọc
            <select
              className="tts-controls__select"
              value={selectedVoiceURI}
              onChange={(e) => onSystemVoiceChange(e.target.value)}
              disabled={isLoadingVoices || systemVoices.length === 0}
            >
              {isLoadingVoices && (
                <option value="">Đang tải giọng...</option>
              )}
              {!isLoadingVoices && systemVoices.length === 0 && (
                <option value="">Không có giọng</option>
              )}
              {systemVoices.map(({ voice, label, isSiri, isEnhanced }) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {isSiri ? "🎙 " : isEnhanced ? "✨ " : ""}
                  {label} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
        )}

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

      {mode === "system" && onRefreshVoices && (
        <button
          type="button"
          className="btn btn--ghost tts-controls__refresh"
          onClick={onRefreshVoices}
          disabled={isLoadingVoices}
        >
          {isLoadingVoices ? "Đang tải..." : "↻ Làm mới danh sách giọng"}
        </button>
      )}

      {error && (
        <p className="tts-controls__error" role="alert">
          {error}
        </p>
      )}

      <div className="tts-controls__buttons">
        {!isPlaying ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={onPlay}
            disabled={isLoading}
          >
            {isLoading ? "Đang tải..." : "▶ Đọc"}
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
