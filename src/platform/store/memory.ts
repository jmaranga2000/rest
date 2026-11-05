import { applyUpdate, assertSafeDocument, assertSafeSpec, equalityFields, matches, sortDocs, getPath } from "./filter";
import { INDEXES } from "./indexes";
import { prepareInsert } from "./defaults";
import { DuplicateKeyError, type Collection, type Db, type Doc, type Filter, type FindOpts, type HasId, type UpdateSpec } from "./types";

type Store = Map<string, Map<string, Doc>>;

class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await prev;
    try { return await fn(); } finally { release(); }
  }
}

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory engine with MongoDB semantics for the operator subset the app uses. */
export function createMemoryDb(): Db {
  const store: Store = new Map();
  const mutex = new Mutex();
  let inTx = false;

  const coll = (name: string): Map<string, Doc> => store.get(name) ?? store.set(name, new Map()).get(name)!;

  const checkUnique = (name: string, doc: Doc): void => {
    for (const ix of INDEXES) {
      if (ix.collection !== name || !ix.unique) continue;
      if (ix.partial && !matches(doc, ix.partial)) continue;
      const keys = Object.keys(ix.keys);
      const tuple = keys.map((k) => getPath(doc, k) ?? null);
      for (const other of coll(name).values()) {
        if (other.id === doc.id) continue;
        if (ix.partial && !matches(other, ix.partial)) continue;
        if (keys.every((k, n) => (getPath(other, k) ?? null) === tuple[n])) throw new DuplicateKeyError(name, ix.name);
      }
    }
  };

  const makeCol = <T extends HasId>(name: string): Collection<T> => ({
    async find(filter: Filter = {}, opts: FindOpts = {}) {
      let docs = [...coll(name).values()].filter((d) => matches(d, filter));
      docs = sortDocs(docs, opts.sort);
      if (opts.skip) docs = docs.slice(opts.skip);
      if (opts.limit !== undefined) docs = docs.slice(0, opts.limit);
      return docs.map((d) => clone(d) as T);
    },
    async findOne(filter, opts = {}) {
      const docs = await this.find(filter, { ...opts, limit: 1 });
      return docs[0] ?? null;
    },
    async count(filter = {}) { return [...coll(name).values()].filter((d) => matches(d, filter)).length; },
    async insert(doc) {
      assertSafeDocument(doc);
      if (coll(name).has(doc.id)) throw new DuplicateKeyError(name, "_id");
      const c = clone(prepareInsert(name, doc as unknown as Doc));
      checkUnique(name, c);
      coll(name).set(c.id, c);
    },
    async insertMany(docs) { for (const d of docs) await this.insert(d); },
    async update(filter, spec) {
      assertSafeSpec(spec);
      const hits = [...coll(name).values()].filter((d) => matches(d, filter));
      const staged = hits.map((d) => { const n = clone(d); applyUpdate(n, spec); return n; });
      for (const n of staged) checkUnique(name, n);
      for (const n of staged) coll(name).set(n.id, n);
      return hits.length;
    },
    async findOneAndUpdate(filter, spec, opts = {}) {
      assertSafeSpec(spec);
      const hit = sortDocs([...coll(name).values()].filter((d) => matches(d, filter)), opts.sort)[0];
      if (hit) {
        const n = clone(hit);
        applyUpdate(n, spec);
        checkUnique(name, n);
        coll(name).set(n.id, n);
        return clone(n) as T;
      }
      if (!opts.upsert) return null;
      const fresh = { ...equalityFields(filter) } as Record<string, unknown>;
      applyUpdate(fresh, spec, true);
      if (typeof fresh.id !== "string") throw new Error("upsert requires an id equality in the filter");
      checkUnique(name, fresh as Doc);
      coll(name).set(fresh.id, fresh as Doc);
      return clone(fresh) as T;
    },
    async delete(filter) {
      let n = 0;
      for (const d of [...coll(name).values()]) if (matches(d, filter)) { coll(name).delete(d.id); n++; }
      return n;
    },
  });

  const db: Db = {
    kind: "memory",
    col: (name) => makeCol(name),
    async tx(fn) {
      if (inTx) return fn(db);
      return mutex.run(async () => {
        const snapshot = new Map([...store].map(([k, v]) => [k, new Map([...v].map(([id, d]) => [id, clone(d)]))] as const));
        inTx = true;
        try { return await fn(db); }
        catch (e) { store.clear(); for (const [k, v] of snapshot) store.set(k, v); throw e; }
        finally { inTx = false; }
      });
    },
    async ensureIndexes() { /* enforced on write */ },
    async close() { store.clear(); },
  };
  return db;
}
