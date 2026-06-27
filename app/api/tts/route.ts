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
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim() ?? "";
  if (!text) {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }

  if (text.length > MAX_TTS_TEXT_LENGTH) {
    return Response.json({ error: "Text too long" }, { status: 400 });
  }

  const voice = resolveOnlineVoice(body.voice);
  const rate = typeof body.rate === "number" ? body.rate : 1;

  try {
    const audio = await synthesizeSpeechMp3(text, voice, rate);
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS failed";
    return Response.json({ error: message }, { status: 503 });
  }
}
