// API tests for the Hydra CAP service. Boots the real server with NODE_ENV=production (the profile
// Cloud Foundry uses) and exercises every read and write path the web app relies on.
// Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = process.env.TEST_PORT || 4199;
const BASE = `http://127.0.0.1:${PORT}`;
const API = `${BASE}/odata/v4/rerouting`;
let srv;

const j = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: { 'content-type': 'application/json', accept: 'application/json', ...(opt.headers || {}) } });
  const body = r.status === 204 ? null : await r.json().catch(() => null);
  return { status: r.status, body, headers: r.headers };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const poKey = (po, item) => `${API}/PurchaseOrders(PurchaseOrder='${po}',PurchaseOrderItem='${item}')`;

before(async () => {
  srv = spawn(process.execPath, [require.resolve('@sap/cds/bin/serve.js')], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch {}
    await sleep(150);
  }
  throw new Error('server did not start:\n' + log);
});
after(() => srv?.kill());

test('serves the web app and health endpoint', async () => {
  const r = await fetch(`${BASE}/`); assert.equal(r.status, 200);
  assert.match(await r.text(), /SAP Rerouting|Rerouting/);
  assert.equal((await fetch(`${BASE}/rerouting-rules.js`)).status, 200);
});

test('info reports the runtime honestly', async () => {
  const { status, body } = await j(`${API}/info()`);
  assert.equal(status, 200);
  assert.match(body.db, /sqlite/); assert.equal(body.messaging, 'local-messaging');
  assert.ok(Date.parse(body.anchoredAt));
});

test('reads seed data', async () => {
  const a = await j(`${API}/Assets`), p = await j(`${API}/PurchaseOrders`), i = await j(`${API}/Incidents`);
  assert.equal(a.body.value.length, 8); assert.equal(p.body.value.length, 14); assert.equal(i.body.value.length, 6);
  const kb = p.body.value.find(x => x.PurchaseOrder === '4500018231');
  assert.ok(Date.parse(kb.DeliveryDate) > Date.now(), 'due dates are re-anchored to now');
});

test('classify runs server-side', async () => {
  const { status, body } = await j(`${API}/classify(text='${encodeURIComponent('Severe cyclone over Gulf of Aden, ships told to avoid')}')`);
  assert.equal(status, 200);
  assert.equal(body.event_type, 'Weather'); assert.equal(body.severity, 'Critical'); assert.equal(body.location, 'Gulf Of Aden');
  assert.equal(Number(body.lat), 12.8); assert.equal(body.action, 'TRIGGER_IMPACT_AGENT'); assert.match(body.engine, /^rules/);
  assert.equal((await j(`${API}/classify(text='')`)).status, 400);
});

test('create PO: number range, validation, change log', async () => {
  const bad = await j(`${API}/PurchaseOrders`, { method: 'POST', body: JSON.stringify({ Quantity: 0, SLATier: 'Gold', DeliveryDate: new Date().toISOString() }) });
  assert.equal(bad.status, 400);
  const body = { MaterialText: 'Servo motors', Material: 'MAT-SV-7710', Quantity: 600, Unit: 'EA', Plant: 'IN01', Supplier: 'Coromandel', Asset_ID: 'TR1', DeliveryDate: new Date(Date.now() + 36e6).toISOString(), NetValue: 1850000, Currency: 'INR', SLATier: 'Silver' };
  const { status, body: po } = await j(`${API}/PurchaseOrders`, { method: 'POST', headers: { 'x-rerouting-source': encodeURIComponent('Orders & SLA') }, body: JSON.stringify(body) });
  assert.equal(status, 201); assert.equal(po.PurchaseOrder, '4500019301'); assert.equal(po.PurchaseOrderItem, '10');
  const h = await j(`${API}/OrderHistory?$filter=PurchaseOrder eq '4500019301'`);
  assert.equal(h.body.value[0].field, 'Created'); assert.equal(h.body.value[0].source, 'Orders & SLA');
});

