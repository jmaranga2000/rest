import { z } from "zod";

const optionalEnv = <T extends z.ZodTypeAny>(value: T) =>
  z.preprocess((input) => typeof input === "string" && input.trim() === "" ? undefined : input, value.optional());

const schema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().default("restaurant_os"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEFAULT_CURRENCY: z.string().length(3).default("KES"),
  DEFAULT_TIMEZONE: z.string().default("Africa/Nairobi"),
  DEFAULT_COUNTRY: z.string().length(2).default("KE"),
  /** Platform Paystack account: used ONLY for subscription payments. Restaurants add their own keys in Settings. */
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PLATFORM_ADMIN_EMAIL: optionalEnv(z.string().email()),
  PLATFORM_ADMIN_PASSWORD: optionalEnv(z.string().min(10)),
  PLATFORM_ADMIN_NAME: optionalEnv(z.string().trim().min(1).max(100)).default("Platform Administrator"),
  SMTP_HOST: optionalEnv(z.string().trim().min(1)),
  SMTP_PORT: optionalEnv(z.coerce.number().int().min(1).max(65535)),
  SMTP_SECURE: z.preprocess((value) => value === "" ? undefined : value, z.enum(["true", "false"]).default("false")).transform((value) => value === "true"),
  SMTP_USER: optionalEnv(z.string()),
  SMTP_PASSWORD: optionalEnv(z.string()),
  SMTP_FROM: optionalEnv(z.string().trim().min(1)),
  R2_ACCOUNT_ID: optionalEnv(z.string().trim().min(1)),
  R2_ACCESS_KEY_ID: optionalEnv(z.string().trim().min(1)),
  R2_SECRET_ACCESS_KEY: optionalEnv(z.string().min(1)),
  R2_BUCKET: optionalEnv(z.string().trim().min(1)),
  R2_PUBLIC_URL: optionalEnv(z.string().url()),
  /** How many reverse proxies sit in front of the app (each appends to X-Forwarded-For). 0 = ignore the header. */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  /** Optional comma-separated IPv4/CIDR allow-list for the operator console (/platform). Empty = no restriction. */
  PLATFORM_ALLOWED_IPS: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
}).superRefine((value, ctx) => {
  if (Boolean(value.PLATFORM_ADMIN_EMAIL) !== Boolean(value.PLATFORM_ADMIN_PASSWORD)) {
    ctx.addIssue({ code: "custom", path: ["PLATFORM_ADMIN_EMAIL"], message: "Set both PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD." });
  }
  const smtpRequired = [value.SMTP_HOST, value.SMTP_PORT, value.SMTP_FROM];
  if ((smtpRequired.some(Boolean) || value.SMTP_USER || value.SMTP_PASSWORD) && !smtpRequired.every(Boolean)) {
    ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "Set SMTP_HOST, SMTP_PORT, and SMTP_FROM together." });
  }
  if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
    ctx.addIssue({ code: "custom", path: ["SMTP_USER"], message: "Set both SMTP_USER and SMTP_PASSWORD, or leave both blank." });
  }
  const r2Required = [value.R2_ACCOUNT_ID, value.R2_ACCESS_KEY_ID, value.R2_SECRET_ACCESS_KEY, value.R2_BUCKET, value.R2_PUBLIC_URL];
  if (r2Required.some(Boolean) && !r2Required.every(Boolean)) {
    ctx.addIssue({ code: "custom", path: ["R2_ACCOUNT_ID"], message: "Set all R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_URL values together." });
  }
  if (value.R2_PUBLIC_URL && !value.R2_PUBLIC_URL.startsWith("https://")) {
    ctx.addIssue({ code: "custom", path: ["R2_PUBLIC_URL"], message: "R2_PUBLIC_URL must use HTTPS." });
  }
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

/**
 * Validated lazily on first use (not at import time) so `next build` and unit
 * tests never crash on a missing variable they don't need.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
  }
  cached = parsed.data;
  if (cached.NODE_ENV === "production") {
    const weak = /replace-with|changeme|change-me|secret$|password|^(.)\1+$/i.test(cached.APP_SECRET);
    if (weak) throw new Error("APP_SECRET looks like a placeholder. Generate one with: openssl rand -base64 48");
    if (!cached.APP_URL.startsWith("https://")) throw new Error("APP_URL must be https:// in production (secure cookies, Paystack callbacks).");
    if (cached.MONGODB_URI === "memory") throw new Error("MONGODB_URI=memory is for development only.");
  }
  return cached;
}

/** For tests: forget the cached environment so the next env() call re-reads and re-validates process.env. */
export function __resetEnvForTests(): void { cached = null; }

/** For tests: override the cached environment. */
export function __setEnvForTests(e: Partial<Env>): void {
  cached = { ...schema.parse({ MONGODB_URI: "memory", APP_SECRET: "x".repeat(40) }), ...e };
}

export const isProd = () => process.env.NODE_ENV === "production";
