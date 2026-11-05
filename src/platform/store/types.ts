/**
 * The only persistence surface the application depends on: a small
 * MongoDB-flavoured document API with two implementations —
 *   mongo.ts   Mongoose (production)
 *   memory.ts  an in-memory engine with the same semantics (tests, previews)
 *
 * Conventions
 *  - Every document has a string `id` (prefixed ULID). It is stored as `_id` in MongoDB.
 *  - Field names are camelCase; booleans, numbers and arrays are native (no JSON-in-strings).
 *  - Timestamps are ISO-8601 strings; money is integer minor units.
 *  - Filters/updates use a deliberately small subset of MongoDB operators so both engines agree:
 *      filter : equality, $eq $ne $gt $gte $lt $lte $in $nin $exists $regex(+$options), $and $or
 *      update : $set $inc $unset $setOnInsert
 */
export interface HasId { id: string }
export type Doc = HasId & Record<string, unknown>;
export type Filter = Record<string, unknown>;
export interface UpdateSpec {
  $set?: Record<string, unknown>;
  $inc?: Record<string, number>;
  $unset?: Record<string, true | 1>;
  $setOnInsert?: Record<string, unknown>;
}
export interface FindOpts { sort?: Record<string, 1 | -1>; limit?: number; skip?: number }

export class DuplicateKeyError extends Error {
  constructor(public readonly collection: string, public readonly index: string) {
    super(`Duplicate key in ${collection} (${index})`);
    this.name = "DuplicateKeyError";
  }
}

export interface Collection<T extends HasId = Doc> {
  find(filter?: Filter, opts?: FindOpts): Promise<T[]>;
  findOne(filter: Filter, opts?: FindOpts): Promise<T | null>;
  count(filter?: Filter): Promise<number>;
  insert(doc: T): Promise<void>;
  insertMany(docs: T[]): Promise<void>;
  /** updateMany semantics; returns the number of matched documents. */
  update(filter: Filter, spec: UpdateSpec): Promise<number>;
  /** Atomically update the first match and return the document (after the change). */
  findOneAndUpdate(filter: Filter, spec: UpdateSpec, opts?: { upsert?: boolean; sort?: Record<string, 1 | -1> }): Promise<T | null>;
  delete(filter: Filter): Promise<number>;
}

export interface Db {
  readonly kind: "mongo" | "memory";
  col<T extends HasId = Doc>(name: string): Collection<T>;
  /** Run `fn` atomically. Nested calls join the outer transaction. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  /** Create indexes and seed built-in reference data. Idempotent. */
  ensureIndexes(): Promise<void>;
  close(): Promise<void>;
}

export interface IndexSpec {
  collection: string;
  /** Field → direction. */
  keys: Record<string, 1 | -1>;
  unique?: boolean;
  /** Only documents matching this (MongoDB partialFilterExpression subset) take part in the index. */
  partial?: Filter;
  name: string;
}
