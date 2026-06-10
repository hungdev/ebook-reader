import {
  getSyncState,
  upsertSyncProgress,
  upsertSyncSession,
  validateSyncUserId,
} from "@/lib/sync/reading-sync.server";
import type { SyncPutBody, SyncState } from "@/lib/sync/types";

export async function GET(request: Request) {
  const syncUserId = validateSyncUserId(
    new URL(request.url).searchParams.get("syncUserId"),
  );

  if (!syncUserId) {
    return Response.json({ error: "Invalid syncUserId" }, { status: 400 });
  }

  try {
    const state: SyncState = await getSyncState(syncUserId);
    return Response.json(state);
  } catch {
    return Response.json({ error: "Failed to load sync state" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  let body: SyncPutBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const syncUserId = validateSyncUserId(body.syncUserId);
  if (!syncUserId) {
    return Response.json({ error: "Invalid syncUserId" }, { status: 400 });
  }

  if (!body.progress && !body.session) {
    return Response.json(
      { error: "Missing progress or session payload" },
      { status: 400 },
    );
  }

  try {
    if (body.progress) {
      await upsertSyncProgress(syncUserId, body.progress);
    }

    if (body.session) {
      await upsertSyncSession(syncUserId, body.session);
    }

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
