import type { ReadingProgress } from "../types";

export interface SyncProgressEntry {
  bookKey: string;
  progress: ReadingProgress;
}

export interface SyncSession {
  lastBookKey: string;
  updatedAt: number;
}

export interface SyncState {
  progress: SyncProgressEntry[];
  session: SyncSession | null;
}

export interface SyncProgressUpdate {
  bookKey: string;
  progress: ReadingProgress;
}

export interface SyncSessionUpdate {
  lastBookKey: string;
  updatedAt: number;
}

export interface SyncPutBody {
  syncUserId: string;
  progress?: SyncProgressUpdate;
  session?: SyncSessionUpdate;
}
