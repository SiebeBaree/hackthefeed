import "server-only";
import { z } from "zod";
import { chat } from "./gmi";

// Base identities. Each source video gets two different ones so variants never share a face.
// The LLM dresses and places them to fit the original video's vibe.
const PEOPLE = [
  "a 26-year-old white woman with long messy brown hair",
  "a 30-year-old Black man with a short fade and a trimmed beard",
  "a 23-year-old East Asian woman with a high ponytail",
  "a 34-year-old Latino man with curly dark hair",
  "a 28-year-old South Asian woman with long dark wavy hair",
  "a 25-year-old white man with a blond buzz cut and freckles",
  "a 32-year-old Black woman with box braids",
  "a 27-year-old Middle Eastern man with thick dark hair and stubble",
] as const;

const VariantSchema = z.object({
  outfit: z.string(),
  setting: z.string(),
  light: z.string(),
  expression: z.string(),
  action: z.string(),
  line: z.string(),
});
const ScriptsSchema = z.object({ variants: z.array(VariantSchema).length(2) });

/** scenePrompt shows a blank placeholder can; PLACE_PROMPT later swaps in the real product. */
export type Variant = { person: string; line: string; scenePrompt: string; videoPrompt: string };

// Edit prompt for step 2: image 1 is the scene, the rest are product photos. Never describe the product
// itself, or the model redraws it instead of copying it.
export const PLACE_PROMPT =
  "Image 1 is the photo to keep exactly as it is. The other images show @product, my product. " +
  "Replace the plain silver can in their hand with @product, label facing the camera, held the same way at the same spot, " +
  "at its true proportions, lit by the same light as the scene. Do not alter @product at all. " +
  "Don't alter the logo, make sure the logo and label text stay exactly the same as on the original. " +
  "Keep everything else exactly the same: face, hair, clothes, hand, background and framing. Portrait 9:16. No added text, no watermark.";

const SYSTEM = `You recreate viral short-form videos for a different brand.
You get a viral video's data from Oriane (transcript, caption, on-screen text, stats) and a company brief.
Keep what made the original work: the hook, the character bit, the energy, the setting type.
Swap the competitor for the company's product and give it a twist of its own: never copy the competitor's joke word for word.
Each clip is ONE continuous 8-second selfie shot of one person.

For each of the 2 variants return:
- outfit: what the given person wears, fitting the original's vibe
- setting: where they are, concrete and visual, with colours and materials
- light: the natural light in that place
- expression: their face in the first frame
- action: what they physically do during the 8 seconds with the can held in one hand near their face the whole time; the other hand may gesture but never picks up another prop
- line: the exact words they say, max 18 words, spoken naturally, mention the brand name once

Make the 2 variants different takes on the same format.
Reply with JSON only: {"variants":[{"outfit":"","setting":"","light":"","expression":"","action":"","line":""},{...}]}`;

/** Turn one Oriane video + company brief into two scene and video prompts with different people. */
export async function remix(company: string, oriane: string, seed: number): Promise<Variant[]> {
  const people = [PEOPLE[(seed * 2) % PEOPLE.length], PEOPLE[(seed * 2 + 1) % PEOPLE.length]];
  const raw = await chat(SYSTEM, `COMPANY:\n${company}\n\nPEOPLE: 1) ${people[0]} 2) ${people[1]}\n\nORIANE VIDEO:\n${oriane}`);
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const { variants } = ScriptsSchema.parse(JSON.parse(json));

  // Six blocks in a fixed order (concept, subject, colours, composition, light, camera): earlier words weigh more.
  return variants.map((v, i) => ({
    person: people[i],
    line: v.line,
    scenePrompt:
      "[CONCEPT] Candid vertical iPhone front-camera selfie photo for a TikTok skit, raw camera output. " +
      `[SUBJECT DETAILS] ${people[i]}, wearing ${v.outfit}, ${v.expression}. In one hand, held up next to the face toward the camera, ` +
      "a plain blank slim 355 ml aluminium can in matte silver with no label, a placeholder for product placement. " +
      `[COLORS/MATERIALS] ${v.setting}, real skin texture, natural colours. ` +
      "[COMPOSITION] Medium close-up, face in the upper half, can at shoulder height mid-frame, slightly imperfect selfie framing, " +
      "the bottom fifth of the frame calm with nothing important, left free for text later. " +
      `[LIGHTING] ${v.light}, no studio lighting. ` +
      "[CAMERA/LENS] iPhone front camera at arm's length, slight wide-angle, everything reasonably sharp. " +
      "Portrait 9:16. No text, no logos, no watermark, no phone interface, no status bar.",
    videoPrompt:
      `Handheld iPhone front-camera selfie video, vertical, one continuous shot. ${v.action} They look into the camera and say: "${v.line}" ` +
      "The can stays in their hand the whole time, never floating or let go. " +
      "Natural lip sync, casual real voice, ambient sound only, no music, no subtitles. Keep the can label exactly unchanged and facing the camera.",
  }));
}
