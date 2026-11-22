#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { parseArgs } from 'node:util';
import { shape, diffShapes, expandEnv, safeUrl, nameFor, printable } from '../src/index.js';

const HELP = `Usage: apishape [<url-or-file.json> ...] [options]
       apishape                 (uses the endpoints in apishape.json)

Saves the SHAPE of JSON API responses (field paths and types, never values) in
.apishape/<name>.json and fails when a later response removes a field or changes
its type. Snapshots hold no data, so they are safe to commit.

Options:
  --update        Save the current shapes as the new snapshots
  --strict        New fields also fail
  -H, --header H  Request header for URL arguments, e.g. -H "Authorization: Bearer \${TOKEN}"
                  (\${VAR} is read from the environment and never printed)
  --name NAME     Snapshot name for a single URL/file argument
  --config FILE   Config file (default apishape.json)
  --timeout MS    Request timeout (default 15000)
  --json          Machine-readable output
  -h, --help      Show help
  -v, --version   Show version

Exit codes: 0 = no breaking change, 1 = breaking change, 2 = usage, network or file error`;

const OPTIONS = { update: { type: 'boolean' }, strict: { type: 'boolean' }, header: { type: 'string', short: 'H', multiple: true },
  name: { type: 'string' }, config: { type: 'string' }, timeout: { type: 'string' }, json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } };
const DIR = '.apishape';
const MAX_BYTES = 10 * 1024 * 1024;

const die = (msg) => { process.stderr.write(`apishape: ${printable(msg)}\n`); process.exit(2); };

let args;
try { args = parseArgs({ allowPositionals: true, options: OPTIONS }); } catch (e) {
  const bad = /'(--?[\w-]+)'/.exec(e.message)?.[1];
  const near = bad && Object.keys(OPTIONS).find((k) => bad.length > 3 && `--${k}`.startsWith(bad.slice(0, 4)));
  die(`${bad ? `unknown option ${bad}` : e.message}${near ? ` (did you mean --${near}?)` : ''}. See --help.`);
}
const { values: o, positionals } = args;
if (o.help) { console.log(HELP); process.exit(0); }
if (o.version) { console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version); process.exit(0); }
const timeout = o.timeout === undefined ? 15000 : Number(o.timeout);
if (!Number.isInteger(timeout) || timeout <= 0) die('--timeout needs a positive number of milliseconds');

const inside = (p) => { const r = relative(process.cwd(), resolve(p)); return r && !r.startsWith('..') && !isAbsolute(r); };
const parseHeaders = (list = []) => Object.fromEntries(list.map((h) => {
  const i = h.indexOf(':');
  if (i < 1) die(`header must look like "Name: value"`);
  return [h.slice(0, i).trim(), h.slice(i + 1).trim()];
}));

let endpoints;
if (positionals.length) {
  if (o.name && positionals.length > 1) die('--name works with a single URL or file');
  endpoints = positionals.map((src) => ({ name: o.name ?? nameFor(src), src, headers: parseHeaders(o.header) }));
} else {
  const cfgPath = o.config ?? 'apishape.json';
  let cfg;
  try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT' && !o.config) { console.log(HELP); process.exit(2); }
    die(`cannot read ${cfgPath}: ${e.code ?? e.message}`);
  }
  if (!Array.isArray(cfg.endpoints) || !cfg.endpoints.length) die(`${cfgPath} needs an "endpoints" list`);
  endpoints = cfg.endpoints.map((e, i) => {
    const src = e.url ?? e.file;
    if (typeof src !== 'string') die(`endpoint ${i + 1} needs "url" or "file"`);
    if (e.headers !== undefined && (typeof e.headers !== 'object' || Array.isArray(e.headers))) die(`endpoint ${i + 1}: "headers" must be an object`);
    return { name: e.name ?? nameFor(src), src, method: e.method, headers: e.headers ?? {}, body: e.body, isFile: !!e.file };
  });
}
for (const e of endpoints) if (!/^[\w.-]{1,100}$/.test(e.name) || /^\.+$/.test(e.name)) die(`invalid snapshot name "${e.name}" (letters, digits, . _ - only)`);

