# SAP Rerouting

Multi-agent disruption rerouting on **SAP BTP**: detect → classify → match purchase orders → reroute → approve → dispatch.
The UI is one page with two menus: **Command Center** (operators) and **Captain / Driver on Deck** (crew). The backend is an **SAP CAP** service (OData v4) that holds the orders, runs the classifier, and writes every approved plan back in one transaction, including the reroute orders sent to the crew.

![CI](https://github.com/Tawheedali1407/hydra-rerouting/actions/workflows/ci.yml/badge.svg)

## What is real and what is simulated

| Capability | In this prototype | Status | Production path |
|---|---|---|---|
| Hosting | CAP app on BTP Cloud Foundry (serves UI + API) | Built, deploy with one workflow | Same |
| Data and APIs | CAP OData v4 service, 7 entities | **Live** when connected | Same |
| PO write-back | CAP action `dispatchPlan`: PO confirmations, change log, incident, crew orders and event in **one transaction** | **Live, tested** (rollback tested too) | Delegate to S/4HANA |
| Crew app | Captain / Driver deck: orders from `Dispatches`, answers through `reply()`, issue reports as incidents | **Live, tested** | Same service; native mobile app later |
| Cockpit alerts | Alert bar, bell counter, alert list; raised by incidents, crew problems and crew reports | **Live** (polls CAP every 4 s) | SAP Alert Notification service / Event Mesh push |
| Classifier | CAP function `classify()`: LLM on **SAP AI Core** (Generative AI Hub orchestration, `srv/ai-core.js`) when AI Core is bound; rule engine (`rerouting-rules.js`) otherwise | **Live**. The output badge and `info().aiCore` say which engine answered | Same |
| Business events | CAP messaging, local in-process broker, subscriber writes `EventLog` | **Live, local broker** | SAP Event Mesh: change `messaging.kind`, bind the service |
| Database | SAP HANA Cloud HDI container when deployed with `mta.yaml` (`CDS_ENV=hana`); SQLite in memory for `cf push` / local | Live (`info().db` says which) | Same |
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

### SAP BTP with HANA Cloud (the finale setup, from SAP Business Application Studio)
1. Business Application Studio → create a **Full Stack Cloud Application** dev space → open a terminal.
2. `git clone https://github.com/Tawheedali1407/hydra-rerouting && cd hydra-rerouting && git checkout sap-rerouting-finale && cd cap`
3. `cf login` (API endpoint from the BTP subaccount overview), pick the org and space.
4. `npm ci && mbt build && cf deploy mta_archives/sap-rerouting_2.0.0.mtar`
   This creates the HDI container on your HANA Cloud instance, deploys tables and seed data, and starts the app with `CDS_ENV=hana`.
5. **AI Core (optional):** if the space has an SAP AI Core instance, name it `sap-rerouting-aicore` (or edit `mta-aicore.mtaext`), make sure an
   orchestration deployment exists in resource group `default` (AI Launchpad → ML Operations → Deployments), then
   `cf deploy mta_archives/sap-rerouting_2.0.0.mtar -e mta-aicore.mtaext`.
6. Open the app route. Cockpit → **Run self-test**, and `…/odata/v4/rerouting/info()` shows `db: hana…` and `aiCore: bound…`.

### Team-only access (do this before sharing the link)
Every page and API call asks for a team login once `TEAM_USERS` is set; only `/health` stays open for Cloud Foundry.
Each teammate opens the BTP app URL on their own laptop or phone and signs in with their own name and password.
```bash
# one entry per teammate: name:password  (or name:sha256:<hash> from `npm run hash-password -- <name> <password>`)
cf set-env sap-rerouting-srv TEAM_USERS 'ali:<password>,teammate2:<password>,teammate3:<password>,teammate4:<password>'
cf restage sap-rerouting-srv
```
The app name is `sap-rerouting-srv` for the MTA deploy, `sap-rerouting` for `cf push`. Approvals are logged with the teammate's name.
Production path: XSUAA with SAP ID logins and role collections.

### SAP BTP without HANA (fallback)
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
then the same origin. `?api=demo` forces demo data. The service allows cross-origin calls from origins in `CORS_ORIGINS`
(set in `cap/manifest.yml`; GitHub Pages and localhost are allowed by default).

Example: `https://<user>.github.io/hydra-rerouting/?api=https://sap-rerouting-xxxx.cfapps.us10-001.hana.ondemand.com`

Note that GitHub Pages only works for a private repository on a paid GitHub plan; the BTP app serves the UI itself, so you do not need Pages.

## Tests
```bash
cd cap
npm test           # 10 API tests against the real server in the production profile
npm run test:e2e   # 4 browser tests: same origin, cross origin (CORS), demo mode, unreachable backend
```
CI runs both on every push.

## CAP service (`/odata/v4/rerouting`)
| Entity / operation | Purpose |
|---|---|
| `Assets` | Vessels and trucks: position and base ETA |
| `PurchaseOrders` | S/4HANA PO item fields plus SLA tier (Gold 0 h, Silver 12 h, Bronze 48 h). Create and PATCH write change documents |
| `Incidents` | Every disruption, chosen plan, response time and POs kept within SLA |
| `OrderHistory` | Change log written by the service on every PO create or update |
| `EventLog` | Business events received by the subscriber (`rerouting/reroute/v1/approved`) |
| `EventStats` | Sample daily sensing volumes |
| `classify(text)` | Agent 2: type, severity, location, confidence, next action |
| `dispatchPlan(incident, updates, source)` | Agent 5: all writes for an approved plan, atomically |
| `info()`, `resetDemo()` | Runtime facts for the self-test; restore seed data before a demo |

## Demo script (4 minutes)
Open two windows side by side: the Command Center, and the same URL with `?mode=deck` (or on a phone) as *Driver Murugan K*.

1. **Resilience Cockpit → Run self-test**: five real calls to the CAP service, each timed. Shows the backend is live.
2. **Command Center** → *Cyclone · Gulf of Aden*. Watch the five stages run.
3. **AI Classification**: the output comes from the CAP `classify()` function (the tag says so).
4. **Reroute**: drag Risk to 100 and the recommendation moves to the Cape.
5. **Approve & Dispatch → Approve**. The dispatch log marks what was written to SAP CAP and what is simulated.
   The driver's phone shows the reroute order within 4 seconds. Tap **Problem**: the Command Center gets a red alert.
   On the deck, **Report an issue** sends a classified crew report. It appears as a cockpit alert that opens *Investigate* at the crew's position.
6. **History**: the incident, every PO change document, and the published business event.
7. **Architecture**: the "What is real" table. Say it out loud before anyone asks.

Before presenting: click the data pill → **Reset demo data on server**.

## Likely judge questions
- **"Is this hitting SAP AI Core?"** Look at the badge on the classifier output. `SAP AI Core · <model>` means the LLM answered through the Generative AI Hub orchestration service. `CAP classify() · rules` means AI Core is not bound or failed, and the service fell back to rules (the note says why). `info().aiCore` shows the same thing.
- **"Is this S/4HANA data?"** It is sample data in a CAP entity shaped like `A_PurchaseOrderItem`. Connecting S/4HANA means importing `API_PURCHASEORDER_PROCESS_SRV` as a CAP remote service; the handlers stay the same.
- **"Is Event Mesh wired?"** CAP messaging is live with a local broker, and the events are real (see History → Business events). Event Mesh is a config change plus a service binding.
- **"What happens if the write fails halfway?"** Nothing is written. `dispatchPlan` runs in one transaction; a test proves that one unknown PO rolls back the whole plan, and the UI lets the operator retry.

To rename the app, edit `const CFG` at the top of the script in `index.html`, then run `npm run sync-ui` in `cap/`.
No external AI API is called anywhere.
