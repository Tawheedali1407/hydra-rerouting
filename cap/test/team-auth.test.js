// Team-only access: with TEAM_USERS set, pages and API need a team login; /health stays open.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = 4196, BASE = `http://127.0.0.1:${PORT}`;
const hash = crypto.createHash('sha256').update('s3cret-2').digest('hex');
const auth = (u, p) => ({ authorization: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64') });
let srv;
before(async () => {
  srv = spawn(process.execPath, [require.resolve('@sap/cds/bin/serve.js')], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NODE_ENV: 'production', TEAM_USERS: `ali:s3cret-1, priya:sha256:${hash}` }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return; } catch {} await new Promise(r => setTimeout(r, 150)); }
  throw new Error('server did not start');
});
after(() => srv?.kill());
test('no login → 401 with a browser login prompt, for the page and the API', async () => {
  for (const u of ['/', '/index.html', '/odata/v4/rerouting/PurchaseOrders', '/odata/v4/rerouting/$metadata']) {
    const r = await fetch(BASE + u); assert.equal(r.status, 401, u); assert.match(r.headers.get('www-authenticate'), /^Basic/);
  }
});
test('wrong password or unknown user → 401', async () => {
  assert.equal((await fetch(`${BASE}/`, { headers: auth('ali', 'nope') })).status, 401);
  assert.equal((await fetch(`${BASE}/`, { headers: auth('eve', 's3cret-1') })).status, 401);
});
test('team members get in (plain and hashed entries); approvals record who', async () => {
  assert.equal((await fetch(`${BASE}/`, { headers: auth('ali', 's3cret-1') })).status, 200);
  assert.equal((await fetch(`${BASE}/odata/v4/rerouting/Assets`, { headers: auth('priya', 's3cret-2') })).status, 200);
  const r = await fetch(`${BASE}/odata/v4/rerouting/dispatchPlan`, { method: 'POST', headers: { ...auth('priya', 's3cret-2'), 'content-type': 'application/json' }, body: JSON.stringify({ incident: { title: 'auth test' }, updates: [{ PurchaseOrder: '4500019102', PurchaseOrderItem: '10', ConfirmedDelivery: new Date(Date.now() + 9e6).toISOString() }], source: 'Dispatch agent · T' }) });
  assert.equal(r.status, 200);
  const h = await fetch(`${BASE}/odata/v4/rerouting/OrderHistory?$filter=PurchaseOrder eq '4500019102'`, { headers: auth('ali', 's3cret-1') }).then(r => r.json());
  assert.ok(h.value.some(x => x.source === 'Dispatch agent · T · by priya'));
});
test('/health stays open for Cloud Foundry', async () => { assert.equal((await fetch(`${BASE}/health`)).status, 200); });
