// End-to-end: drives the real web app in Chromium against the real CAP service.
//  A. UI served by CAP (same origin, what BTP serves)
//  B. UI served elsewhere with ?api=<backend> (cross-origin, what GitHub Pages → BTP looks like)
//  C. ?api=demo (no backend)
//  D. backend unreachable (falls back to demo, says so)
// Run: npm run test:e2e   (needs the `playwright` package and a Chromium build)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CAP = path.join(HERE, '..'), ROOT = path.join(CAP, '..');
const SHOTS = process.env.SHOTS_DIR || path.join(CAP, 'test', 'screenshots');
const BPORT = 4201, SPORT = 4300;
const BACK = `http://127.0.0.1:${BPORT}`, API = `${BACK}/odata/v4/hydra`, STATIC = `http://localhost:${SPORT}`;
let srv, web, browser;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async p => (await fetch(API + p, { headers: { accept: 'application/json' } })).json();
const count = async e => Number(await (await fetch(`${API}/${e}/$count`)).text());

before(async () => {
  await mkdir(SHOTS, { recursive: true });
  srv = spawn(process.execPath, [require.resolve('@sap/cds/bin/serve.js')], { cwd: CAP, env: { ...process.env, PORT: BPORT, NODE_ENV: 'production' }, stdio: 'ignore' });
  web = createServer(async (req, res) => { // plain static server for the repo root, like GitHub Pages
    const f = decodeURIComponent(new URL(req.url, STATIC).pathname.replace(/^\/$/, '/index.html'));
    try { const b = await readFile(path.join(ROOT, f)); res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(b); }
    catch { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>404</h1>'); }
  }).listen(SPORT);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BACK}/health`)).ok) break; } catch {} await sleep(150); }
  browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
});
after(async () => { await browser?.close(); web?.close(); srv?.kill(); });

async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], calls = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/tile|cartocdn|fonts\.g|ERR_NAME|ERR_TUNNEL|ERR_CONNECTION|ERR_FAILED|status of 404/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => { if (r.url().includes('/odata/')) calls.push(r.method() + ' ' + r.url()); });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#dataPill')?.textContent.match(/live|Demo/));
  return { page, ctx, errors, calls };
}
async function runAndApprove(page, scenario) {
  await page.evaluate(() => go('overview'));
  await page.click(`[data-run="${scenario}"]`);
  await page.waitForSelector('#b-approval:not([hidden])', { timeout: 10000 });
  await page.evaluate(() => go('approval'));
  await page.click('#apBtn');
  await page.waitForFunction(() => document.querySelector('#planBox')?.textContent.includes('Dispatched'), null, { timeout: 10000 });
  await sleep(2500); // dispatch log lines stream in
}

test('A · same origin: approve writes POs, change log, incident and event to CAP', async () => {
  const seedETA = (await get(`/PurchaseOrders(PurchaseOrder='4500018231',PurchaseOrderItem='10')`)).ConfirmedDelivery;
  const nInc = await count('Incidents');
  const { page, ctx, errors } = await open(`${BACK}/`);
  assert.match(await page.textContent('#dataPill'), /SAP CAP · live/);

  // classifier ran in the service, self-test passed
  await page.evaluate(() => go('classify'));
  await page.waitForFunction(() => document.querySelector('#clsWhere').textContent === 'CAP classify()');
  await page.evaluate(() => go('cockpit'));
  await page.waitForFunction(() => document.querySelectorAll('#stOut .tag.ok').length === 5, null, { timeout: 8000 });
  await page.screenshot({ path: path.join(SHOTS, 'A-selftest.png') });

  await page.evaluate(() => go('overview'));
  await runAndApprove(page, 'storm');
  const log = await page.textContent('#dlog');
  assert.match(log, /SAPPO 4500018231\/10 confirmed delivery/);
  assert.match(log, /SIMVoyage instruction/);
  assert.match(log, /Event hydra\/reroute\/v1\/approved published/);
  await page.screenshot({ path: path.join(SHOTS, 'A-dispatch.png') });

  const after = (await get(`/PurchaseOrders(PurchaseOrder='4500018231',PurchaseOrderItem='10')`)).ConfirmedDelivery;
  assert.notEqual(after, seedETA, 'PO confirmation changed in the backend');
  assert.equal(await count('Incidents'), nInc + 1);
  const code = (await get(`/Incidents?$orderby=createdAt desc&$top=1`)).value[0].code;
  assert.match(await page.textContent('#dlog'), new RegExp(`Incident ${code} saved`));
  const hist = (await get(`/OrderHistory?$filter=source eq '${encodeURIComponent('Dispatch agent · ' + code)}'`)).value;
  assert.equal(hist.length, 4, 'one change document per Kestrel Bay PO');
  assert.equal(await count('EventLog'), 1);

  // order form writes through too
  await page.evaluate(() => go('orders'));
  await page.fill('#oTxt', 'E2E test gearbox');
  await page.click('#oSubmit');
  await page.waitForFunction(() => document.querySelector('#ordTable')?.textContent.includes('E2E test gearbox'));
  assert.equal((await get(`/PurchaseOrders?$filter=MaterialText eq 'E2E test gearbox'`)).value.length, 1);

  // history shows the business event
  await page.evaluate(() => { go('history'); document.querySelector('#histSeg [data-h="ev"]').click(); });
  assert.match(await page.textContent('#evLog'), /hydra\/reroute\/v1\/approved/);
  await page.evaluate(() => go('arch'));
  await page.screenshot({ path: path.join(SHOTS, 'A-architecture.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('B · cross origin (?api=): GitHub Pages style page talks to CAP through CORS', async () => {
  const nInc = await count('Incidents');
  const { page, ctx, errors, calls } = await open(`${STATIC}/?api=${encodeURIComponent(BACK)}`);
  assert.match(await page.textContent('#dataPill'), /SAP CAP · live/);
  assert.ok(calls.some(c => c.startsWith('GET ' + API)), 'reads go to the backend URL');
  await runAndApprove(page, 'flood');
  assert.ok(calls.some(c => c === `POST ${API}/dispatchPlan`), 'write goes to dispatchPlan');
  assert.equal(await count('Incidents'), nInc + 1);
  assert.match(await page.textContent('#dlog'), /SAPPO 4500019102\/10/);
  // the choice is remembered without the query string
  await page.goto(`${STATIC}/`);
  await page.waitForFunction(() => document.querySelector('#dataPill')?.textContent.includes('live'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('C · demo mode: no backend calls, simulated writes are labelled', async () => {
  const nInc = await count('Incidents');
  const { page, ctx, errors, calls } = await open(`${STATIC}/?api=demo`);
  assert.match(await page.textContent('#dataPill'), /Demo data/);
  await runAndApprove(page, 'storm');
  const log = await page.textContent('#dlog');
  assert.match(log, /SIMPO 4500018231\/10/);
  assert.match(log, /demo, not published/);
  assert.doesNotMatch(log, /SAPPO/);
  assert.deepEqual(calls, []);
  assert.equal(await count('Incidents'), nInc, 'backend untouched');
  await page.evaluate(() => go('arch'));
  assert.match(await page.textContent('#sapMap'), /Ready · cf push/);
  await page.screenshot({ path: path.join(SHOTS, 'C-demo-architecture.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('D · unreachable backend falls back to demo and says so', async () => {
  const { page, ctx } = await open(`${STATIC}/?api=${encodeURIComponent('http://127.0.0.1:4999')}`);
  assert.match(await page.textContent('#dataPill'), /Demo data/);
  assert.match(await page.textContent('#toasts'), /Backend not reachable/);
  await page.click('#dataPill');
  assert.equal(await page.isVisible('#conn'), true, 'connection panel opens');
  assert.match(await page.textContent('#connState'), /Could not reach/);
  await page.screenshot({ path: path.join(SHOTS, 'D-unreachable.png') });
  await ctx.close();
});