test('PATCH PO writes a change document with the caller as source', async () => {
  const eta = new Date(Date.now() + 50 * 36e5).toISOString();
  const r = await j(poKey('4500019102', '10'), { method: 'PATCH', headers: { 'x-rerouting-source': encodeURIComponent('Test agent') }, body: JSON.stringify({ ConfirmedDelivery: eta }) });
  assert.equal(r.status, 200);
  const h = await j(`${API}/OrderHistory?$filter=PurchaseOrder eq '4500019102' and field eq 'ConfirmedDelivery'`);
  assert.equal(h.body.value.length, 1); assert.equal(h.body.value[0].source, 'Test agent');
});

test('dispatchPlan writes POs, change log, incident and business event together', async () => {
  const eta = new Date(Date.now() + 650 * 36e5).toISOString();
  const updates = [{ PurchaseOrder: '4500018231', PurchaseOrderItem: '10', ConfirmedDelivery: eta }, { PurchaseOrder: '4500018244', PurchaseOrderItem: '20', ConfirmedDelivery: eta }];
  const incident = { title: 'Cyclone ARB-04 across the Gulf of Aden lane', kind: 'Weather', mode: 'Sea', severity: 'Critical', confidence: 0.94, lat: 13, lon: 50, radiusKm: 390, assets: 'MV Kestrel Bay', chosenRoute: 'Cape diversion', status: 'Mitigated', detectedAt: new Date().toISOString(), responseSeconds: 102, posAffected: 4, posProtected: 2 };
  const { status, body } = await j(`${API}/dispatchPlan`, { method: 'POST', body: JSON.stringify({ incident, updates, source: 'Dispatch agent · test' }) });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.code, 'INC-' + new Date().getFullYear() + '-0413'); assert.equal(body.posUpdated, 2); assert.equal(body.changes, 2);
  assert.equal(body.topic, 'rerouting/reroute/v1/approved');

  const po = await j(poKey('4500018231', '10'));
  assert.equal(Date.parse(po.body.ConfirmedDelivery), Date.parse(eta));
  const h = await j(`${API}/OrderHistory?$filter=source eq 'Dispatch agent · test'`);
  assert.equal(h.body.value.length, 2);
  const inc = await j(`${API}/Incidents(${body.incident})`);
  assert.equal(inc.body.code, body.code); assert.equal(inc.body.chosenRoute, 'Cape diversion');

  let ev; for (let i = 0; i < 20 && !ev; i++) { await sleep(100); ev = (await j(`${API}/EventLog(${body.eventId})`)).body; if (ev?.error) ev = null; }
  assert.ok(ev, 'event reached the subscriber'); assert.equal(ev.topic, 'rerouting/reroute/v1/approved');
  assert.deepEqual(JSON.parse(ev.payload).pos, ['4500018231/10', '4500018244/20']);
});

test('dispatchPlan is atomic: one unknown PO rolls everything back', async () => {
  const before = (await j(poKey('4500018259', '10'))).body.ConfirmedDelivery;
  const nInc = (await j(`${API}/Incidents/$count`)).body;
  const eta = new Date(Date.now() + 999 * 36e5).toISOString();
  const r = await j(`${API}/dispatchPlan`, { method: 'POST', body: JSON.stringify({ incident: { title: 'Should roll back' }, updates: [{ PurchaseOrder: '4500018259', PurchaseOrderItem: '10', ConfirmedDelivery: eta }, { PurchaseOrder: '9999999999', PurchaseOrderItem: '10', ConfirmedDelivery: eta }] }) });
  assert.equal(r.status, 404);
  assert.equal((await j(poKey('4500018259', '10'))).body.ConfirmedDelivery, before);
  assert.equal((await j(`${API}/Incidents/$count`)).body, nInc);
});

