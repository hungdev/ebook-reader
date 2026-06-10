import type { BookFormat } from "./types";

export interface LibraryBookRecord {
  syncKey: string;
  title: string;
  author?: string;
  format: BookFormat;
  fileSize: number;
  addedAt: number;
  updatedAt: number;
}

export interface LibraryCatalogResponse {
  books: LibraryBookRecord[];
}

export interface UploadBookMetadata {
  syncKey: string;
  title: string;
  author?: string;
  format: BookFormat;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchBookCatalog(): Promise<LibraryBookRecord[] | null> {
  try {
    const response = await fetch("/api/books", { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as LibraryCatalogResponse;
    return data.books ?? [];
  } catch {
    return null;
  }
}

export async function uploadBookToServer(
  file: File,
  metadata: UploadBookMetadata,
): Promise<LibraryBookRecord> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("syncKey", metadata.syncKey);
  formData.append("title", metadata.title);
  if (metadata.author) formData.append("author", metadata.author);
  formData.append("format", metadata.format);

  const response = await fetch("/api/books", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Không thể tải sách lên"));
  }

  const data = (await response.json()) as { book: LibraryBookRecord };
  return data.book;
}

export async function downloadBookFile(
  syncKey: string,
  format: BookFormat,
): Promise<ArrayBuffer> {
  const response = await fetch(`/api/books/${syncKey}/file`, {
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Không thể tải sách"));
  }

  return response.arrayBuffer();
}

export async function deleteRemoteBook(syncKey: string): Promise<void> {
  const response = await fetch(`/api/books/${syncKey}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Không thể xóa sách"));
  }
}
