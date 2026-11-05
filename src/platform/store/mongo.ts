import { assertSafeDocument, assertSafeSpec } from "./filter";
import { INDEXES } from "./indexes";
import { prepareInsert } from "./defaults";
import { DuplicateKeyError, type Collection, type Db, type Doc, type Filter, type FindOpts, type HasId, type UpdateSpec } from "./types";

interface MQuery<T> {
  sort(s: Record<string, 1 | -1>): MQuery<T>;
  skip(n: number): MQuery<T>;
  limit(n: number): MQuery<T>;
  session(s: MSession): MQuery<T>;
  lean(): MQuery<T>;
  exec(): Promise<T>;
}
interface MModel {
  find(f: Filter): MQuery<Record<string, unknown>[]>;
  findOne(f: Filter): MQuery<Record<string, unknown> | null>;
  countDocuments(f: Filter): MQuery<number>;
  create(d: Record<string, unknown>, o?: Record<string, unknown>): Promise<unknown>;
  insertMany(d: Record<string, unknown>[], o?: Record<string, unknown>): Promise<unknown>;
  updateMany(f: Filter, u: Record<string, unknown>, o?: Record<string, unknown>): MQuery<{ matchedCount: number }>;
  findOneAndUpdate(f: Filter, u: Record<string, unknown>, o?: Record<string, unknown>): MQuery<Record<string, unknown> | null>;
  deleteMany(f: Filter, o?: Record<string, unknown>): MQuery<{ deletedCount: number }>;
  collection: { createIndex(k: Record<string, 1 | -1>, o?: Record<string, unknown>): Promise<string> };
}
interface MSession { withTransaction<T>(fn: () => Promise<T>, o?: Record<string, unknown>): Promise<T>; endSession(): Promise<void> }
interface MConnection {
  models: Record<string, MModel>;
  model(name: string, schema: unknown, collection: string): MModel;
  startSession(): Promise<MSession>;
  close(): Promise<void>;
}
interface Mongoose {
  createConnection(url: string, o: Record<string, unknown>): { asPromise(): Promise<MConnection> };
  Schema: new (definition: Record<string, unknown>, options: Record<string, unknown>) => { add(fields: Record<string, unknown>): void };
}

const toMongoKey = (k: string) => (k === "id" ? "_id" : k);
function toMongoFilter(f: Filter): Filter {
  const out: Filter = {};
  for (const [k, v] of Object.entries(f)) {
    if (k === "$and" || k === "$or") out[k] = (v as Filter[]).map(toMongoFilter);
    else out[toMongoKey(k)] = v;
  }
  return out;
}
const toMongoDoc = (d: Record<string, unknown>) => { const { id, ...rest } = d; return { _id: id, ...rest }; };
const fromMongoDoc = <T>(d: Record<string, unknown>): T => { const { _id, ...rest } = d; return { id: _id, ...rest } as T; };
const isDup = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;
const dupIndex = (e: unknown): string => String((e as { message?: string }).message ?? "").match(/index: (\S+)/)?.[1] ?? "unknown";

function build(mongooseModule: Mongoose, connection: MConnection, session: MSession | null): Db {
  const modelFor = (name: string): MModel => connection.models[name] ?? connection.model(
    name,
    (() => {
      const schema = new mongooseModule.Schema({}, {
        strict: false,
        versionKey: false,
        minimize: false,
        id: false,
        autoIndex: false,
        bufferCommands: false,
      });
      schema.add({ _id: { type: String, required: true } });
      return schema;
    })(),
    name,
  );
  const withSession = <T>(query: MQuery<T>): MQuery<T> => session ? query.session(session) : query;
  const col = <T extends HasId>(name: string): Collection<T> => {
    const c = modelFor(name);
    const guard = async <R>(fn: () => Promise<R>): Promise<R> => { try { return await fn(); } catch (e) { if (isDup(e)) throw new DuplicateKeyError(name, dupIndex(e)); throw e; } };
    return {
      async find(filter = {}, opts: FindOpts = {}) {
        let cur = withSession(c.find(toMongoFilter(filter)));
        if (opts.sort) cur = cur.sort(opts.sort);
        if (opts.skip) cur = cur.skip(opts.skip);
        if (opts.limit !== undefined) cur = cur.limit(opts.limit);
        return (await cur.lean().exec()).map((d) => fromMongoDoc<T>(d));
      },
      async findOne(filter, opts = {}) {
        const rows = await this.find(filter, { ...opts, limit: 1 });
        return rows[0] ?? null;
      },
      count: (filter = {}) => withSession(c.countDocuments(toMongoFilter(filter))).exec(),
      insert: (doc) => guard(async () => {
        assertSafeDocument(doc);
        await c.create(toMongoDoc(prepareInsert(name, doc as unknown as Doc)), session ? { session } : undefined);
      }),
      insertMany: (docs) => guard(async () => {
        docs.forEach((d) => assertSafeDocument(d));
        if (docs.length) await c.insertMany(docs.map((d) => toMongoDoc(prepareInsert(name, d as unknown as Doc))), { ordered: true, ...(session ? { session } : {}) });
      }),
      update: async (filter, spec: UpdateSpec) => (assertSafeSpec(spec), await guard(() => withSession(c.updateMany(toMongoFilter(filter), spec as Record<string, unknown>)).exec())).matchedCount,
      async findOneAndUpdate(filter, spec, opts = {}) {
        assertSafeSpec(spec);
        let query = c.findOneAndUpdate(toMongoFilter(filter), spec as Record<string, unknown>, {
          upsert: opts.upsert ?? false,
          returnDocument: "after",
          ...(opts.sort ? { sort: opts.sort } : {}),
        });
        query = withSession(query);
        const r = await guard(() => query.lean().exec());
        return r ? fromMongoDoc<T>(r) : null;
      },
      delete: async (filter) => (await guard(() => withSession(c.deleteMany(toMongoFilter(filter))).exec())).deletedCount,
    };
  };
  const self: Db = {
    kind: "mongo",
    col,
    async tx(fn) {
      if (session) return fn(self);
      const s = await connection.startSession();
      try {
        return await s.withTransaction(() => fn(build(mongooseModule, connection, s)), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
      } finally { await s.endSession(); }
    },
    async ensureIndexes() {
      for (const ix of INDEXES) {
        await modelFor(ix.collection).collection.createIndex(ix.keys, { name: ix.name, unique: ix.unique ?? false, ...(ix.partial ? { partialFilterExpression: ix.partial } : {}) });
      }
    },
    close: () => connection.close(),
  };
  return self;
}

export async function createMongoDb(url: string, dbName?: string): Promise<Db> {
  const mongooseModule = (await import("mongoose")) as unknown as Mongoose;
  const connection = await mongooseModule.createConnection(url, {
    ...(dbName ? { dbName } : {}),
    retryWrites: true,
    w: "majority",
    maxPoolSize: 20,
    autoIndex: false,
    bufferCommands: false,
  }).asPromise();
  return build(mongooseModule, connection, null);
}
