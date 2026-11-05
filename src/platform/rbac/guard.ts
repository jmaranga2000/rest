import type { Ctx, BranchRef } from "../auth/context";
import { AuthorizationError, BusinessRuleError, NotFoundError } from "../errors";
import { assertFeature, assertWritable } from "../tenancy/entitlements";
import type { Feature } from "../tenancy/plans";
import type { Permission } from "./permissions";

export const can = (ctx: Pick<Ctx, "permissions">, permission: Permission): boolean => ctx.permissions.has(permission);
export const canAny = (ctx: Pick<Ctx, "permissions">, ...ps: Permission[]): boolean => ps.some((p) => ctx.permissions.has(p));

/** Throws unless the actor holds every listed permission. */
export function requirePermission(ctx: Pick<Ctx, "permissions">, ...required: Permission[]): void {
  const missing = required.filter((p) => !ctx.permissions.has(p));
  if (missing.length) throw new AuthorizationError();
}

/** Throws unless the actor holds at least one of the listed permissions. */
export function requireAnyPermission(ctx: Pick<Ctx, "permissions">, ...any: Permission[]): void {
  if (!any.some((p) => ctx.permissions.has(p))) throw new AuthorizationError();
}

export function requireFeature(ctx: Pick<Ctx, "features">, feature: Feature, label?: string): void {
  assertFeature(ctx.features, feature, label);
}

/** Blocks mutations when billing has put the workspace into read-only mode. */
export function requireWritable(ctx: Pick<Ctx, "access">): void {
  assertWritable(ctx.access);
}

/** Returns the branch if the actor may operate in it; otherwise throws. */
export function requireBranch(ctx: Pick<Ctx, "branches">, branchId: string): BranchRef {
  const b = ctx.branches.find((x) => x.id === branchId);
  if (!b) throw new NotFoundError("Branch");
  return b;
}

/** The branch the actor is currently working in; throws if the user has none. */
export function activeBranchOrThrow(ctx: Pick<Ctx, "activeBranch">): BranchRef {
  if (!ctx.activeBranch) throw new BusinessRuleError("You're not assigned to a branch yet. Ask an administrator to assign you one.");
  return ctx.activeBranch;
}

export const branchIds = (ctx: Pick<Ctx, "branches">): string[] => ctx.branches.map((b) => b.id);
