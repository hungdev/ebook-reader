import { join } from "path";
import type { BookFormat } from "../types";

export const UPLOADS_DIR = join(process.cwd(), "uploads", "books");

export function getBookExtension(format: BookFormat): string {
  return format === "txt" ? "txt" : "epub";
}

export function getBookFileName(syncKey: string, format: BookFormat): string {
  return `${syncKey}.${getBookExtension(format)}`;
}

export function getBookFilePath(syncKey: string, format: BookFormat): string {
  return join(UPLOADS_DIR, getBookFileName(syncKey, format));
}
