import { convertFileToEpub } from "@/lib/calibre/convert.server";
import {
  getFileExtension,
  needsConversion,
} from "@/lib/book-formats";
import {
  listLibraryBooks,
  saveLibraryBookFile,
  upsertLibraryBook,
} from "@/lib/library/books.server";
import { mkdtemp, readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { BookFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function GET() {
  try {
    const books = await listLibraryBooks();
    return Response.json({ books });
  } catch {
    return Response.json({ error: "Failed to load library" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const syncKey = formData.get("syncKey");
  const title = formData.get("title");
  const author = formData.get("author");
  const format = formData.get("format");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }
  if (typeof syncKey !== "string" || typeof title !== "string") {
    return Response.json({ error: "Missing metadata" }, { status: 400 });
  }
  if (format !== "epub" && format !== "txt") {
    return Response.json({ error: "Invalid format" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: "File quá lớn (tối đa 25MB)" },
      { status: 413 },
    );
  }

  try {
    let storedFormat: BookFormat = format;
    let buffer = Buffer.from(await file.arrayBuffer());
    const ext = getFileExtension(file.name);

    if (ext && needsConversion(ext)) {
      const safeBase = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-60);
      const tempDir = await mkdtemp(join(tmpdir(), "ebook-upload-"));
      const inputPath = join(tempDir, `${safeBase}.${ext}`);
      const outputPath = join(tempDir, `${safeBase}.epub`);

      try {
        await writeFile(inputPath, buffer);
        await convertFileToEpub(inputPath, outputPath);
        buffer = await readFile(outputPath);
        storedFormat = "epub";
      } finally {
        await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
      }
    }

    await saveLibraryBookFile(syncKey, storedFormat, buffer);
    const book = await upsertLibraryBook({
      syncKey,
      title,
      author: typeof author === "string" ? author : undefined,
      format: storedFormat,
      fileSize: buffer.byteLength,
    });

    return Response.json({ book });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
