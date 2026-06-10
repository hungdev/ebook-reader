import {
  deleteLibraryBook,
  getLibraryBook,
  validateSyncKeyParam,
} from "@/lib/library/books.server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ syncKey: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { syncKey: rawSyncKey } = await context.params;
  const syncKey = validateSyncKeyParam(rawSyncKey);

  if (!syncKey) {
    return Response.json({ error: "Invalid syncKey" }, { status: 400 });
  }

  try {
    const deleted = await deleteLibraryBook(syncKey);
    if (!deleted) {
      return Response.json({ error: "Book not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Failed to delete book" }, { status: 503 });
  }
}

export async function GET(_request: Request, context: RouteContext) {
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
    return Response.json({ book });
  } catch {
    return Response.json({ error: "Failed to load book" }, { status: 503 });
  }
}
