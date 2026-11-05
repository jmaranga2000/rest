/**
 * A tiny, injection-safe SQL builder.
 *
 *   const q = sql`SELECT * FROM orders WHERE org_id = ${orgId} AND status IN ${list(statuses)}`;
 *
 * Every interpolated value becomes a bound parameter ($1, $2 …). Fragments can be
 * nested and re-used; `raw()` is for trusted, code-authored SQL only (never user input).
 */
export type Value = string | number | boolean | null | undefined;

export class Sql {
  constructor(
    readonly strings: readonly string[],
    readonly values: readonly (Value | Sql | ListValue)[],
  ) {}

  /** Flatten to a single statement with numbered placeholders. */
  build(): { text: string; params: Value[] } {
    const params: Value[] = [];
    const render = (s: Sql): string => {
      let out = s.strings[0] ?? "";
      s.values.forEach((v, i) => {
        if (v instanceof Sql) out += render(v);
        else if (v instanceof ListValue) {
          if (v.items.length === 0) out += "(NULL)";
          else out += `(${v.items.map((item) => { params.push(item); return `$${params.length}`; }).join(", ")})`;
        } else {
          params.push(v === undefined ? null : v);
          out += `$${params.length}`;
        }
        out += s.strings[i + 1] ?? "";
      });
      return out;
    };
    return { text: render(this), params };
  }
}

export class ListValue {
  constructor(readonly items: readonly Value[]) {}
}

export function sql(strings: TemplateStringsArray, ...values: (Value | Sql | ListValue)[]): Sql {
  return new Sql(strings, values);
}

/** Expands to `($1, $2, …)` for IN clauses. An empty list becomes `(NULL)` (matches nothing). */
export function list(items: readonly Value[]): ListValue {
  return new ListValue(items);
}

/** Trusted SQL text. Never pass user input. */
export function raw(text: string): Sql {
  return new Sql([text], []);
}

export const empty = raw("");

/** Join fragments with a separator: join([sql`a = ${1}`, sql`b = ${2}`], " AND "). */
export function join(parts: Sql[], separator = ", "): Sql {
  if (parts.length === 0) return empty;
  const strings: string[] = [""];
  const values: (Value | Sql | ListValue)[] = [];
  parts.forEach((p, i) => {
    if (i > 0) strings[strings.length - 1] += separator;
    values.push(p);
    strings.push("");
  });
  return new Sql(strings, values);
}

/** Conditional WHERE builder: where([cond1, cond2]) → "WHERE c1 AND c2" or "". */
export function where(conds: (Sql | null | undefined | false)[]): Sql {
  const parts = conds.filter((c): c is Sql => !!c);
  return parts.length ? sql`WHERE ${join(parts, " AND ")}` : empty;
}

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

const IDENT = /^[a-zA-Z][a-zA-Z0-9_]*$/;
export function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return name;
}
