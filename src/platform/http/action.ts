import type { z } from "zod";
import { getDb } from "../db";
import { AppError, isAppError, RateLimitError, ValidationError } from "../errors";
import { withDb, type Ctx } from "../auth/context";
import { getCtx } from "./request";
import { AuthenticationError } from "../errors";
import { requireFeature, requirePermission, requireWritable } from "../rbac/guard";
import type { Permission } from "../rbac/permissions";
import type { Feature } from "../tenancy/plans";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } };

/** Convert a FormData (or plain object) into a plain object; repeated keys become arrays. */
export function toPlainInput(input: unknown): unknown {
  if (typeof FormData !== "undefined" && input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const key of new Set(input.keys())) {
      const all = input.getAll(key).filter((v) => typeof v === "string") as string[];
      out[key] = key.endsWith("[]") ? all : all.length > 1 ? all : all[0];
    }
    return out;
  }
  return input;
}

function isFrameworkSignal(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR"));
}

export function toActionError(e: unknown): ActionResult<never> {
  if (isAppError(e)) return { ok: false, error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors } };
  const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.error(`[action:${ref}]`, e);
  return { ok: false, error: { code: "INTERNAL", message: `Something went wrong on our side. Reference ${ref}.` } };
}

export interface ActionOptions<S extends z.ZodTypeAny, R> {
  schema: S;
  /** Every permission listed is required. */
  permission?: Permission | Permission[];
  feature?: Feature;
  /** Defaults to true: mutations are refused while the workspace is read-only. */
  write?: boolean;
  handler: (ctx: Ctx, input: z.infer<S>) => Promise<R>;
}

/**
 * Wraps a use-case as a Server Action:
 *   authenticate → entitlements → validate → run inside ONE transaction → typed result.
 * The handler never has to remember the cross-cutting rules, and can't forget them.
 */
export function defineAction<S extends z.ZodTypeAny, R>(opts: ActionOptions<S, R>) {
  return async (rawInput: unknown): Promise<ActionResult<R>> => {
    try {
      const ctx = await getCtx();
      if (!ctx) throw new AuthenticationError();
      if (opts.write !== false) requireWritable(ctx);
      if (opts.permission) requirePermission(ctx, ...(Array.isArray(opts.permission) ? opts.permission : [opts.permission]));
      if (opts.feature) requireFeature(ctx, opts.feature);

      const parsed = opts.schema.safeParse(toPlainInput(rawInput));
      if (!parsed.success) throw new ValidationError(undefined, flattenZod(parsed.error));

      const db = await getDb();
      const data = await db.tx((tx) => opts.handler(withDb(ctx, tx), parsed.data as z.infer<S>));
      return { ok: true, data };
    } catch (e) {
      if (isFrameworkSignal(e)) throw e;
      return toActionError(e);
    }
  };
}

export function flattenZod(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export { AppError };

/**
 * For actions that run before sign-in (login, register, pairing). No ctx; runs on the root db handle.
 * Extras: refuses banned IPs; `honeypot` adds the hidden-field + timing trap (render <Honeypot/> in the form);
 * `canaryField` treats sign-in attempts as bait accounts ("admin@…") as hostile; failures are logged as security events.
 */
export function definePublicAction<S extends z.ZodTypeAny, R>(opts: { schema: S; honeypot?: boolean; canaryField?: string; failureEvent?: "login_failed"; handler: (db: import("../db").Db, input: z.infer<S>) => Promise<R> }) {
  return async (rawInput: unknown): Promise<ActionResult<R>> => {
    const { clientMeta } = await import("./cookies");
    const sec = await import("../security/store");
    const { checkHoneypot } = await import("../security/honeypot");
    let meta: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null };
    try {
      meta = await clientMeta();
      const db = await getDb();
      if (await sec.isBanned(db, meta.ip)) {
        await sec.recordSecurityEvent(db, { type: "banned_request", ip: meta.ip, userAgent: meta.userAgent });
        throw new RateLimitError(900);
      }
      if (opts.honeypot) {
        const verdict = checkHoneypot(rawInput);
        if (verdict !== "ok") {
          const type = verdict === "filled" ? "honeypot_form" : "form_too_fast";
          await sec.recordSecurityEvent(db, { type, ip: meta.ip, userAgent: meta.userAgent, detail: verdict });
          if (verdict === "filled") await sec.banIp(db, meta.ip, "Filled the hidden honeypot field", 3600);
          else await sec.maybeAutoBan(db, meta.ip, "form_too_fast", { threshold: 8, windowSeconds: 600, banSeconds: 3600 });
          await new Promise((r) => setTimeout(r, 800 + Math.random() * 700)); // tarpit, and a generic answer that reveals nothing
          throw new ValidationError("Please wait a moment and try again.");
        }
      }
      const plain = toPlainInput(rawInput) as Record<string, unknown>;
      if (opts.canaryField && typeof plain?.[opts.canaryField] === "string" && sec.isCanaryEmail(plain[opts.canaryField] as string)) {
        await sec.recordSecurityEvent(db, { type: "canary_login", ip: meta.ip, userAgent: meta.userAgent, detail: String(plain[opts.canaryField]).slice(0, 80) });
        await sec.maybeAutoBan(db, meta.ip, "canary_login", { threshold: 3, windowSeconds: 3600, banSeconds: 86_400 });
      }
      const parsed = opts.schema.safeParse(plain);
      if (!parsed.success) throw new ValidationError(undefined, flattenZod(parsed.error));
      return { ok: true, data: await opts.handler(db, parsed.data as z.infer<S>) };
    } catch (e) {
      if (isFrameworkSignal(e)) throw e;
      try {
        const db = await getDb();
        if (e instanceof RateLimitError) {
          await sec.recordSecurityEvent(db, { type: "rate_limited", ip: meta.ip, userAgent: meta.userAgent });
          await sec.maybeAutoBan(db, meta.ip, "rate_limited", { threshold: 10, windowSeconds: 3600, banSeconds: 3600 });
        } else if (opts.failureEvent && e instanceof AuthenticationError) {
          await sec.recordSecurityEvent(db, { type: opts.failureEvent, ip: meta.ip, userAgent: meta.userAgent });
          await sec.maybeAutoBan(db, meta.ip, "login_failed", { threshold: 25, windowSeconds: 3600, banSeconds: 3600 });
        }
      } catch { /* telemetry only */ }
      return toActionError(e);
    }
  };
}
