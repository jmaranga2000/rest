import type { z } from "zod";
import { getDb } from "@/platform/db";
import { AuthenticationError, ValidationError } from "@/platform/errors";
import { flattenZod, toActionError, toPlainInput, type ActionResult } from "@/platform/http/action";
import { getPlatformCtx } from "./request";
import type { PlatformCtx } from "./auth";

/** Same contract as `defineAction`, but authenticates an operator (never a tenant user). */
export function definePlatformAction<S extends z.ZodTypeAny, R>(opts: { schema: S; handler: (ctx: PlatformCtx, input: z.infer<S>) => Promise<R> }) {
  return async (rawInput: unknown): Promise<ActionResult<R>> => {
    try {
      const ctx = await getPlatformCtx();
      if (!ctx) throw new AuthenticationError();
      const parsed = opts.schema.safeParse(toPlainInput(rawInput));
      if (!parsed.success) throw new ValidationError(undefined, flattenZod(parsed.error));
      const db = await getDb();
      const data = await db.tx((tx) => opts.handler({ ...ctx, db: tx }, parsed.data as z.infer<S>));
      return { ok: true, data };
    } catch (e) {
      const digest = (e as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
      return toActionError(e);
    }
  };
}
