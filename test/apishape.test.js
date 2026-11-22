import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shape, diffShapes, expandEnv, safeUrl, nameFor } from '../src/index.js';

const BIN = new URL('../bin/apishape.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
// async spawn: the test server runs in this process, so spawnSync would deadlock
const run = (args, cwd, env = {}) => new Promise((done) => {
  const p = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', ...env } });
  let stdout = '', stderr = '';
  p.stdout.on('data', (d) => (stdout += d)); p.stderr.on('data', (d) => (stderr += d));
  p.on('close', (status) => done({ status, stdout, stderr }));
});
const dir = () => mkdtempSync(join(tmpdir(), 'apishape-'));

test('shape keeps paths and types, never values', () => {
  const s = shape({ id: 1, email: 'a@b.c', tags: ['x'], items: [{ id: 1, note: null }, { id: 2, note: 'hi' }], '7f3a9c2e-1111-4222-8333-444455556666': { ok: true }, 'odd key': 1 });
  assert.deepEqual(s, {
    '$': 'object', '$.*': 'object', '$.*.ok': 'boolean', '$.email': 'string', '$.id': 'number',
    '$.items': 'array', '$.items[]': 'object', '$.items[].id': 'number', '$.items[].note': 'null|string',
    '$.tags': 'array', '$.tags[]': 'string', '$["odd key"]': 'number',
  });
  assert.doesNotMatch(JSON.stringify(s), /a@b\.c|hi"/);
});

test('diff: removed and retyped fields break, added and narrowed do not', () => {
  const before = shape({ id: 1, user: { name: 'a', age: 3 }, items: [{ sku: 'x' }], note: null, tag: 'a' });
  before['$.tag'] = 'null|string';
  const after = shape({ id: '1', items: [], note: 'x', tag: 'b', extra: { deep: 1 } });
  const d = diffShapes(before, after);
  assert.deepEqual(d.removed, ['$.user']); // children not repeated; $.items[].sku unknown (empty array)
  assert.deepEqual(d.changed, [{ path: '$.id', from: 'number', to: 'string' }]);
  assert.deepEqual(d.added, ['$.extra']);
  assert.equal(d.breaking, true);
  assert.equal(diffShapes(before, before).breaking, false);
  assert.equal(diffShapes(shape({ username: 1 }), shape({ user: 1 })).removed[0], '$.username');
});

test('helpers: env expansion, safe urls, names, hostile input', () => {
  assert.equal(expandEnv('Bearer ${T}', { T: 'abc' }), 'Bearer abc');
  assert.throws(() => expandEnv('${NOPE}', {}), /NOPE is not set/);
  assert.equal(safeUrl('https://user:pw@api.x.com/v1/users?key=secret'), 'https://api.x.com/v1/users?…');
  assert.equal(nameFor('https://api.x.com/v1/users?key=1'), 'api.x.com_v1_users');
  let deep = {}; for (let i = 0; i < 10000; i++) deep = { a: deep };
  assert.ok(Object.keys(shape(deep)).length <= 70);
  const wide = Object.fromEntries(Array.from({ length: 20000 }, (_, i) => [`k${i}`, i]));
  assert.equal(Object.keys(shape(wide)).length, 5000);
});

test('CLI against a local server: create, pass, break, update, secrets never printed', async () => {
  let body = { users: [{ id: 1, email: 'x@y.z' }], total: 1 };
  let seenAuth;
  const srv = createServer((req, res) => {
    seenAuth = req.headers.authorization;
    if (req.url.startsWith('/redirect')) { res.writeHead(302, { location: 'http://evil.example/' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/users?api_key=SECRET123`;
  const cwd = dir();
  try {
    let r = await run([url, '--name', 'users', '-H', 'Authorization: Bearer ${TOKEN}'], cwd, { TOKEN: 'tok-SECRET' });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /users: snapshot created/);
    assert.equal(seenAuth, 'Bearer tok-SECRET');
    const snap = readFileSync(join(cwd, '.apishape', 'users.json'), 'utf8');
    assert.doesNotMatch(snap, /x@y\.z|SECRET/);
    r = await run([url, '--name', 'users', '-H', 'Authorization: Bearer ${TOKEN}'], cwd, { TOKEN: 'tok-SECRET' });
    assert.equal(r.status, 0); assert.match(r.stdout, /✓ users: same shape/);
    body = { users: [{ id: '1' }], total: 1, page: 1 };
    r = await run([url, '--name', 'users', '-H', 'Authorization: Bearer ${TOKEN}'], cwd, { TOKEN: 'tok-SECRET' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /- \$\.users\[\]\.email {2}\(removed\)/);
    assert.match(r.stdout, /~ \$\.users\[\]\.id {2}number → string/);
    assert.match(r.stdout, /\+ \$\.page {2}\(new\)/);
    assert.doesNotMatch(r.stdout + r.stderr, /SECRET/);
    assert.equal((await run([url, '--name', 'users', '--update', '-H', 'Authorization: Bearer ${TOKEN}'], cwd, { TOKEN: 'x' })).status, 0);
    assert.equal((await run([url, '--name', 'users', '-H', 'Authorization: Bearer ${TOKEN}'], cwd, { TOKEN: 'x' })).status, 0);
    // missing env var: fails before sending anything
    r = await run([url, '--name', 'users', '-H', 'Authorization: Bearer ${MISSING_VAR}'], cwd);
    assert.equal(r.status, 2); assert.match(r.stderr, /MISSING_VAR is not set/);
    // redirects are not followed (auth header never reaches another host)
    r = await run([url.replace('/users', '/redirect'), '--name', 'redir'], cwd);
    assert.equal(r.status, 0); assert.match(readFileSync(join(cwd, '.apishape', 'redir.json'), 'utf8'), /"status": 302/);
    r = await run(['http://127.0.0.1:1/x?token=SECRET9', '--name', 'down', '--timeout', '2000'], cwd);
    assert.equal(r.status, 2); assert.doesNotMatch(r.stderr, /SECRET9/);
  } finally { srv.close(); }
});

test('CLI: config file, local files, --strict, --json and path safety', async () => {
  const cwd = dir();
  writeFileSync(join(cwd, 'a.json'), JSON.stringify({ id: 1 }));
  writeFileSync(join(cwd, 'apishape.json'), JSON.stringify({ endpoints: [{ name: 'a', file: 'a.json' }] }));
  assert.equal((await run([], cwd)).status, 0);
  writeFileSync(join(cwd, 'a.json'), JSON.stringify({ id: 1, extra: true }));
  assert.equal((await run([], cwd)).status, 0);
  assert.equal((await run(['--strict'], cwd)).status, 1);
  const j = JSON.parse((await run(['--json'], cwd)).stdout);
  assert.deepEqual(j.endpoints[0].added, ['$.extra']);
  assert.equal((await run(['../outside.json'], cwd)).status, 2);
  assert.equal((await run(['a.json', '--name', '../../evil'], cwd)).status, 2);
  assert.equal(existsSync(join(cwd, '..', 'evil.json')), false);
  const bad = await run(['--strct'], cwd);
  assert.equal(bad.status, 2); assert.match(bad.stderr, /did you mean --strict/);
});
