import { existsSync } from "node:fs";
/** Loads .env (then .env.local) when present; real environment variables win. */
for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(f);
}
