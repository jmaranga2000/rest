import type { Doc, Filter, UpdateSpec } from "./types";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof RegExp) && !(v instanceof Date);

export function getPath(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setPath(doc: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (!isObj(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function unsetPath(doc: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let cur: unknown = doc;
  for (let i = 0; i < parts.length - 1; i++) { cur = (cur as Record<string, unknown>)?.[parts[i]!]; if (!isObj(cur)) return; }
  delete (cur as Record<string, unknown>)[parts[parts.length - 1]!];
}

/** MongoDB comparison order for the value types we store (null < number < string < boolean). */
export function compareValues(a: unknown, b: unknown): number {
  const rank = (v: unknown) => (v === null || v === undefined ? 0 : typeof v === "number" ? 1 : typeof v === "string" ? 2 : typeof v === "boolean" ? 3 : 4);
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (ra === 0) return 0;
  return (a as number | string | boolean) < (b as number | string | boolean) ? -1 : (a as number | string | boolean) > (b as number | string | boolean) ? 1 : 0;
}

const eq = (a: unknown, b: unknown): boolean => {
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (Array.isArray(a)) return a.some((x) => eq(x, b)) || (Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));
  return a === b;
};

function matchOps(value: unknown, ops: Record<string, unknown>): boolean {
  for (const [op, arg] of Object.entries(ops)) {
    switch (op) {
      case "$eq": if (!eq(value, arg)) return false; break;
      case "$ne": if (eq(value, arg)) return false; break;
      case "$gt": if (value === null || value === undefined || compareValues(value, arg) <= 0) return false; break;
      case "$gte": if (value === null || value === undefined || compareValues(value, arg) < 0) return false; break;
      case "$lt": if (value === null || value === undefined || compareValues(value, arg) >= 0) return false; break;
      case "$lte": if (value === null || value === undefined || compareValues(value, arg) > 0) return false; break;
      case "$in": if (!(arg as unknown[]).some((x) => eq(value, x))) return false; break;
      case "$nin": if ((arg as unknown[]).some((x) => eq(value, x))) return false; break;
      case "$exists": if ((value !== undefined) !== Boolean(arg)) return false; break;
      case "$type": if (arg === "string" ? typeof value !== "string" : arg === "number" ? typeof value !== "number" : false) return false; break;
      case "$regex": { const re = new RegExp(String(arg), String(ops.$options ?? "")); if (typeof value !== "string" || !re.test(value)) return false; break; }
      case "$options": break;
      default: throw new Error(`Unsupported filter operator ${op}`);
    }
  }
  return true;
}

export function matches(doc: Doc | Record<string, unknown>, filter: Filter): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === "$and") { if (!(cond as Filter[]).every((f) => matches(doc, f))) return false; continue; }
    if (key === "$or") { if (!(cond as Filter[]).some((f) => matches(doc, f))) return false; continue; }
    const value = getPath(doc, key);
    if (cond instanceof RegExp) { if (typeof value !== "string" || !cond.test(value)) return false; continue; }
    if (isObj(cond) && Object.keys(cond).some((k) => k.startsWith("$"))) { if (!matchOps(value, cond)) return false; continue; }
    if (!eq(value, cond)) return false;
  }
  return true;
}

export function applyUpdate(doc: Record<string, unknown>, spec: UpdateSpec, inserting = false): void {
  for (const [k, v] of Object.entries(spec.$set ?? {})) { if (v === undefined) unsetPath(doc, k); else setPath(doc, k, v); }
  for (const [k, v] of Object.entries(spec.$inc ?? {})) setPath(doc, k, Number(getPath(doc, k) ?? 0) + v);
  for (const k of Object.keys(spec.$unset ?? {})) unsetPath(doc, k);
  if (inserting) for (const [k, v] of Object.entries(spec.$setOnInsert ?? {})) setPath(doc, k, v);
}

export function sortDocs<T extends Record<string, unknown>>(docs: T[], sort?: Record<string, 1 | -1>): T[] {
  if (!sort) return docs;
  const keys = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [k, dir] of keys) { const c = compareValues(getPath(a, k), getPath(b, k)); if (c !== 0) return c * dir; }
    return 0;
  });
}

/** Equality fields of a filter that can seed an upsert document. */
export function equalityFields(filter: Filter): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter)) if (!k.startsWith("$") && !(isObj(v) && Object.keys(v).some((x) => x.startsWith("$")))) out[k] = v;
  return out;
}

/**
 * Defence against NoSQL operator injection: a stored document must never contain `$`-prefixed keys or dotted keys,
 * which is how attacker-controlled JSON (`{"$gt": ""}`, `{"a.b": 1}`) turns into query operators or path writes later.
 * Checked on every insert and `$set`, in both engines. Legitimate field names never need either.
 */
export function assertSafeDocument(value: unknown, path = "document", depth = 0): void {
  if (depth > 12) throw new Error(`Rejected ${path}: nested too deeply`);
  if (Array.isArray(value)) { value.forEach((v, i) => assertSafeDocument(v, `${path}[${i}]`, depth + 1)); return; }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith("$") || k.includes(".")) throw new Error(`Rejected ${path}: illegal field name "${k}"`);
      assertSafeDocument(v, `${path}.${k}`, depth + 1);
    }
  }
}

/** Values written through `$set` / `$setOnInsert` get the same scrutiny as inserted documents (the field paths are ours, the values may not be). */
export function assertSafeSpec(spec: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> }): void {
  for (const part of [spec.$set, spec.$setOnInsert]) for (const [k, v] of Object.entries(part ?? {})) assertSafeDocument(v, k);
}
