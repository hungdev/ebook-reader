import {
  MAX_TTS_TEXT_LENGTH,
  resolveOnlineVoice,
  synthesizeSpeechMp3,
} from "@/lib/tts-synthesize.server";

export async function POST(request: Request) {
  let body: { text?: string; voice?: string; rate?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const text = body.text?.trim() ?? "";
  if (!text) {
    return Response.json({ error: "INVALID_TEXT" }, { status: 400 });
  }

  if (text.length > MAX_TTS_TEXT_LENGTH) {
    return Response.json({ error: "TEXT_TOO_LONG" }, { status: 400 });
  }

  const voice = resolveOnlineVoice(body.voice);
  const rate = typeof body.rate === "number" ? body.rate : 1;

  try {
    const audio = await synthesizeSpeechMp3(text, voice, rate);
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS_FAILED";
    if (message === "INVALID_TEXT") {
      return Response.json({ error: message }, { status: 400 });
    }
    if (message === "TEXT_TOO_LONG") {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: "TTS_FAILED" }, { status: 503 });
  }
}
