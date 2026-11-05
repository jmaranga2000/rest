import { uploadImage } from "@/platform/storage/upload-image";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return uploadImage(request, "display-slide-image");
}