async function load(e) {
  const isUrl = !e.isFile && /^https?:\/\//i.test(e.src);
  if (!isUrl) {
    if (!inside(e.src)) die(`${e.src} is outside the current folder`);
    try { return { status: null, body: JSON.parse(readFileSync(e.src, 'utf8')) }; } catch (err) { die(`cannot read ${e.src}: ${err.code ?? 'invalid JSON'}`); }
  }
  let url, headers;
  try {
    url = expandEnv(e.src);
    headers = Object.fromEntries(Object.entries(e.headers).map(([k, v]) => [k, expandEnv(v)]));
  } catch (err) { die(`${e.name}: ${err.message}`); }
  const where = safeUrl(url);
  let res;
  try {
    // redirect: manual so auth headers are never sent to another host; a 3xx shows up as a status change.
    res = await fetch(url, { method: e.method ?? 'GET', headers: { accept: 'application/json', ...headers },
      body: e.body === undefined ? undefined : JSON.stringify(e.body), redirect: 'manual', signal: AbortSignal.timeout(timeout) });
  } catch (err) { die(`${e.name}: request to ${where} failed (${err.name === 'TimeoutError' ? 'timeout' : err.cause?.code ?? err.name})`); }
  const chunks = []; let size = 0;
  for await (const c of res.body ?? []) { size += c.length; if (size > MAX_BYTES) die(`${e.name}: response from ${where} is over 10 MB`); chunks.push(c); }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return { status: res.status, body: null };
  try { return { status: res.status, body: JSON.parse(text) }; } catch { die(`${e.name}: ${where} returned ${res.status} with a non-JSON body`); }
}

const color = (process.stdout.isTTY || !!process.env.FORCE_COLOR) && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const results = [];
let failed = false;
for (const e of endpoints) {
  const { status, body } = await load(e);
  const now = { status, shape: shape(body) };
  const file = join(DIR, `${e.name}.json`);
  const save = () => { mkdirSync(DIR, { recursive: true }); writeFileSync(file, JSON.stringify(now, null, 2) + '\n'); };
  if (o.update || !existsSync(file)) {
    const existed = existsSync(file);
    save();
    results.push({ name: e.name, result: existed ? 'updated' : 'created', paths: Object.keys(now.shape).length });
    continue;
  }
  let before;
  try { before = JSON.parse(readFileSync(file, 'utf8')); } catch { die(`${file} is not valid JSON (run with --update to recreate it)`); }
  const d = diffShapes(before.shape ?? {}, now.shape);
  const statusChanged = before.status !== now.status;
  const broke = d.breaking || statusChanged || (o.strict && d.added.length > 0);
  failed ||= broke;
  results.push({ name: e.name, result: broke ? 'breaking' : d.added.length ? 'added' : 'ok', ...(statusChanged && { status: { from: before.status, to: now.status } }), removed: d.removed, changed: d.changed, added: d.added });
}

if (o.json) console.log(JSON.stringify({ ok: !failed, endpoints: results }, null, 2));
else {
  for (const r of results) {
    const n = printable(r.name);
    if (r.result === 'created' || r.result === 'updated') { console.log(`${c(36, '●')} ${n}: snapshot ${r.result} (${r.paths} paths) in ${DIR}/`); continue; }
    console.log(`${r.result === 'breaking' ? c(31, '✗') : r.result === 'added' ? c(33, '+') : c(32, '✓')} ${n}${r.result === 'ok' ? ': same shape' : ''}`);
    if (r.status) console.log(`    ${c(31, '~')} status ${r.status.from} → ${r.status.to}`);
    for (const p of r.removed) console.log(`    ${c(31, '-')} ${printable(p)}  (removed)`);
    for (const x of r.changed) console.log(`    ${c(31, '~')} ${printable(x.path)}  ${x.from} → ${x.to}`);
    for (const p of r.added) console.log(`    ${c(o.strict ? 31 : 33, '+')} ${printable(p)}  (new)`);
  }
  if (failed) console.log(`\n${c(31, 'Breaking changes found.')} If they are intended, run with --update and commit ${DIR}/.`);
}
process.exit(failed ? 1 : 0);
