import { useEffect, useRef, useState } from 'react';
import type { GenerateResponse } from '@/app/api/generate/route';
import { checkClip, isPending, type Clip } from '@/lib/clips';
import { beliefLabels, pickedVideos, type State } from '@/lib/onboarding/state';
import { SAMPLE_CLIP } from '@/lib/samples';
import type { StepProps } from '../Onboarding';

type Video = { videoUrl: string; poster?: string; line?: string; download: string };

/** Company brief for the script writer, from the onboarding answers. */
function brief(s: State) {
  const product = s.products.find(p => p.selected);
  const edge = beliefLabels(s);
  return [
    `${s.client.trim() || s.siteInfo?.title || s.site}: ${s.what.trim()}`,
    s.site && `Website: ${s.site}`,
    product && `Hero product for this video: ${product.title}`,
    edge.length > 0 && `Edge: ${edge.join('; ')}`,
  ].filter(Boolean).join('\n');
}

// Shopify serves product photos at any width; placement copies the label better from a big one.
const fullRes = (src: string) => src.replace(/_\d+x(?=\.\w+(\?|$))/, '_1200x');

const SAMPLE: Video = { videoUrl: SAMPLE_CLIP.videoUrl, poster: SAMPLE_CLIP.imageUrl, line: SAMPLE_CLIP.line, download: SAMPLE_CLIP.videoUrl };

/**
 * End of onboarding: generates one clip from the first picked video and product via /api/generate,
 * shows a spinner until it's rendered, then the pre-rendered sample next to it. If generation fails,
 * only the sample shows.
 */
export default function DoneStep({ s }: StepProps) {
  const source = pickedVideos(s)[0];
  const [clip, setClip] = useState<Clip | null>(null);
  const [startFailed, setStartFailed] = useState(false);
  const started = useRef(false); // refs survive Strict Mode's double effect run, so this only spends credits once

  useEffect(() => {
    if (started.current || !source) return;
    started.current = true;
    const product = s.products.find(p => p.selected)?.images[0];
    const video = 'transcript' in source
      ? JSON.stringify({ caption: source.caption, transcript: source.transcript, onScreenText: source.onScreenText, views: source.views, handle: source.handle })
      : `${source.t}: ${source.cap}`;
    (async () => {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company: brief(s), productImage: product && fullRes(product), videos: [video], perVideo: 1 }),
        });
        const data: GenerateResponse | { error: string } = await res.json();
        const first = 'error' in data ? null : data.results[0];
        if (!first?.requestId) return setStartFailed(true);
        setClip(first);
      } catch {
        setStartFailed(true);
      }
    })();
  }, [s, source]);

  // Poll the render until it's done or has failed for good.
  useEffect(() => {
    if (!clip || !isPending(clip)) return;
    const t = setTimeout(async () => {
      const update = await checkClip(clip);
      setClip(prev => prev && { ...prev, ...update }); // new object even if unchanged, so the next poll is scheduled
    }, 5000);
    return () => clearTimeout(t);
  }, [clip]);

  const failed = !source || startFailed || (!!clip && !isPending(clip) && !clip.videoUrl);
  if (!failed && !clip?.videoUrl) {
    return (
      <div role="status" className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-ink-2">
        <span aria-hidden className="size-9 rounded-full border-[3px] border-line border-t-accent motion-safe:animate-spin" />
        {clip ? 'Rendering your video' : 'Writing the script and casting'}
        <span className="text-[13.5px] text-ink-3">Takes about two minutes</span>
      </div>
    );
  }

  const videos = clip?.videoUrl
    ? [SAMPLE, { videoUrl: clip.videoUrl, poster: clip.imageUrl, line: clip.line, download: `/api/download?url=${encodeURIComponent(clip.videoUrl)}` }]
    : [SAMPLE];

  return (
    <div className="flex w-full flex-wrap justify-center gap-6">
      {videos.map(v => (
        <figure key={v.videoUrl} className="flex w-[min(100%,calc(78vh*9/16))] flex-col gap-3">
          <video src={v.videoUrl} poster={v.poster} controls playsInline preload="metadata"
            className="aspect-[9/16] w-full rounded-[10px] border border-line bg-surface-2 object-cover" />
          <figcaption className="flex items-start justify-between gap-3">
            {v.line && <span className="text-[13.5px] leading-snug text-ink-2">“{v.line}”</span>}
            <a href={v.download} download className="shrink-0 text-sm font-medium text-accent hover:underline">Download</a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
