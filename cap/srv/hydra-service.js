const cds = require('@sap/cds');

const fmt = v => v ? new Date(v).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).slice(0, 16) : ''; // IST, same as UI
const TRACKED = ['ConfirmedDelivery', 'DeliveryDate', 'Asset_ID', 'SLATier', 'Quantity'];

module.exports = class HydraService extends cds.ApplicationService {
  init() {
    const { PurchaseOrders } = this.entities;
    const { OrderHistory } = cds.entities('hydra');
    const log = (req, po, item, field, oldValue, newValue) => INSERT.into(OrderHistory).entries({
      at: new Date().toISOString(), PurchaseOrder: po, PurchaseOrderItem: item, field,
      oldValue: String(oldValue ?? ''), newValue: String(newValue ?? ''),
      source: decodeURIComponent(req.headers?.['x-hydra-source'] || 'Orders %26 SLA')
    });

    // Number range: next free PO number, like MM number-range object
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
    this.after('CREATE', PurchaseOrders, (_, req) => {
      const po = req.data;
      return log(req, po.PurchaseOrder, po.PurchaseOrderItem, 'Created', '', `${po.Quantity} ${po.Unit || ''} ${po.MaterialText || ''}`.trim());
    });

    // Change documents: record every tracked field that changes
    this.before('UPDATE', PurchaseOrders, async req => {
      const key = { PurchaseOrder: req.data.PurchaseOrder ?? req.params[0]?.PurchaseOrder, PurchaseOrderItem: req.data.PurchaseOrderItem ?? req.params[0]?.PurchaseOrderItem };
      const old = await SELECT.one.from(PurchaseOrders).where(key);
      if (!old) return req.error(404, 'Purchase order not found');
      for (const f of TRACKED) if (f in req.data && String(req.data[f]) !== String(old[f])) {
        const isDate = /Date|Delivery/.test(f);
        await log(req, key.PurchaseOrder, key.PurchaseOrderItem, f, isDate ? fmt(old[f]) : old[f], isDate ? fmt(req.data[f]) : req.data[f]);
      }
    });
    return super.init();
  }
};

// Demo seeds: make due dates and ETAs relative to server start so the demo never goes stale
cds.on('served', async () => {
  const { PurchaseOrders, Assets } = cds.entities('hydra');
  const now = Date.now(), h = 36e5;
  const assets = Object.fromEntries((await SELECT.from(Assets)).map(a => [a.ID, a]));
  for (const po of await SELECT.from(PurchaseOrders).where('DueOffsetHours is not null')) {
    const eta = assets[po.Asset_ID] ? now + Number(assets[po.Asset_ID].baseEtaHours) * h : null;
    await UPDATE(PurchaseOrders).set({
      DeliveryDate: new Date(now + Number(po.DueOffsetHours) * h).toISOString(),
      ConfirmedDelivery: eta && new Date(eta).toISOString()
    }).where({ PurchaseOrder: po.PurchaseOrder, PurchaseOrderItem: po.PurchaseOrderItem });
  }
});
