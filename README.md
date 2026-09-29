# Hydra Rerouting

Multi-agent disruption rerouting on **SAP BTP**: detect → classify → match purchase orders → reroute → approve → dispatch.
The UI is one page. The backend is an **SAP CAP** service (OData v4) that holds the orders, runs the classifier and writes every approved plan back in one transaction.

![CI](https://github.com/Tawheedali1407/hydra-rerouting/actions/workflows/ci.yml/badge.svg)

## What is real and what is simulated

| Capability | In this prototype | Status | Production path |
|---|---|---|---|
| Hosting | CAP app on BTP Cloud Foundry (serves UI + API) | Built, deploy with one workflow | Same |
| Data and APIs | CAP OData v4 service, 6 entities | **Live** when connected | Same |
| PO write-back | CAP action `dispatchPlan`: PO confirmations, change log, incident and event in **one transaction** | **Live, tested** (rollback tested too) | Delegate to S/4HANA |
| Classifier | Rule engine (`hydra-rules.js`) served as CAP function `classify()` | **Live, rules** | LLM on SAP AI Core, same output contract |
| Business events | CAP messaging, local in-process broker, subscriber writes `EventLog` | **Live, local broker** | SAP Event Mesh: change `messaging.kind`, bind the service |
| Database | SQLite in memory, reset on restart | Live | SAP HANA Cloud (`cds add hana`) |
| Purchase orders | CAP entity with S/4HANA `A_PurchaseOrderItem` fields, sample data | Sample data | `API_PURCHASEORDER_PROCESS_SRV` as a CAP remote service |
| Freight lanes, geofences | Route catalogue and point-in-zone checks in the page | Sample data / in page | SAP TM, HANA Cloud spatial |
| Sensing feeds, cockpit telemetry | Replayed sample events, illustrative charts | **Simulated** (labelled in the UI) | Integration Suite + AIS/IMD/USGS feeds |
| Approval | Approve button, recorded on the incident | In app | SAP Build Process Automation |
| Auth | None (`dummy`) | Demo only | XSUAA (`cds add xsuaa`) |

The app shows the same table under **Architecture**, updated to whether a backend is connected. Every simulated panel carries a *Simulated* tag,
and the dispatch log marks each line **SAP** (written to the backend) or **SIM** (simulated).

## Run it

### Local (2 minutes)
```bash
cd cap
npm install
npm start          # http://localhost:4004 → UI + API, top bar shows "SAP CAP · live"
```

### SAP BTP (hosted)
Option A, GitHub Actions: add the secrets `CF_API`, `CF_USERNAME`, `CF_PASSWORD`, `CF_ORG`, `CF_SPACE`
(Settings → Secrets and variables → Actions), then **Actions → Deploy to SAP BTP → Run workflow**. The run summary prints the app URL.

Option B, by hand:
```bash
cd cap
cf login -a <API endpoint from your BTP subaccount overview>
cf push
```
Open the route `cf push` prints. The top bar shows **SAP CAP · live on BTP**.

> BTP trial apps are stopped every night. Start the app in the BTP cockpit (or re-run the workflow) before you present.

### Pointing another copy of the UI at the backend
The UI finds its backend in this order: `?api=<url>` in the address bar (remembered), a URL saved from the **data pill** in the top bar,
then the same origin. `?api=demo` forces demo data. The service allows cross-origin calls from origins in `HYDRA_CORS_ORIGINS`
(set in `cap/manifest.yml`; GitHub Pages and localhost are allowed by default).

Example: `https://<user>.github.io/hydra-rerouting/?api=https://hydra-rerouting-xxxx.cfapps.us10-001.hana.ondemand.com`

Note that GitHub Pages only works for a private repository on a paid GitHub plan; the BTP app serves the UI itself, so you do not need Pages.

## Tests
```bash
cd cap
npm test           # 10 API tests against the real server in the production profile
npm run test:e2e   # 4 browser tests: same origin, cross origin (CORS), demo mode, unreachable backend
```
CI runs both on every push.

## CAP service (`/odata/v4/hydra`)
| Entity / operation | Purpose |
|---|---|
| `Assets` | Vessels and trucks: position and base ETA |
| `PurchaseOrders` | S/4HANA PO item fields plus SLA tier (Gold 0 h, Silver 12 h, Bronze 48 h). Create and PATCH write change documents |
| `Incidents` | Every disruption, chosen plan, response time and POs kept within SLA |
| `OrderHistory` | Change log written by the service on every PO create or update |
| `EventLog` | Business events received by the subscriber (`hydra/reroute/v1/approved`) |
| `EventStats` | Sample daily sensing volumes |
| `classify(text)` | Agent 2: type, severity, location, confidence, next action |
| `dispatchPlan(incident, updates, source)` | Agent 5: all writes for an approved plan, atomically |
| `info()`, `resetDemo()` | Runtime facts for the self-test; restore seed data before a demo |

## Finale mode (SAP Hackfest North Finale, 30 Sep 2026)
Two tabs under **Command Center** support the 10 + 5 minute slot:
- **SAP Modules**: every SAP building block with an honest status (Live, Built, Sample, Planned), the Theme 1 agent team mapped to Hydra, and a note on the Learning Hub.
- **Finale Showcase**: a 10 minute clock, a run of show that opens the right tab per segment, the guideline checklist, and the evaluation criteria mapped to the app.
The Learning Hub practice systems are not required: the demo runs entirely on the CAP service in this repo.

## Demo script (4 minutes)
1. **Resilience Cockpit → Run self-test**: five real calls to the CAP service, each timed. Shows the backend is live.
2. **Command Center** → *Cyclone · Gulf of Aden*. Watch the five stages run.
3. **AI Classification**: the output comes from the CAP `classify()` function (the tag says so).
4. **Reroute**: drag Risk to 100 and the recommendation moves to the Cape.
5. **Approve & Dispatch → Approve**. The dispatch log marks what was written to SAP CAP and what is simulated.
6. **History**: the incident, every PO change document, and the published business event.
7. **Architecture**: the "What is real" table. Say it out loud before anyone asks.

Before presenting: click the data pill → **Reset demo data on server**.

## Likely judge questions
- **"Is this hitting SAP AI Core?"** No. The classifier is a rule engine that runs as a CAP function. It returns the same JSON an AI Core model would, so replacing it is one handler.
- **"Is this S/4HANA data?"** It is sample data in a CAP entity shaped like `A_PurchaseOrderItem`. Connecting S/4HANA means importing `API_PURCHASEORDER_PROCESS_SRV` as a CAP remote service; the handlers stay the same.
- **"Is Event Mesh wired?"** CAP messaging is live with a local broker, and the events are real (see History → Business events). Event Mesh is a config change plus a service binding.
- **"What happens if the write fails halfway?"** Nothing is written. `dispatchPlan` runs in one transaction; a test proves that one unknown PO rolls back the whole plan, and the UI lets the operator retry.

To rename the app, edit `const CFG` at the top of the script in `index.html`, then run `npm run sync-ui` in `cap/`.
No external AI API is called anywhere.