test('CORS: GitHub Pages origin allowed, unknown origin not', async () => {
  const pre = await fetch(`${API}/dispatchPlan`, { method: 'OPTIONS', headers: { origin: 'https://tawheedali1407.github.io', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-rerouting-source' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://tawheedali1407.github.io');
  assert.match(pre.headers.get('access-control-allow-headers'), /x-rerouting-source/);
  const evil = await fetch(`${API}/Assets`, { headers: { origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

test('dispatchPlan sends crew orders; captain replies; bad input rejected', async () => {
  const eta = new Date(Date.now() + 7 * 36e5).toISOString();
  const orders = [{ asset_ID: 'TR1', routeName: 'Chittoor–Kolar', instruction: 'Leave NH48, take NH716 via Chittoor–Kolar', newEta: eta }];
  const incident = { title: 'Flood · NH48 Ambur', kind: 'Flood', mode: 'Road', severity: 'High', confidence: 0.91, status: 'Mitigated' };
  const { status, body } = await j(`${API}/dispatchPlan`, { method: 'POST', body: JSON.stringify({ incident, updates: [{ PurchaseOrder: '4500019102', PurchaseOrderItem: '10', ConfirmedDelivery: eta }], source: 'Dispatch agent · crew', orders }) });
  assert.equal(status, 200, JSON.stringify(body)); assert.equal(body.ordersSent, 1);
  const d = (await j(`${API}/Dispatches?$filter=incidentCode eq '${body.code}'`)).body.value;
  assert.equal(d.length, 1); assert.equal(d[0].asset_ID, 'TR1'); assert.equal(d[0].status, 'Sent');
  const r = await j(`${API}/reply`, { method: 'POST', body: JSON.stringify({ ID: d[0].ID, status: 'Problem', note: 'Chittoor road also flooded' }) });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'Problem'); assert.equal(r.body.reply, 'Chittoor road also flooded'); assert.ok(r.body.repliedAt);
  assert.equal((await j(`${API}/reply`, { method: 'POST', body: JSON.stringify({ ID: d[0].ID, status: 'Maybe' }) })).status, 400);
  assert.equal((await j(`${API}/reply`, { method: 'POST', body: JSON.stringify({ ID: '00000000-0000-0000-0000-000000000000', status: 'Accepted' }) })).status, 404);
  // Dispatches are read-only over OData: only dispatchPlan and reply write them
  assert.equal((await j(`${API}/Dispatches`, { method: 'POST', body: JSON.stringify({ asset_ID: 'TR1' }) })).status, 405);
  // unknown asset rolls the whole plan back
  const bad = await j(`${API}/dispatchPlan`, { method: 'POST', body: JSON.stringify({ incident: { title: 'x' }, updates: [], orders: [{ asset_ID: 'NOPE' }] }) });
  assert.equal(bad.status, 404);
});

test('crew report is stored as an incident', async () => {
  const r = await j(`${API}/Incidents`, { method: 'POST', body: JSON.stringify({ code: 'RPT-000001', title: 'Water over the road near Ambur', kind: 'Flood', severity: 'High', confidence: 0.9, lat: 12.79, lon: 78.72, assets: 'TN-09-AX-4411', status: 'Reported by crew', detectedAt: new Date().toISOString() }) });
  assert.equal(r.status, 201);
  const q = await j(`${API}/Incidents?$filter=status eq 'Reported by crew'`); assert.equal(q.body.value.length, 1);
});

test('classifier says which engine answered; info reports AI Core and runtime', async () => {
  const { body } = await j(`${API}/classify(text='${encodeURIComponent('Landslide at Shiradi Ghat, NH75 closed')}')`);
  assert.equal(body.event_type, 'Landslide'); assert.match(body.engine, /^rules/); assert.match(body.note, /AI Core not bound/);
  const inf = (await j(`${API}/info()`)).body; assert.equal(inf.aiCore, 'not bound'); assert.equal(inf.runtime, 'local');
  const a = (await j(`${API}/Assets('TR1')`)).body; assert.equal(a.captain, 'Driver Murugan K');
});

test('resetDemo restores seed data', async () => {
  const r = await j(`${API}/resetDemo`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 200);
  assert.equal((await j(`${API}/Incidents/$count`)).body, 6);
  assert.equal((await j(`${API}/PurchaseOrders/$count`)).body, 14);
  assert.equal((await j(`${API}/EventLog/$count`)).body, 0);
  assert.equal((await j(`${API}/Dispatches/$count`)).body, 0);
  assert.equal((await j(`${API}/OrderHistory?$filter=source eq 'Dispatch agent · test'`)).body.value.length, 0);
});
