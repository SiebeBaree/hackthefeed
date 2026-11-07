import "server-only";
import { z } from "zod";

// GMI Cloud clients: request queue (image + video) and OpenAI-compatible chat (LLM).
const QUEUE_URL = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey";
const CHAT_URL = "https://api.gmi-serving.com/v1/chat/completions";

// Veo 3.1 Fast holds the can label steadier through motion than Lite; worth the $0.80 extra per clip.
export const VIDEO_MODEL = process.env.GMI_VIDEO_MODEL ?? "veo-3.1-fast-generate-001";
const IMAGE_MODEL = "gemini-3.1-flash-image";
const LLM_MODEL = process.env.GMI_LLM_MODEL ?? "deepseek-ai/DeepSeek-V4-Flash";
export const FALLBACK_VIDEO_MODEL = "seedance-2-0-fast-260128";

// Talking-head capable models (native audio + lip sync). Price per second at 720p with audio.
export const VIDEO_MODELS = [
  "veo-3.1-fast-generate-001", // $0.15/s, default
  "veo-3.1-lite-generate-001", // $0.05/s, cheapest
  "seedance-2-0-fast-260128", // $0.12/s
  "seedance-2-5-260628", // $0.23/s, highest fidelity
] as const;

function headers() {
  const key = process.env.GMI_API_KEY;
  if (!key) throw new Error("GMI_API_KEY is missing. Add it to .env.local");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function gmiFetch<T extends z.ZodType>(url: string, schema: T, init?: RequestInit): Promise<z.infer<T>> {
  const res = await fetch(url, { ...init, headers: headers(), cache: "no-store" });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`GMI ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return schema.parse(body);
}

const RequestSchema = z.object({
  request_id: z.string(),
  status: z.string(),
  outcome: z
    .object({
      video_url: z.string().optional(),
      media_urls: z.array(z.object({ url: z.string() })).optional(),
    })
    .nullish(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Submit a queue job. GMI randomly 500s on submit, so retry with backoff. */
async function submit(model: string, payload: object, tries = 3) {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await gmiFetch(`${QUEUE_URL}/requests`, RequestSchema, {
        method: "POST",
        body: JSON.stringify({ model, payload }),
      });
    } catch (err) {
      lastError = err;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastError;
}

export function getJob(id: string) {
  return gmiFetch(`${QUEUE_URL}/requests/${encodeURIComponent(id)}`, RequestSchema);
}

/**
 * 9:16 still from Nano Banana. Without `refs` it generates; with them it edits (first ref is the
 * image to edit, the rest are product photos to copy from). Waits for the job and returns a hosted URL.
 */
export async function generateImage(prompt: string, refs: string[] = []) {
  const job = await submit(IMAGE_MODEL, {
    prompt,
    ...(refs.length && { image: refs }),
    aspect_ratio: "9:16",
    image_size: "2K", // keeps small label text sharp after placement
    image_output_format: "jpeg",
  });
  for (let i = 0; i < 40; i++) {
    const res = await getJob(job.request_id);
    const url = res.outcome?.media_urls?.[0]?.url;
    if (res.status === "success" && url) return url;
    if (res.status === "failed" || res.status === "cancelled") throw new Error(`Image job ${res.status}`);
    await sleep(3000);
  }
  throw new Error("Image job timed out");
}

// Payload keys differ per provider: Veo uses camelCase, Seedance snake_case.
function videoPayload(model: string, prompt: string, image?: string) {
  if (model.startsWith("veo")) {
    return {
      prompt,
      ...(image && { image }),
      durationSeconds: 8,
      aspectRatio: "9:16",
      resolution: "720p",
      generateAudio: true,
      personGeneration: "allow_adult",
    };
  }
  return { prompt, ...(image && { first_frame: image }), duration: 8, ratio: "9:16", resolution: "720p", generate_audio: true, watermark: false };
}

/** Queue an image-to-video job, falling back to Seedance if the model keeps failing. Poll with getJob. */
export async function submitVideo(prompt: string, image?: string, model = VIDEO_MODEL) {
  try {
    return await submit(model, videoPayload(model, prompt, image));
  } catch (err) {
    if (model === FALLBACK_VIDEO_MODEL) throw err;
    return submit(FALLBACK_VIDEO_MODEL, videoPayload(FALLBACK_VIDEO_MODEL, prompt, image));
  }
}

const ChatSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
});

/** Single-turn chat completion that returns the raw text reply. */
export async function chat(system: string, user: string) {
  const data = await gmiFetch(CHAT_URL, ChatSchema, {
    method: "POST",
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  return data.choices[0]?.message.content ?? "";
}
