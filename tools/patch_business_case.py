"""Adds the 'Business case' section that answers the judging rubric (problem, systems thinking, viability, feasibility)."""
import sys, pathlib
P = pathlib.Path('index.html'); s = P.read_text(encoding='utf-8')
if 'id="s-case"' in s: sys.exit('already patched')
def rep(a, b):
    global s
    if s.count(a) != 1: sys.exit('anchor: ' + a[:80])
    s = s.replace(a, b)

HTML = '''      <section class="sec" id="s-case" data-title="Business case" data-crumb="Why it matters">
        <div class="grid g2">
          <div class="panel"><h3>Problem we solve</h3>
            <p class="lede" style="margin:0 0 10px"><b>Who:</b> Indian manufacturers and importers running SAP S/4HANA who ship on Indian Ocean sea lanes and the Chennai–Bengaluru–Mangaluru road corridors.</p>
            <p class="lede" style="margin:0 0 10px"><b>Pain:</b> when a cyclone, flood, landslide or port queue hits, the reroute is decided over phone calls and spreadsheets. Confirmed delivery dates in the ERP go stale, planners find out late, and Gold-tier customers get missed promises.</p>
            <p class="lede" style="margin:0"><b>Root cause:</b> disruption signals (weather, AIS, news), carrier positions and purchase-order commitments sit in <b>separate systems with no owner</b> for the question <i>"which orders does this storm hit, and what do we do now?"</i> Each approval hop adds hours.</p>
          </div>
          <div class="panel"><h3>Evidence <span class="tag live">Public sources</span></h3>
            <div class="tw"><table><tbody>
              <tr><td class="mono" style="white-space:nowrap"><b>−42%</b></td><td>Suez Canal transits by Jan 2024 vs peak, after Red Sea attacks; container tonnage down 82% by mid-Feb 2024 <div class="note">UNCTAD, Feb 2024</div></td></tr>
              <tr><td class="mono"><b>56 → 63 d</b></td><td>India–Europe round trip when diverted via the Cape of Good Hope; needs one extra vessel per loop <div class="note">UNCTAD, Feb 2024</div></td></tr>
              <tr><td class="mono"><b>+70%</b></td><td>more greenhouse-gas emissions per rerouted round trip <div class="note">UNCTAD, Feb 2024</div></td></tr>
              <tr><td class="mono"><b>7.97%</b></td><td>India's logistics cost as a share of GDP, FY 2023–24 <div class="note">DPIIT–NCAER, 2025</div></td></tr>
            </tbody></table></div>
            <div id="caseVoice"></div>
          </div>
        </div>

        <div class="panel"><h3>Where it sits in the process <span class="r">upstream → downstream</span></h3>
          <div class="flow">
            <div class="node"><div class="nt">Upstream</div><div class="nn">Supplier ships</div><div class="nd">SAP Ariba · ASN</div></div>
            <div class="node sap"><div class="nt">Plan</div><div class="nn">PO + delivery date</div><div class="nd">S/4HANA MM</div></div>
            <div class="node sap"><div class="nt">Move</div><div class="nn">Vessel / truck</div><div class="nd">SAP TM · carriers</div></div>
            <div class="node sap"><div class="nt">This app</div><div class="nn">Sense → reroute → confirm</div><div class="nd">CAP on BTP · AI Core</div></div>
            <div class="node sap"><div class="nt">Downstream</div><div class="nn">Plant / DC schedule</div><div class="nd">MRP · SAP IBP</div></div>
            <div class="node"><div class="nt">Customer</div><div class="nn">Promise kept</div><div class="nd">SLA Gold · Silver · Bronze</div></div>
          </div>
        </div>

        <div class="grid g2">
          <div class="panel"><h3>Second-order effects we plan for</h3><div class="tw"><table><thead><tr><th>If we reroute…</th><th>Risk</th><th>Safeguard</th></tr></thead><tbody>
            <tr><td>Everyone takes the same detour</td><td>Congestion moves to the alternative road or port</td><td>Risk weight in scoring, capacity check before dispatch, staggered orders</td></tr>
            <tr><td>Longer sea route</td><td>Cost and CO₂ go up (see route cards)</td><td>CO₂ shown per option; operator sees cost delta before approving</td></tr>
            <tr><td>New ETA in SAP</td><td>MRP and production plans shift</td><td>Change documents on every PO; next step pushes dates to IBP/MRP</td></tr>
            <tr><td>Longer shift for the driver</td><td>Fatigue and safety</td><td>Crew can refuse with <b>Problem</b>; the operator is alerted at once</td></tr>
            <tr><td>Many noisy alerts</td><td>Alert fatigue, false reroutes</td><td>Deduplication, 0.70 confidence threshold, acknowledge in cockpit</td></tr>
          </tbody></table></div></div>
          <div class="panel"><h3>Change management</h3>
            <div class="stages vert">
              <div class="stage done"><div class="t">Phase 1</div><div class="n">Advise</div><div class="s">Agents propose, planners decide. Builds trust in the scores.</div></div>
              <div class="stage now"><div class="t">Phase 2</div><div class="n">Approve</div><div class="s">One-click approval (this prototype). Every change is logged.</div></div>
              <div class="stage"><div class="t">Phase 3</div><div class="n">Auto, low risk</div><div class="s">Auto-dispatch only for Bronze orders and life-safety cases.</div></div>
            </div>
            <p class="note" style="margin:10px 0 0">Training: 30 min for planners, 10 min for drivers (two buttons). Success measures: detect-to-dispatch time, % of POs kept in SLA, crew acceptance rate.</p>
          </div>
        </div>

        <div class="split">
          <div class="panel"><h3>Value for one customer <span class="tag sim">Your assumptions · edit them</span></h3>
            <div class="form" id="roiForm">
              <div class="f"><label for="rShip">Shipments per month</label><input class="inp" id="rShip" type="number" min="0" value="400"></div>
              <div class="f"><label for="rHit">Share hit by a disruption (%)</label><input class="inp" id="rHit" type="number" min="0" max="100" step="0.5" value="6"></div>
              <div class="f"><label for="rSave">Hours saved per hit (faster detect + reroute)</label><input class="inp" id="rSave" type="number" min="0" value="12"></div>
              <div class="f"><label for="rCost">Cost of delay per shipment-hour (₹)</label><input class="inp" id="rCost" type="number" min="0" value="2500"></div>
              <div class="f"><label for="rMiss">SLA penalties avoided per month (₹)</label><input class="inp" id="rMiss" type="number" min="0" value="150000"></div>
              <div class="f"><label for="rFee">Subscription per month (₹)</label><input class="inp" id="rFee" type="number" min="0" value="120000"></div>
            </div>
          </div>
          <div class="stack">
            <div class="grid g2" id="roiOut"></div>
            <div class="panel"><h3>In this session <span class="tag live">Measured</span></h3><div id="roiLive" class="note"></div></div>
          </div>
        </div>

        <div class="grid g3">
          <div class="panel"><h3>Revenue model</h3><p class="lede" style="margin:0">SaaS on SAP BTP, priced <b>per tracked vessel or truck per month</b>, with a platform fee per plant. Implementation and S/4HANA connection sold as a fixed-price package through SI partners.</p></div>
          <div class="panel"><h3>Go to market</h3><p class="lede" style="margin:0"><b>1.</b> Paid pilots with 2–3 mid-size S/4HANA manufacturers on the Chennai–Bengaluru corridor. <b>2.</b> List as a BTP extension on SAP Store. <b>3.</b> Resell through SAP partners and SIs. <b>4.</b> Extend to 3PLs and freight forwarders.</p></div>
          <div class="panel"><h3>Build plan and resources</h3><p class="lede" style="margin:0"><b>Now:</b> working prototype on CAP. <b>Weeks 1–4:</b> S/4HANA PO API, XSUAA, Event Mesh. <b>Weeks 5–8:</b> live AIS/IMD feeds via Integration Suite, pilot. Team: CAP developer, UI5/Fiori developer, AI engineer, supply-chain analyst. Cost drivers: CF runtime, HANA Cloud, AI Core tokens (size with the SAP Discovery Center estimator).</p></div>
        </div>
      </section>

'''
rep('      <section class="sec" id="s-arch"', HTML + '      <section class="sec" id="s-arch"')
rep("  ['grp','Platform'],['cockpit','Resilience Cockpit',''],['arch','Architecture',''],",
    "  ['grp','Platform'],['cockpit','Resilience Cockpit',''],['arch','Architecture',''],\n  ['grp','Pitch'],['case','Business case','₹'],")

