import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";

let client: S3Client | undefined;

export async function storeProductImage(orgId: string, key: string, body: Uint8Array, contentType: string): Promise<string> {
  const config = env();
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = config;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    throw new Error("Cloudflare R2 is not configured. Set all R2_* variables in the environment.");
  }

  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  const objectKey = `organizations/${orgId}/products/${key}`;
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: objectKey,
    Body: body,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${objectKey}`;
}
