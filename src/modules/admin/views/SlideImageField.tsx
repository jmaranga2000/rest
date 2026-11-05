"use client";

import { useState } from "react";

export function SlideImageField({ initialUrl }: { initialUrl: string }) {
  const [imageUrl, setImageUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/uploads/display-slide-image", { method: "POST", body });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Image upload failed.");
      setImageUrl(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="imageUrl" value={imageUrl} />
      {imageUrl ? (
        <div className="relative h-36 overflow-hidden rounded-lg border border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Slide preview" className="size-full object-cover" />
          <button type="button" disabled={uploading} onClick={() => setImageUrl("")} className="absolute right-2 top-2 rounded-md bg-black/70 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50">Remove image</button>
        </div>
      ) : null}
      <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-surface-2">
        {uploading ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={uploading}
          aria-label="Upload slide image"
          onChange={(event) => { void upload(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}
        />
      </label>
      <p className="text-xs text-muted">JPG, PNG, or WebP, up to 5 MB.</p>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
