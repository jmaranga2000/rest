export type ErrorCode =
  | "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT"
  | "BUSINESS_RULE" | "RATE_LIMITED" | "PLAN_LIMIT" | "PLAN_FEATURE" | "SUBSCRIPTION_READ_ONLY" | "PAYMENT_GATEWAY" | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number = 400,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Please check the highlighted fields.", fieldErrors?: Record<string, string[]>) {
    super("VALIDATION", message, 422, fieldErrors);
  }
}
export class AuthenticationError extends AppError {
  constructor(message = "Please sign in to continue.") { super("UNAUTHENTICATED", message, 401); }
}
export class AuthorizationError extends AppError {
  constructor(message = "You don't have permission to do that.") { super("FORBIDDEN", message, 403); }
}
export class NotFoundError extends AppError {
  constructor(what = "Record") { super("NOT_FOUND", `${what} not found.`, 404); }
}
export class ConflictError extends AppError {
  constructor(message: string) { super("CONFLICT", message, 409); }
}
/** A legitimate request that violates a domain rule (e.g. paying a closed order). */
export class BusinessRuleError extends AppError {
  constructor(message: string) { super("BUSINESS_RULE", message, 422); }
}
export class RateLimitError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super("RATE_LIMITED", `Too many attempts. Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute(s).`, 429);
  }
}
export class PlanLimitError extends AppError {
  constructor(message: string) { super("PLAN_LIMIT", message, 402); }
}
export class PlanFeatureError extends AppError {
  constructor(message: string) { super("PLAN_FEATURE", message, 402); }
}
export class SubscriptionReadOnlyError extends AppError {
  constructor(message = "Your subscription is not active. The workspace is read-only until billing is resolved.") {
    super("SUBSCRIPTION_READ_ONLY", message, 402);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
