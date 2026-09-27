const cds = require('@sap/cds');
const rules = require('../app/rerouting-rules.js');
const aiCore = require('./ai-core');

const LOG = cds.log('rerouting');
const TOPIC = 'rerouting/reroute/v1/approved';
const TRACKED = ['ConfirmedDelivery', 'DeliveryDate', 'Asset_ID', 'SLATier', 'Quantity'];
const fmt = v => v ? new Date(v).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 16) : ''; // IST, same as UI
const isDateField = f => /Date|Delivery/.test(f);
const STARTED = new Date().toISOString();
let anchoredAt = STARTED, snapshot = null;

/** Write one OrderHistory row per tracked field that actually changed (like MM change documents). */
async function logChanges(key, before, after, source) {
  const { OrderHistory } = cds.entities('rerouting');
  const rows = [];
  for (const f of TRACKED) if (f in after && String(after[f] ?? '') !== String(before[f] ?? '')) {
    const same = isDateField(f) && before[f] && after[f] && Date.parse(before[f]) === Date.parse(after[f]);
    if (same) continue;
    rows.push({
      at: new Date().toISOString(), PurchaseOrder: key.PurchaseOrder, PurchaseOrderItem: key.PurchaseOrderItem, field: f,
      oldValue: String((isDateField(f) ? fmt(before[f]) : before[f]) ?? ''), newValue: String((isDateField(f) ? fmt(after[f]) : after[f]) ?? ''), source
    });
  }
  if (rows.length) await INSERT.into(OrderHistory).entries(rows);
  return rows.length;
}

async function nextIncidentCode() {
  const { Incidents } = cds.entities('rerouting');
  const year = new Date().getFullYear();
  const codes = await SELECT.from(Incidents).columns('code').where({ code: { like: `INC-${year}-%` } });
  const n = Math.max(412, ...codes.map(c => Number(String(c.code).slice(9)) || 0)) + 1;
  return `INC-${year}-${String(n).padStart(4, '0')}`;
}

/** Demo seeds: make due dates and ETAs relative to "now" so the demo never goes stale. */
async function anchor() {
  const { PurchaseOrders, Assets } = cds.entities('rerouting');
  const now = Date.now(), h = 36e5;
  const assets = Object.fromEntries((await SELECT.from(Assets)).map(a => [a.ID, a]));
  for (const po of await SELECT.from(PurchaseOrders).where('DueOffsetHours is not null')) {
    const eta = assets[po.Asset_ID] ? now + Number(assets[po.Asset_ID].baseEtaHours) * h : null;
    await UPDATE(PurchaseOrders).set({
      DeliveryDate: new Date(now + Number(po.DueOffsetHours) * h).toISOString(),
      ConfirmedDelivery: eta && new Date(eta).toISOString()
    }).where({ PurchaseOrder: po.PurchaseOrder, PurchaseOrderItem: po.PurchaseOrderItem });
  }
  anchoredAt = new Date(now).toISOString();
}

function info() {
  const db = cds.env.requires.db || {}, msg = cds.env.requires.messaging || {};
  return {
    version: require('../package.json').version, startedAt: STARTED, anchoredAt,
    db: db.kind === 'hana' ? 'hana (SAP HANA Cloud, HDI container)' : `${db.kind}${db.credentials?.url === ':memory:' ? ' (in-memory)' : ''}`,
    messaging: msg.kind || 'none', auth: process.env.TEAM_USERS ? 'team login (HTTP Basic over HTTPS)' : (cds.env.requires.auth?.kind || String(cds.env.requires.auth)), classifier: rules.VERSION,
    aiCore: aiCore.status(),
    runtime: process.env.VCAP_APPLICATION ? `SAP BTP Cloud Foundry · ${JSON.parse(process.env.VCAP_APPLICATION).application_name}` : 'local'
  };
}

