import {
  getContentType,
  getLibraryBook,
  readLibraryBookFile,
  validateSyncKeyParam,
} from "@/lib/library/books.server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ syncKey: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { syncKey: rawSyncKey } = await context.params;
  const syncKey = validateSyncKeyParam(rawSyncKey);

  if (!syncKey) {
    return Response.json({ error: "Invalid syncKey" }, { status: 400 });
  }

  try {
    const book = await getLibraryBook(syncKey);
    if (!book) {
      return Response.json({ error: "Book not found" }, { status: 404 });
    }

    const buffer = await readLibraryBookFile(syncKey, book.format);
    if (!buffer) {
      return Response.json({ error: "Book file missing" }, { status: 404 });
    }

    const etag = `"${syncKey}-${book.updatedAt}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304 });
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": getContentType(book.format),
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
      },
    });
  } catch {
    return Response.json({ error: "Failed to load book file" }, { status: 503 });
  }
}
