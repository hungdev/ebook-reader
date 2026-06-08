import { Communicate } from "edge-tts-universal";
import { formatRateForEdge } from "@/lib/tts";

export async function POST(request: Request) {
  let body: { text?: string; voice?: string; rate?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { text, voice, rate = 1 } = body;
  if (!text?.trim() || !voice) {
    return Response.json({ error: "Missing text or voice" }, { status: 400 });
  }

  if (text.length > 5000) {
    return Response.json({ error: "Text too long" }, { status: 400 });
  }

  let lastError = "TTS failed";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const communicate = new Communicate(text, {
        voice,
        rate: formatRateForEdge(rate),
      });

      const chunks: Buffer[] = [];
      for await (const chunk of communicate.stream()) {
        if (chunk.type === "audio" && chunk.data) {
          chunks.push(chunk.data);
        }
      }

      if (chunks.length === 0) {
        throw new Error("No audio received");
      }

      const audio = Buffer.concat(chunks);
      return new Response(audio, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : "TTS failed";
    }
  }

  return Response.json({ error: lastError }, { status: 500 });
}
