import { getCtx } from "@/platform/http/request";
import { AppError } from "@/platform/errors";
import { requireFeature, requirePermission, requireWritable } from "@/platform/rbac/guard";
import { newId } from "@/platform/ids";
import { env } from "@/platform/env";
import { storeImage } from "./r2";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
type ImageKind = "product-image" | "display-slide-image";

function imageType(bytes: Uint8Array): { type: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { type: "image/png", extension: "png" };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP") return { type: "image/webp", extension: "webp" };
  return null;
}

export async function uploadImage(request: Request, kind: ImageKind): Promise<Response> {
  try {
    const ctx = await getCtx();
    if (!ctx) return Response.json({ error: "Please sign in to upload an image." }, { status: 401 });
    requirePermission(ctx, kind === "product-image" ? "menu.manage" : "displays.manage");
    if (kind === "display-slide-image") requireFeature(ctx, "displays");
    requireWritable(ctx);
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(env().APP_URL).origin) {
      return Response.json({ error: "This upload request is not allowed." }, { status: 403 });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES + 64 * 1024) return Response.json({ error: "Images must be 5 MB or smaller." }, { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Choose an image to upload." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES + 64 * 1024) {
        await reader.cancel();
        return Response.json({ error: "Images must be 5 MB or smaller." }, { status: 413 });
      }
      chunks.push(value);
    }
    const requestBody = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      requestBody.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let form: FormData;
    try {
      form = await new Response(requestBody, { headers: request.headers }).formData();
    } catch {
      return Response.json({ error: "The image upload request is malformed." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose an image to upload." }, { status: 400 });
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return Response.json({ error: "Images must be between 1 byte and 5 MB." }, { status: 413 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = imageType(bytes);
    if (!detected) return Response.json({ error: "Use a valid JPG, PNG, or WebP image." }, { status: 415 });

    const collection = kind === "product-image" ? "products" : "display-slides";
    const url = await storeImage(ctx.org.id, collection, `${newId("image")}.${detected.extension}`, bytes, detected.type);
    return Response.json({ url });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Image upload failed.", error);
    return Response.json({ error: "The image could not be uploaded. Check the R2 configuration and try again." }, { status: 500 });
  }
}
