import { convertFileToEpub } from "@/lib/calibre/convert.server";
import { mkdtemp, readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  CONVERT_EXTENSIONS,
  getFileExtension,
  needsConversion,
} from "@/lib/book-formats";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: "File quá lớn (tối đa 25MB)" },
      { status: 413 },
    );
  }

  const ext = getFileExtension(file.name);
  if (!ext || !needsConversion(ext)) {
    return Response.json(
      {
        error: `Định dạng không hỗ trợ chuyển đổi. Hỗ trợ: ${CONVERT_EXTENSIONS.join(", ")}`,
      },
      { status: 415 },
    );
  }

  const safeBase = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-60);
  const tempDir = await mkdtemp(join(tmpdir(), "ebook-convert-"));
  const inputPath = join(tempDir, `${safeBase}.${ext}`);
  const outputPath = join(tempDir, `${safeBase}.epub`);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, buffer);
    await convertFileToEpub(inputPath, outputPath);
    const epub = await readFile(outputPath);

    return new Response(epub, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${safeBase}.epub"`,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Chuyển đổi thất bại";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await Promise.allSettled([
      unlink(inputPath),
      unlink(outputPath),
    ]);
  }
}
