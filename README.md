# Hydra Rerouting

Autonomous multi-agent disruption rerouting, built on **SAP BTP**.
Detect → classify → match SAP purchase orders → reroute → approve → dispatch.

| Folder | What it is |
|---|---|
| `index.html` | The web app. GitHub Pages serves it with demo data; the CAP service on BTP serves it with live data. |
| `cap/` | SAP Cloud Application Programming Model (CAP) project, OData v4 service at `/odata/v4/hydra` |

## 1. GitHub Pages (demo mode, 5 minutes)
1. Upload everything in this folder to a new public repository.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
3. Open `https://<username>.github.io/<repo>/`. The top bar shows **SAP CAP · demo data**.

## 2. SAP BTP (live mode)
You need a free SAP BTP trial account, the Cloud Foundry CLI (`cf`) and Node.js 20 or newer.
```bash
cd cap
npm install
npm start                      # local check → http://localhost:4004
cf login -a <API endpoint shown on your BTP trial subaccount overview>
cf push                        # uses manifest.yml
```
Open the route that `cf push` prints. The top bar shows **SAP CAP · live**. New orders, incidents and
PO change logs are written by the CAP service (in-memory SQLite, reset when the app restarts).

Before production: move `db` to SAP HANA Cloud (`cds add hana`), replace `auth: dummy` with XSUAA
(`cds add xsuaa`), and point `PurchaseOrders` at S/4HANA `API_PURCHASEORDER_PROCESS_SRV`.

## CAP service
| Entity | Purpose |
|---|---|
| `Assets` | Vessels and trucks: position and base ETA |
| `PurchaseOrders` | S/4HANA PO item fields plus SLA tier (Gold 0 h, Silver 12 h, Bronze 48 h) |
| `Incidents` | Every disruption, chosen plan, response time and POs kept within SLA |
| `OrderHistory` | Change log written by `srv/hydra-service.js` on every create or update |
| `EventStats` | Daily sensing volumes, raw vs forwarded after dedup |

## Demo script (4 minutes)
1. **Command Center** → *Cyclone · Gulf of Aden*. Watch the five stages run.
2. **Impact · SAP**: the affected POs and the OData calls.
3. **Reroute**: drag Risk to 100 and the recommendation moves to the Cape.
4. **Approve & Dispatch** → *Approve*. The timeline stays under 3 minutes.
5. **Orders & SLA**: add an order and see its predicted SLA.
6. **Investigate**: describe a new disruption, click the map, *Investigate impact*, then *Launch response*.
7. **History**: the incident and every PO change are logged.

To change the names, search for `const CFG` in `index.html` (and `cap/app/index.html`).
No external AI API is called. The classifier runs as rules in the page; the production target is SAP AI Core.