module.exports = class ReroutingService extends cds.ApplicationService {
  async init() {
    const { PurchaseOrders } = this.entities;
    const db = cds.entities('rerouting');
    const sourceOf = req => { const h = req.headers || {}; try { return decodeURIComponent(h['x-rerouting-source'] || h['x-hydra-source'] || 'Orders & SLA'); } catch { return 'Orders & SLA'; } };

    // Number range: next free PO number, like an MM number-range object
    this.before('CREATE', PurchaseOrders, async req => {
      const d = req.data;
      if (!d.PurchaseOrder) {
        const r = await SELECT.one.from(PurchaseOrders).columns('max(PurchaseOrder) as m');
        d.PurchaseOrder = String(Math.max(Number(r?.m || 0), 4500019300) + 1);
      }
      d.PurchaseOrderItem ||= '10';
      if (!(Number(d.Quantity) > 0)) req.error(400, 'Quantity must be greater than 0', 'Quantity');
      if (!d.DeliveryDate) req.error(400, 'Delivery date is required', 'DeliveryDate');
      if (!['Gold', 'Silver', 'Bronze'].includes(d.SLATier)) req.error(400, 'SLA tier must be Gold, Silver or Bronze', 'SLATier');
    });
    this.after('CREATE', PurchaseOrders, async (_, req) => {
      const po = req.data;
      await INSERT.into(db.OrderHistory).entries({
        at: new Date().toISOString(), PurchaseOrder: po.PurchaseOrder, PurchaseOrderItem: po.PurchaseOrderItem, field: 'Created',
        oldValue: '', newValue: `${po.Quantity} ${po.Unit || ''} ${po.MaterialText || ''}`.trim(), source: sourceOf(req)
      });
    });

    // Change documents on every direct PATCH
    this.before('UPDATE', PurchaseOrders, async req => {
      const key = { PurchaseOrder: req.data.PurchaseOrder ?? req.params[0]?.PurchaseOrder, PurchaseOrderItem: req.data.PurchaseOrderItem ?? req.params[0]?.PurchaseOrderItem };
      const old = await SELECT.one.from(db.PurchaseOrders).where(key);
      if (!old) return req.error(404, 'Purchase order not found');
      await logChanges(key, old, req.data, sourceOf(req));
    });

    // Agent 2 · classifier
    this.on('classify', async req => {
      const text = String(req.data.text || '');
      if (!text.trim()) return req.error(400, 'text is required');
      if (text.length > 2000) return req.error(400, 'text is limited to 2000 characters');
      const ai = await aiCore.classify(text);
      if (ai) {
        // keep the gazetteer's exact coordinates when the rules know the place (LLMs are vague on lat/lon)
        const r0 = rules.classify(text);
        if (r0.coordinates && (ai.lat == null || ai.lon == null)) { ai.lat = r0.coordinates[0]; ai.lon = r0.coordinates[1]; }
        return ai;
      }
      const r = rules.classify(text);
      return { ...r, lat: r.coordinates?.[0] ?? null, lon: r.coordinates?.[1] ?? null, coordinates: undefined,
        note: aiCore.bound() ? `AI Core unavailable (${aiCore.lastError() || 'error'}), rules used` : 'AI Core not bound, rules used' };
    });

    // Deck app · captain or driver answers a reroute order
    this.on('reply', async req => {
      const { ID, status, note } = req.data;
      if (!['Accepted', 'Problem'].includes(status)) return req.error(400, 'status must be Accepted or Problem');
      const n = await UPDATE(db.Dispatches, ID).set({ status, reply: String(note || '').slice(0, 300), repliedAt: new Date().toISOString() });
      if (!n) return req.error(404, 'Dispatch order not found');
      return SELECT.one.from(db.Dispatches, ID);
    });

    // Agent 5 · dispatch: all writes succeed or none do (CAP wraps the handler in one transaction)
    this.on('dispatchPlan', async req => {
      const { incident = {}, updates = [], source, orders = [] } = req.data;
      const who = req.headers?.['x-team-user']; const src = (String(source || 'Dispatch agent') + (who ? ` · by ${who}` : '')).slice(0, 80);
      if (!incident.title) return req.error(400, 'incident.title is required');
      let changes = 0;
      for (const u of updates) {
        const key = { PurchaseOrder: u.PurchaseOrder, PurchaseOrderItem: u.PurchaseOrderItem };
        const eta = Date.parse(u.ConfirmedDelivery);
        if (Number.isNaN(eta)) return req.error(400, `Invalid ConfirmedDelivery for PO ${key.PurchaseOrder}/${key.PurchaseOrderItem}`);
        const old = await SELECT.one.from(db.PurchaseOrders).where(key);
        if (!old) return req.error(404, `Purchase order ${key.PurchaseOrder}/${key.PurchaseOrderItem} not found`);
        const next = { ConfirmedDelivery: new Date(eta).toISOString() };
        changes += await logChanges(key, old, next, src);
        await UPDATE(db.PurchaseOrders).set(next).where(key);
      }
      const { ID: _id, createdAt: _ca, createdBy: _cb, modifiedAt: _ma, modifiedBy: _mb, ...inc } = incident;
      const ID = cds.utils.uuid(), code = inc.code || await nextIncidentCode();
      await INSERT.into(db.Incidents).entries({ ...inc, ID, code, detectedAt: inc.detectedAt || new Date().toISOString() });

      // crew orders for the deck app, in the same transaction
      for (const o of orders || []) {
        if (!o.asset_ID) return req.error(400, 'orders[].asset_ID is required');
        if (!await SELECT.one.from(db.Assets).where({ ID: o.asset_ID })) return req.error(404, `Unknown asset ${o.asset_ID}`);
        await INSERT.into(db.Dispatches).entries({ ID: cds.utils.uuid(), incidentCode: code, asset_ID: o.asset_ID, routeName: o.routeName, instruction: o.instruction, newEta: o.newEta, status: 'Sent' });
      }
      const eventId = cds.utils.uuid();
      const payload = { eventId, incident: ID, code, title: inc.title, route: inc.chosenRoute, assets: inc.assets, pos: updates.map(u => `${u.PurchaseOrder}/${u.PurchaseOrderItem}`), at: new Date().toISOString() };
      const messaging = await cds.connect.to('messaging');
      await messaging.emit(TOPIC, payload); // delivered after commit
      LOG.info(`dispatch ${code}: ${updates.length} PO(s), ${changes} change(s), event ${eventId}`);
      return { incident: ID, code, posUpdated: updates.length, changes, eventId, topic: TOPIC, ordersSent: (orders || []).length };
    });

    this.on('info', () => info());
    this.on('resetDemo', async () => {
      if (!snapshot) return info();
      for (const e of ['Dispatches', 'EventLog', 'OrderHistory', 'Incidents', 'PurchaseOrders']) await DELETE.from(db[e]);
      for (const [e, rows] of Object.entries(snapshot)) if (rows.length) await INSERT.into(db[e]).entries(rows);
      await anchor();
      return info();
    });

    return super.init();
  }
};

cds.on('served', async () => {
  const db = cds.entities('rerouting');
  await anchor();
  snapshot = {
    PurchaseOrders: await SELECT.from(db.PurchaseOrders),
    Incidents: await SELECT.from(db.Incidents),
    OrderHistory: await SELECT.from(db.OrderHistory)
  };
  // Subscriber: proves the event went through the broker, and gives the UI an outbox it can show
  const messaging = await cds.connect.to('messaging');
  messaging.on(TOPIC, async msg => {
    const p = msg.data || {};
    await INSERT.into(db.EventLog).entries({ ID: p.eventId || cds.utils.uuid(), at: new Date().toISOString(), topic: msg.event, payload: JSON.stringify(p) });
  });
});
