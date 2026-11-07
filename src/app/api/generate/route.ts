import { z } from "zod";
import { generateImage, submitVideo, VIDEO_MODEL } from "@/lib/gmi";
import { PLACE_PROMPT, remix, type Variant } from "@/lib/remix";

export const maxDuration = 300;

const Body = z.object({
  company: z.string().min(1),
  productImage: z.string().url().optional(),
  videos: z.array(z.string().min(1)).min(1).max(5),
  model: z.string().optional(),
  perVideo: z.union([z.literal(1), z.literal(2)]).default(2), // clips per source video
});

export type GenerateResponse = {
  results: {
    source: number;
    person: string;
    line: string;
    videoPrompt: string;
    imageUrl?: string;
    requestId?: string;
    error?: string;
  }[];
};

/**
 * POST: for each Oriane video write up to 2 scripts. Each one renders an empty scene with a blank
 * placeholder can, swaps in the real product from its photo (so the model never invents the label),
 * then queues image-to-video on GMI. The client polls /api/status/[id].
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { company, productImage, videos, model = VIDEO_MODEL, perVideo } = parsed.data;
  const refs = productImage ? [productImage] : [];

  const render = async (source: number, { person, line, scenePrompt, videoPrompt }: Variant) => {
    let imageUrl: string | undefined;
    try {
      imageUrl = await generateImage(scenePrompt);
      if (refs.length) imageUrl = await generateImage(PLACE_PROMPT, [imageUrl, ...refs]);
      const job = await submitVideo(videoPrompt, imageUrl, model);
      return { source, person, line, videoPrompt, imageUrl, requestId: job.request_id };
    } catch (err) {
      return { source, person, line, videoPrompt, imageUrl, error: message(err) };
    }
  };

  try {
    const bySource = await Promise.all(
      videos.map(async (video, source) => {
        const variants = await remix(company, video, source);
        return Promise.all(variants.slice(0, perVideo).map((v) => render(source, v)));
      }),
    );
    return Response.json({ results: bySource.flat() } satisfies GenerateResponse);
  } catch (err) {
    return Response.json({ error: `Script writing failed: ${message(err)}` }, { status: 502 });
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
