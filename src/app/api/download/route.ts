// GET /api/download?url=...: re-serves a finished GMI clip as an attachment. Browsers ignore
// <a download> on cross-origin links, so without this the button would just open the video.
// Only GMI's own bucket is allowed, so this can't be used as an open proxy.
const GMI_BUCKET = 'https://storage.googleapis.com/gmi-video-assests-prod/';

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url') ?? '';
  if (!url.startsWith(GMI_BUCKET)) return new Response('Not a GMI video', { status: 400 });
  const res = await fetch(url);
  if (!res.ok || !res.body) return new Response('Couldn’t fetch the video', { status: 502 });
  return new Response(res.body, {
    headers: { 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="hackthefeed-video.mp4"' },
  });
}
