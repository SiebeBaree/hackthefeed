# HackTheFeed

Paste Oriane viral-video data and a company brief. Each video becomes two new 9:16 UGC clips with different on-camera people, generated on GMI Cloud.

## Pipeline
1. A GMI LLM (`deepseek-ai/DeepSeek-V4-Flash`) rewrites the hook and script for the company (`src/lib/remix.ts`).
2. Each variant gets a different persona and a six-block scene prompt with a blank placeholder can.
3. Nano Banana (`gemini-3.1-flash-image`) renders that empty scene, then swaps the real product in from its photo, so the label is copied rather than redrawn.
4. The still renders to video on the GMI request queue (`src/lib/gmi.ts`), default `veo-3.1-fast-generate-001` (native audio + lip sync, $0.15/s at 720p, about $1.20 per 8s clip).

Onboarding (`/onboarding`) ends on the videos: it generates one clip from the first picked video and product, then shows it next to a pre-rendered Wildwonder sample (`public/samples`), both downloadable. If generation fails, only the sample shows.

## Run
```bash
cp .env.example .env.local  # add GMI_API_KEY
npm run dev
```
