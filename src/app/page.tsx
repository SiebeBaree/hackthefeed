"use client";

import { useEffect, useState } from "react";
import type { GenerateResponse } from "./api/generate/route";
import { checkClip, isPending, type Clip } from "@/lib/clips";
import { SAMPLE_COMPANY, SAMPLE_PRODUCT_IMAGE, SAMPLE_VIDEOS } from "@/lib/samples";

export default function Home() {
  const [company, setCompany] = useState(SAMPLE_COMPANY);
  const [productImage, setProductImage] = useState(SAMPLE_PRODUCT_IMAGE);
  const [videos, setVideos] = useState(SAMPLE_VIDEOS);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [results, setResults] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then((d: { models: string[]; default: string }) => {
        setModels(d.models);
        setModel(d.default);
      });
  }, []);

  // Poll every pending job until it succeeds or fails.
  useEffect(() => {
    const pending = results.filter(isPending);
    if (!pending.length) return;
    const t = setTimeout(async () => {
      const updates = await Promise.all(pending.map(async (r) => [r.requestId, await checkClip(r)] as const));
      const byId = new Map(updates);
      setResults((prev) => prev.map((r) => (r.requestId && byId.has(r.requestId) ? { ...r, ...byId.get(r.requestId) } : r)));
    }, 5000);
    return () => clearTimeout(t);
  }, [results]);

  async function generate() {
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          productImage: productImage.trim() || undefined,
          videos: videos.filter((v) => v.trim()),
          model,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults((data as GenerateResponse).results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const count = videos.filter((v) => v.trim()).length * 2;

  return (
    <main className="mx-auto w-full max-w-5xl p-6 space-y-8">
      <h1 className="text-3xl font-semibold">HackTheFeed</h1>

      <section className="space-y-2">
        <label className="font-medium">Company</label>
        <textarea
          className="w-full h-36 rounded border border-neutral-700 bg-transparent p-3 text-sm"
          placeholder="Name, product, audience, tone..."
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <input
            className="w-full rounded border border-neutral-700 bg-transparent p-2 text-sm"
            placeholder="Product photo URL"
            value={productImage}
            onChange={(e) => setProductImage(e.target.value)}
          />
          {productImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={productImage} alt="" className="h-12 w-12 rounded object-cover" />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="font-medium">Oriane videos</label>
          <button className="text-sm underline" onClick={() => setVideos([...videos, ""])}>
            Add video
          </button>
        </div>
        {videos.map((v, i) => (
          <div key={i} className="flex gap-2">
            <textarea
              className="w-full h-40 rounded border border-neutral-700 bg-transparent p-3 font-mono text-xs"
              placeholder="Paste Oriane output (JSON or text)"
              value={v}
              onChange={(e) => setVideos(videos.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button className="text-sm" onClick={() => setVideos(videos.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <select className="rounded border border-neutral-700 bg-transparent p-2 text-sm" value={model} onChange={(e) => setModel(e.target.value)}>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          className="rounded bg-white px-4 py-2 text-black disabled:opacity-50"
          disabled={loading || !company.trim() || !count}
          onClick={generate}
        >
          {loading ? "Writing scripts and casting..." : `Generate ${count} videos`}
        </button>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {results.map((r, i) => (
          <div key={i} className="space-y-2">
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded bg-neutral-900">
              {r.videoUrl ? (
                <video src={r.videoUrl} controls autoPlay loop playsInline className="h-full w-full object-cover" />
              ) : (
                <>
                  {r.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="h-full w-full object-cover opacity-60" />
                  )}
                  <span className="absolute inset-x-0 bottom-3 text-center text-sm text-white">
                    {r.error ? "Failed" : `Rendering video (${r.status ?? "queued"})`}
                  </span>
                </>
              )}
            </div>
            <p className="text-sm">
              Video {r.source + 1}: &ldquo;{r.line}&rdquo;
            </p>
            <p className="text-xs text-neutral-500">{r.person}</p>
            {r.error && <p className="text-xs text-red-500 break-all">{r.error}</p>}
          </div>
        ))}
      </section>
    </main>
  );
}
