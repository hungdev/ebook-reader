const SYNC_USER_KEY = "ebook-reader-sync-user-id";
const SHARED_SYNC_USER_ID = process.env.NEXT_PUBLIC_SYNC_USER_ID?.trim();

export function getSyncUserId(): string {
  if (SHARED_SYNC_USER_ID) return SHARED_SYNC_USER_ID;

  const existing = localStorage.getItem(SYNC_USER_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(SYNC_USER_KEY, id);
  return id;
}
