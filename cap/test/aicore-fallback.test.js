// AI Core path: a bound but failing AI Core must never break classification — the service falls back to rules
// and says so. Uses a fake AI Core whose token endpoint returns 500.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const PORT = 4198, FAKE = 4197, API = `http://127.0.0.1:${PORT}/odata/v4/rerouting`;
let srv, fake, hits = 0;
before(async () => {
  fake = http.createServer((req, res) => { hits++; res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"fake AI Core down"}'); }).listen(FAKE);
  const key = JSON.stringify({ clientid: 'x', clientsecret: 'y', url: `http://127.0.0.1:${FAKE}`, serviceurls: { AI_API_URL: `http://127.0.0.1:${FAKE}` } });
  srv = spawn(process.execPath, [require.resolve('@sap/cds/bin/serve.js')], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NODE_ENV: 'production', AICORE_SERVICE_KEY: key }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch {} await new Promise(r => setTimeout(r, 150)); }
  throw new Error('server did not start');
});
after(() => { srv?.kill(); fake?.close(); });
test('bound-but-failing AI Core falls back to rules and reports it', async () => {
  const r = await fetch(`${API}/classify(text='${encodeURIComponent('Flooding over NH48 near Ambur, traffic halted')}')`).then(r => r.json());
  assert.equal(r.event_type, 'Flood'); assert.match(r.engine, /^rules/); assert.match(r.note, /AI Core unavailable/);
  assert.ok(hits > 0, 'the service really tried AI Core');
  const inf = await fetch(`${API}/info()`).then(r => r.json());
  assert.match(inf.aiCore, /^bound · last call failed/);
});
