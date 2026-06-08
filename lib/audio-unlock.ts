const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let sharedAudio: HTMLAudioElement | null = null;
let unlocked = false;

export function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
    sharedAudio.setAttribute("playsinline", "true");
    sharedAudio.setAttribute("webkit-playsinline", "true");
  }
  return sharedAudio;
}

export function unlockAudioPlayback(): void {
  const audio = getSharedAudio();

  if (unlocked) return;

  audio.volume = 0.01;
  audio.src = SILENT_WAV;
  audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
      unlocked = true;
    })
    .catch(() => {});
}

export function resetAudioUnlock(): void {
  unlocked = false;
}
