// Client-side tracking for clips queued by /api/generate. Shared by the generator page and onboarding.
import type { GenerateResponse } from "@/app/api/generate/route";

export type Clip = GenerateResponse["results"][number] & { status?: string; videoUrl?: string | null; retried?: boolean };

export const isPending = (c: Clip) => !!c.requestId && !c.videoUrl && !c.error && !["failed", "cancelled"].includes(c.status ?? "");

/**
 * One poll of a pending clip. GMI's status endpoint sometimes errors mid-render, so a bad poll changes
 * nothing and the next one tries again. Veo's safety filter blocks some renders, so a failed clip
 * re-renders once on the fallback model.
 */
export async function checkClip(c: Clip): Promise<Partial<Clip>> {
  const poll = await fetch(`/api/status/${c.requestId}`).catch(() => null);
  if (!poll?.ok) return {};
  const d: { status: string; videoUrl?: string | null } = await poll.json();
  if ((d.status !== "failed" && d.status !== "cancelled") || c.retried) return d;
  const res = await fetch("/api/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: c.videoPrompt, imageUrl: c.imageUrl }),
  });
  const r: { requestId?: string; error?: string } = await res.json();
  return r.requestId ? { requestId: r.requestId, status: "retrying", retried: true } : { error: r.error, retried: true };
}
