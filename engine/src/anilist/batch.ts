/**
 * Several runs of one query in a single request, through GraphQL aliases. AniList's rate limit
 * counts requests, not what they carry, so batching saves most of a sync's waiting.
 */

/** Pages of 50 titles per request: 500 titles, the size of AniList's own list chunks. */
export const PAGES_PER_REQUEST = 10;

const cache = new Map<string, string>();

/**
 * `query` (one operation with declared variables and a single root field, plus fragments) run
 * `n` times: the root field of run `i` is aliased `q<i>` and its variables are suffixed `_<i>`.
 */
export function batchQuery(query: string, n: number): string {
  const key = `${n}\u0000${query}`;
  const known = cache.get(key);
  if (known) return known;
  const open = query.indexOf("query (");
  if (open < 0) throw new Error("only queries with declared variables can be batched");
  const declsStart = open + "query (".length;
  const declsEnd = matching(query, declsStart - 1, "(", ")");
  const bodyStart = query.indexOf("{", declsEnd);
  const bodyEnd = matching(query, bodyStart, "{", "}");
  const decls = query.slice(declsStart, declsEnd).trim();
  const body = query.slice(bodyStart + 1, bodyEnd).trim();
  const rest = query.slice(bodyEnd + 1);
  const rename = (text: string, i: number) => text.replace(/\$(\w+)/g, `$$$1_${i}`);
  const runs = Array.from({ length: n }, (_, i) => i);
  const batched = `\nquery (${runs.map((i) => rename(decls, i)).join(", ")}) {\n${runs
    .map((i) => `  q${i}: ${rename(body, i)}`)
    .join("\n")}\n}${rest}`;
  cache.set(key, batched);
  return batched;
}

/** Variables for `batchQuery`: each run's variables, suffixed with its index. */
export function batchVariables(runs: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  runs.forEach((vars, i) => {
    for (const [k, v] of Object.entries(vars)) out[`${k}_${i}`] = v;
  });
  return out;
}

/** Undo `batchVariables`, for fakes that answer batched requests run by run. */
export function unbatchVariables(variables: Record<string, unknown>): Record<string, unknown>[] {
  const runs: Record<string, unknown>[] = [];
  for (const [k, v] of Object.entries(variables)) {
    const m = /^(\w+)_(\d+)$/.exec(k);
    if (!m) continue;
    const i = Number(m[2]);
    runs[i] = { ...(runs[i] ?? {}), [m[1] as string]: v };
  }
  return Array.from(runs, (r) => r ?? {});
}

/** Split `items` into groups of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function matching(text: string, at: number, open: string, close: string): number {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i;
  }
  throw new Error(`unbalanced ${open}${close} in query`);
}
