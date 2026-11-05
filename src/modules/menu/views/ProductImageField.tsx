"use client";

import { useState } from "react";
import { ProductThumb } from "@/ui/ProductThumb";
import { Input } from "@/ui/inputs";

export function ProductImageField({ name, initialUrl }: { name: string; initialUrl: string }) {
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
      const response = await fetch("/api/uploads/product-image", { method: "POST", body });
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
    <div className="flex items-start gap-3">
      <ProductThumb name={name} src={imageUrl || null} className="size-12 shrink-0 rounded-lg text-sm" />
      <div className="min-w-0 flex-1 space-y-2">
        <Input id="imageUrl" name="imageUrl" type="url" inputMode="url" placeholder="https://…" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          {uploading ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => { void upload(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}
          />
        </label>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      </div>
    </div>
  );
}
