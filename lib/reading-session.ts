const LAST_BOOK_KEY = "ebook-reader-last-book";

export function saveLastBookId(id: string): void {
  localStorage.setItem(LAST_BOOK_KEY, id);
}

export function getLastBookId(): string | null {
  return localStorage.getItem(LAST_BOOK_KEY);
}

export function clearLastBookId(): void {
  localStorage.removeItem(LAST_BOOK_KEY);
}