JS = r'''
/* ================= BUSINESS CASE ================= */
const inr = v => money(v, 'INR');
function renderCase(){
  const g = id => Math.max(0, +$('#'+id).value || 0);
  const hits = g('rShip') * g('rHit') / 100, delaySaved = hits * g('rSave') * g('rCost'), gross = delaySaved + g('rMiss'), fee = g('rFee'), net = gross - fee;
  $('#roiOut').innerHTML = kpi(Math.round(hits), 'Disrupted shipments / month', `${g('rHit')}% of ${g('rShip')}`) + kpi(inr(gross), 'Value / month', 'delay cost + penalties avoided', 'gold')
    + kpi(inr(net), 'Net / month after subscription', net >= 0 ? `${(gross / Math.max(fee,1)).toFixed(1)}× return on fee` : 'does not pay back', net >= 0 ? '' : 'dn') + kpi(inr(net * 12), 'Net / year', 'same assumptions');
  const done = DB.incidents.filter(i => i.responseSeconds);
  const avg = done.length ? Math.round(done.reduce((s,i)=>s + +i.responseSeconds, 0) / done.length) : 0;
  const aff = DB.incidents.reduce((s,i)=>s+(+i.posAffected||0),0), prot = DB.incidents.reduce((s,i)=>s+(+i.posProtected||0),0);
  $('#roiLive').innerHTML = `${DB.incidents.length} incidents in ${DB.live ? 'the CAP service' : 'demo data'} · average detect-to-dispatch <b>${mmss(avg)}</b> · <b>${prot}/${aff}</b> affected POs kept within SLA.`;
  const v = (window.CFG && CFG.voices) || [];
  $('#caseVoice').innerHTML = v.length ? `<h3 style="margin-top:14px">What we heard <span class="tag live">Interviews</span></h3>${v.map(q => `<p class="note" style="margin:6px 0">“${esc(q.text)}” — ${esc(q.who)}</p>`).join('')}` : '';
}
document.addEventListener('input', e => { if (e.target.closest('#roiForm')) renderCase(); });
'''
rep("/* ================= BOOT ================= */", JS + "\n/* ================= BOOT ================= */")
rep("if (id==='cockpit') renderAlerts();", "if (id==='cockpit') renderAlerts(); if (id==='case') renderCase();")
rep("const CFG = { app: 'SAP', sub: 'Rerouting', team: 'Team Hydra', api: '/odata/v4/rerouting', workzone: false, poll: 4000 };",
    "const CFG = { app: 'SAP', sub: 'Rerouting', team: 'Team Hydra', api: '/odata/v4/rerouting', workzone: false, poll: 4000,\n  voices: [] /* stakeholder quotes shown under Business case, e.g. { who:'Logistics manager, auto-parts maker, Hosur', text:'…' } */ };")
P.write_text(s, encoding='utf-8'); print('ok')
