// APISnapshot core: reduce a JSON value to its shape (paths and types, never values) and diff two shapes.

export const printable = (s) => String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '?');

// Keys that are data, not schema ({"123": {...}}, {"<uuid>": ...}) collapse to "*" so maps don't look like new fields.
const DYNAMIC_KEY = /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i;
const MAX_PATHS = 5000;

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const keyPath = (base, k) => (DYNAMIC_KEY.test(k) ? `${base}.*` : /^[A-Za-z_$][\w$]*$/.test(k) ? `${base}.${k}` : `${base}[${JSON.stringify(k)}]`);

// Returns { "$": "object", "$.items[]": "object", "$.items[].id": "number", "$.name": "null|string" }.
export function shape(value) {
  const out = new Map();
  const add = (path, t) => {
    if (!out.has(path)) { if (out.size >= MAX_PATHS) return false; out.set(path, new Set()); }
    out.get(path).add(t);
    return true;
  };
  const walk = (v, path, depth) => {
    const t = typeOf(v);
    if (!add(path, t) || depth > 64) return;
    if (t === 'array') for (const item of v) walk(item, `${path}[]`, depth + 1);
    else if (t === 'object') for (const [k, item] of Object.entries(v)) walk(item, keyPath(path, k), depth + 1);
  };
  walk(value, '$', 0);
  return Object.fromEntries([...out].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, ts]) => [p, [...ts].sort().join('|')]));
}

// Breaking: a field disappeared or its type changed (incl. becoming nullable). Added fields are not breaking.
const isChild = (p, q) => p.length > q.length && p.startsWith(q) && (p[q.length] === '.' || p[q.length] === '[');
// Report only the top-most missing path, not every field below it.
const ancestorMissing = (p, from, to) => Object.keys(from).some((q) => isChild(p, q) && !(q in to));
// Fields under an array that came back empty are unknown this time, not removed.
function underEmptyArray(p, after) {
  for (let i = p.lastIndexOf('[]'); i !== -1; i = p.lastIndexOf('[]', i - 1)) {
    const arr = p.slice(0, i);
    if (arr in after) return !Object.keys(after).some((q) => q.startsWith(`${arr}[]`));
  }
  return false;
}

export function diffShapes(before, after) {
  const removed = [], changed = [], added = [];
  for (const [p, t] of Object.entries(before)) {
    if (!(p in after)) {
      if (!underEmptyArray(p, after) && !ancestorMissing(p, before, after)) removed.push(p);
      continue;
    }
    const was = new Set(t.split('|'));
    // Only new types break clients. Fewer types, or a field only ever seen as null getting a value, is just a sample difference.
    if (t !== 'null' && after[p].split('|').some((x) => !was.has(x))) changed.push({ path: p, from: t, to: after[p] });
  }
  for (const p of Object.keys(after)) if (!(p in before) && !ancestorMissing(p, after, before)) added.push(p);
  return { removed, changed, added, breaking: removed.length + changed.length > 0 };
}

// ${VAR} in config values comes from the environment; missing vars are an error, never sent as literal text.
export function expandEnv(str, env = process.env) {
  return String(str).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => {
    if (env[k] === undefined) throw new Error(`environment variable ${k} is not set`);
    return env[k];
  });
}

// Safe to print: no query string (may hold api keys), no userinfo.
export function safeUrl(u) {
  try { const x = new URL(u); return printable(`${x.protocol}//${x.host}${x.pathname}${x.search ? '?…' : ''}`); } catch { return '(invalid url)'; }
}

export const nameFor = (u) => {
  try { const x = new URL(u); return `${x.host}${x.pathname}`.replace(/[^\w.-]+/g, '_').replace(/_+$/, '') || 'root'; } catch { return 'snapshot'; }
};
