const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let sharedAudio: HTMLAudioElement | null = null;
let unlocked = false;

export function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.volume = 1;
    sharedAudio.preload = "auto";
    sharedAudio.setAttribute("playsinline", "true");
    sharedAudio.setAttribute("webkit-playsinline", "true");
  }
  sharedAudio.volume = 1;
  return sharedAudio;
}

export function unlockAudioPlayback(): void {
  if (unlocked) return;

  const unlockAudio = new Audio();
  unlockAudio.volume = 0.01;
  unlockAudio.src = SILENT_WAV;
  unlockAudio
    .play()
    .then(() => {
      unlockAudio.pause();
      unlocked = true;
    })
    .catch(() => {
      unlocked = true;
    });
}

export function resetAudioUnlock(): void {
  unlocked = false;
}
