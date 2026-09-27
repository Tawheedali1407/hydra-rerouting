"""One-off patch for the finale UI: crew deck menu, cockpit alerts, AI Core engine display, crew orders.
Run from repo root: python3 tools/patch_ui_finale.py  (refuses to run twice)."""
import sys, pathlib
P = pathlib.Path('index.html')
s = P.read_text(encoding='utf-8')
if 'DECK_SECS' in s: sys.exit('already patched')

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count: sys.exit(f'expected {count}, found {n}: {old[:100]!r}')
    s = s.replace(old, new)

# ---------- classifier wording: AI Core when bound, rules as fallback ----------
rep('Today this is a <b>rule engine</b> (keywords and a gazetteer) that runs as the CAP <b>classify</b> function; the planned upgrade is an LLM on <b>SAP AI Core · Generative AI Hub</b> behind the same output contract.',
    'The CAP <b>classify</b> function calls an LLM on <b>SAP AI Core · Generative AI Hub</b> when the AI Core service is bound, and falls back to a <b>rule engine</b> (keywords and a gazetteer) otherwise. The badge on the output says which one answered.')
rep("""  $('#clsWhere').textContent = w === 'CAP service' ? 'CAP classify()' : 'rules in page'; $('#clsWhere').className = 'tag ' + (w === 'CAP service' ? 'live' : '');
  $('#clsNote').textContent = w === 'CAP service' ? `Rule engine ${r.engine} running in the CAP service. No external AI service is called.` : 'Rule engine running in the page (no backend connected). No external AI service is called.';""",
"""  const ai = /AI Core/.test(r.engine||''); S.lastEngine = w === 'CAP service' ? (r.engine||'rules') : 'rules in page';
  $('#clsWhere').textContent = ai ? r.engine : w === 'CAP service' ? 'CAP classify() · rules' : 'rules in page'; $('#clsWhere').className = 'tag ' + (w === 'CAP service' ? 'live' : '');
  $('#clsNote').textContent = ai ? `Answered by ${r.engine} through the CAP service.` : w === 'CAP service' ? `Rule engine ${r.engine} in the CAP service. ${r.note||''}` : 'Rule engine running in the page (no backend connected). No external AI service is called.';""")
rep("return { r:{ event_type:r.event_type, severity:r.severity, location:r.location, coordinates: r.lat!=null ? [+r.lat, +r.lon] : null, confidence:+r.confidence, action:r.action, engine:r.engine }",
    "return { r:{ event_type:r.event_type, severity:r.severity, location:r.location, coordinates: r.lat!=null ? [+r.lat, +r.lon] : null, confidence:+r.confidence, action:r.action, engine:r.engine, ...(r.note ? { note:r.note } : {}) }")

# ---------- data: dispatches + captains ----------
rep("const DB = { assets:[], pos:[], incidents:[], history:[], events:[], evlog:[], live:false, info:null, latency:null, connErr:null };",
    "const DB = { assets:[], pos:[], incidents:[], history:[], events:[], evlog:[], dispatches:[], live:false, info:null, latency:null, connErr:null };")
rep("const nAsset = a => ({ ...a,", "const CAPT = { KB:'Capt. R. Menon', OC:'Capt. S. Fernando', AS:'Capt. A. Das', SV:'Capt. K. Patel', TR1:'Driver Murugan K', TR2:'Driver Selvam P', TR3:'Driver Naveen S', TR4:'Driver Ravi M' };\nconst nAsset = a => ({ ...a, captain: a.captain || CAPT[a.ID] || '',")
rep("    DB.pos = p.value.map(nPO); DB.incidents = i.value; DB.history = h.value; DB.events = e.value; DB.evlog = ev.value; DB.live = true;\n    return;",
    "    DB.pos = p.value.map(nPO); DB.incidents = i.value; DB.history = h.value; DB.events = e.value; DB.evlog = ev.value; DB.live = true;\n    try { DB.dispatches = (await api('/Dispatches?$orderby=createdAt desc&$top=100')).value; } catch(e){ DB.dispatches = []; }\n    return;")

# ---------- dispatch: crew orders travel with the plan (same CAP transaction) ----------
rep("""  let res = null;
  if (DB.live) { // one CAP action""", """  const orders = (!sc.sar && an.chosen) ? an.affected.map(id => { const a = assetById(id); return { asset_ID:id, routeName:an.chosen.short, newEta:new Date(planEta(an, a)).toISOString(),
    instruction: a.type==='VESSEL' ? `${sc.name}. Change voyage plan: ${an.chosen.name}.` : `${sc.name}. Leave the planned road and take ${an.chosen.name}.` }; }) : [];
  let res = null;
  if (DB.live) { // one CAP action""")
rep("res = await api('/dispatchPlan', { method:'POST', body:JSON.stringify({ incident:incBody, source:src, updates:",
    "res = await api('/dispatchPlan', { method:'POST', body:JSON.stringify({ incident:incBody, source:src, orders, updates:")
rep("""...an.affected.map(id => [`${assetById(id).type==='VESSEL'?'Voyage instruction':'Driver app push'} → ${assetById(id).name}: ${an.chosen.short}`, '', 'sim']));""",
    """...an.affected.map(id => [`${assetById(id).type==='VESSEL'?'Voyage instruction':'Driver order'} → ${assetById(id).captain||''} (${assetById(id).name}): ${an.chosen.short}`, '', K]));
  if (!DB.live) orders.forEach(o => localOrder({ ...o, incidentCode:inc.code }));
  else { try { DB.dispatches = (await api('/Dispatches?$orderby=createdAt desc&$top=100')).value; DB.dispatches.forEach(d => S.seenDisp[d.ID] ??= d.status); } catch(e){} }""")

# ---------- header: alert bar + bell ----------
rep('<header class="top">', '<div class="alertbar" id="alertBar" hidden role="alert"></div>\n    <header class="top">')
rep('<span class="pill" id="statusPill">', '<button class="pill bell" id="bellBtn" title="Alerts"><span aria-hidden="true">🔔</span><span id="bellN">0</span></button>\n      <span class="pill" id="statusPill">')
rep('<nav class="nav" id="nav" aria-label="Sections"></nav>',
    '<div class="modesw" role="tablist" aria-label="Menu"><button data-mode="cc" class="on" role="tab">🖥️ Command Center</button><button data-mode="deck" role="tab">🚢 Captain / Driver</button></div>\n    <nav class="nav" id="nav" aria-label="Sections"></nav>')

# ---------- cockpit: alerts panel ----------
rep('''      <section class="sec" id="s-cockpit" data-title="Resilience cockpit" data-crumb="Platform">''',
'''      <section class="sec" id="s-deck" data-title="My assignment" data-crumb="Captain / Driver on deck">
        <div class="deckbar"><label for="deckWho" class="note">I am</label><select id="deckWho"></select><span class="pill" id="deckConn"><span class="dot gold"></span><span>demo</span></span></div>
        <div class="deckgrid">
          <div class="phone"><div class="phead"><span id="pTitle">—</span><span id="pClock" class="mono"></span></div><div class="pbody" id="deckMain"></div></div>
          <div class="stack">
            <div class="panel"><h3>My vehicle</h3><dl class="kv" id="deckKv"></dl></div>
            <div class="panel"><h3>How this works</h3><p class="lede" style="font-size:12.5px">When the Command Center approves a reroute, the order arrives here within seconds. <b>Accept</b> it or report a <b>problem</b>; your answer goes back to the operator and is stored in the CAP service (<span class="mono">Dispatches</span>).</p></div>
          </div>
        </div>
      </section>

      <section class="sec" id="s-deckorders" data-title="My orders" data-crumb="Captain / Driver on deck">
        <div class="panel"><h3>Reroute orders for this vehicle <span class="r" id="deckOrdN"></span></h3><div id="deckOrders"></div></div>
      </section>

      <section class="sec" id="s-deckreport" data-title="Report an issue" data-crumb="Captain / Driver on deck">
        <div class="deckgrid">
          <div class="panel"><h3>What is happening where you are?</h3>
            <textarea id="repText" placeholder="e.g. Water over the road at the Palar bridge, cannot pass">Water over the road near the Palar bridge at Ambur, police stopping trucks.</textarea>
            <div class="chips" id="repChips" style="margin-top:8px"></div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn gold" id="repSend">Send to Command Center</button><span class="note" id="repNote"></span></div>
          </div>
          <div class="panel"><h3>Last report</h3><div id="repOut"><div class="empty">Nothing sent yet.</div></div></div>
        </div>
      </section>

      <section class="sec" id="s-cockpit" data-title="Resilience cockpit" data-crumb="Platform">
        <div class="panel" id="alertsPanel"><h3>Active alerts <span class="tag live">Real events</span><span class="r" id="alertCount">0 open</span></h3><div id="alertList"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" id="sndBtn">🔔 Sound + desktop alerts: off</button><button class="btn sm" id="testAlert">Send test alert</button></div></div>''')

# ---------- CSS ----------
CSS = '''
/* ---- finale: alerts, two menus, crew deck, screen fitting ---- */
.alertbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:9px 24px;background:#C62828;color:#fff;font-weight:600;font-size:13.5px;animation:abflash 1.2s ease-in-out 3}
.alertbar .btn{background:#fff;color:#C62828;border-color:#fff;padding:4px 10px;font-size:12px}
.alertbar .btn.ghost{background:transparent;color:#fff}
.alertbar .grow{flex:1;min-width:180px}
@keyframes abflash{50%{background:#8E1B1B}}
.pill.bell{cursor:pointer;background:#fff;font:inherit;font-size:12px}
.pill.bell.hot{border-color:var(--crit);color:#C62828;animation:pulse 1.6s infinite}
.kpi.hot{border-color:rgba(229,72,77,.6);box-shadow:0 0 0 3px rgba(229,72,77,.15)}
.modesw{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:12px 12px 0;padding:4px;background:rgba(0,0,0,.18);border-radius:10px}
.modesw button{all:unset;cursor:pointer;text-align:center;padding:8px 6px;border-radius:7px;font-size:12.5px;color:rgba(255,255,255,.85)}
.modesw button.on{background:#fff;color:#0F4F85;font-weight:600}
.modesw button:focus-visible{outline:2px solid #fff}
.al{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 11px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;background:var(--n1)}
.al.crit{border-color:rgba(229,72,77,.55);background:rgba(229,72,77,.06)}
.al .when{font:11px var(--mono);color:var(--dim)}
.deckbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.deckbar select{min-width:min(320px,100%)}
.deckgrid{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:16px;align-items:start}
.phone{border:10px solid #0E2A47;border-radius:30px;background:#fff;overflow:hidden;box-shadow:var(--shadow);max-width:420px;width:100%}
.phead{display:flex;justify-content:space-between;background:#0E2A47;color:#fff;padding:8px 14px 10px;font-size:12.5px;font-weight:600}
.pbody{padding:14px;min-height:420px;display:flex;flex-direction:column;gap:12px}
.order{border:2px solid var(--gold);border-radius:12px;padding:14px;background:linear-gradient(180deg,rgba(25,181,254,.08),transparent)}
.order.new{animation:neword 1s ease-in-out 3}
@keyframes neword{50%{border-color:var(--crit);box-shadow:0 0 0 6px rgba(229,72,77,.18)}}
.order h2{font-family:var(--serif);font-size:19px;margin:4px 0 8px;line-height:1.25}
.order .big{display:flex;gap:10px;margin-top:12px}
.order .big .btn{flex:1;padding:12px;font-size:14px;text-align:center}
.calm{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px;min-height:300px;color:var(--muted)}
.calm .ic{font-size:42px}
body.deckmode #resetBtn,body.deckmode .top .search,body.deckmode #statusPill,body.deckmode #bellBtn{display:none}
@media (max-width:1100px){.deckgrid{grid-template-columns:minmax(0,1fr)}.phone{margin:0 auto}}
@media (max-width:820px){.alertbar{padding:9px 16px}}
@media (max-height:820px) and (min-width:821px){.mapslot{height:calc(100vh - 190px);min-height:320px}.kpi .v{font-size:23px}.scroll{padding-block:14px 32px}}
@media (min-width:1700px){body{font-size:15px}.scroll{padding-inline:32px}}
@media (max-width:480px){.top{gap:8px}.top h1{font-size:16px}#statusPill,#dataPill{font-size:11px;padding:3px 8px}.kpi .v{font-size:22px}.panel{padding:14px}.g4,.g5{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}#resetBtn{padding:5px 9px;font-size:12px}}
'''
rep('@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}' + CSS)

# ---------- nav: two menus ----------
old_nav_start = s.index("$('#nav').innerHTML = SECS.map(")
old_nav_end = s.index('\n', old_nav_start)
s = s[:old_nav_start] + '''const DECK_SECS = [ ['grp','On deck'],['deck','My assignment','⚓'],['deckorders','My orders',''],['deckreport','Report an issue','!'] ];
function renderNav(){
  const list = S.mode==='deck' ? DECK_SECS : SECS;
  $('#nav').innerHTML = list.map(x => x[0]==='grp' ? `<div class="grp">${x[1]}</div>` : `<button data-s="${x[0]}" class="${S.sec===x[0]?'on':''}"><span class="k">${x[2]}</span>${x[1]}<span class="badge" id="b-${x[0]}" hidden></span></button>`).join('');
  $$('.modesw button').forEach(b => b.classList.toggle('on', b.dataset.mode===S.mode));
  $('#brandSub').textContent = S.mode==='deck' ? 'Captain / Driver app' : 'SAP BTP prototype';
}
renderNav();
$$('.modesw button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
function setMode(m){ S.mode = m; document.body.classList.toggle('deckmode', m==='deck'); renderNav(); go(m==='deck' ? 'deck' : 'overview'); refresh(); }''' + s[old_nav_end:]
rep("const S = { sec:'overview',", "const S = { mode:'cc', alerts:[], sound:false, lastEngine:null, deckWho:'TR1', seenDisp:{}, probOpen:null, sec:'overview',")
rep("  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.s===id));",
    "  const deckSec = /^deck/.test(id); if ((S.mode==='deck') !== deckSec) { S.mode = deckSec ? 'deck' : 'cc'; document.body.classList.toggle('deckmode', deckSec); renderNav(); }\n  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.s===id));")
rep("  if (id==='orders') renderOrders(); if (id==='history') renderHistory(); if (id==='arch') renderArch();",
    "  if (id==='orders') renderOrders(); if (id==='history') renderHistory(); if (id==='arch') renderArch(); if (deckSec) renderDeck(); if (id==='cockpit') renderAlerts();")
rep("  const b = $('#b-approval'); b.hidden = !(S.phase==='approve' && S.an && !S.an.sc.sar && S.an.chosen); b.textContent = '1'; $('#menuBadge').hidden = b.hidden;",
    "  const needs = !!(S.phase==='approve' && S.an && !S.an.sc.sar && S.an.chosen); const b = $('#b-approval'); if (b) { b.hidden = !needs; b.textContent = '1'; } $('#menuBadge').hidden = !needs;\n  if (S.sec.startsWith('deck')) renderDeck(); if (S.sec==='cockpit') renderAlerts(); renderAlertBar();")
rep("  const start = (location.hash||'').slice(1);\n  go('overview');",
    "  const start = (location.hash||'').slice(1);\n  initFinale();\n  let qm = null; try { qm = new URLSearchParams(location.search).get('mode'); } catch(e){}\n  if (/^deck/.test(start) || qm==='deck') setMode('deck'); else go('overview');")

# ---------- alerts from incidents ----------
rep("  toast(`Detected · ${sc.short}`, 'crit');", "  toast(`Detected · ${sc.short}`, 'crit');\n  raise({ id:'I'+S.t0, title:`${sc.sev} · ${sc.short}`, body:sc.raw, go:'overview' });")
rep("function resetInc(silent){", "function resetInc(silent){ S.alerts.forEach(a => { if (/^I/.test(a.id)) a.ack = true; });")

# ---------- architecture rows: AI Core, HANA, deck, Work Zone ----------
rep("    ['Classifier', `Rule engine in CAP classify()${DB.info?.classifier ? ' · '+esc(DB.info.classifier) : ''}`, L1 ? T.live('Live · rules') : T.built('Rules in page'), 'LLM on SAP AI Core, same output contract'],",
    "    ['Classifier', /AI Core/.test(S.lastEngine||'') ? `LLM via SAP AI Core · Generative AI Hub (${esc(S.lastEngine)}), rules as fallback` : `Rule engine in CAP classify()${DB.info?.classifier ? ' · '+esc(DB.info.classifier) : ''}; AI Core: ${esc(DB.info?.aiCore || 'not connected')}`, /AI Core/.test(S.lastEngine||'') ? T.live('Live · AI Core') : /^bound/.test(DB.info?.aiCore||'') ? T.built('AI Core bound') : L1 ? T.live('Live · rules') : T.built('Rules in page'), 'LLM on SAP AI Core (code in srv/ai-core.js, same output contract)'],")
rep("    ['Database', 'SQLite in memory, resets on restart', L1 ? T.live('Live') : T.sim('Browser storage'), 'SAP HANA Cloud (cds add hana)'],",
    "    ['Database', /hana/.test(DB.info?.db||'') ? 'SAP HANA Cloud · HDI container' : 'SQLite in memory, resets on restart', /hana/.test(DB.info?.db||'') ? T.live('Live · HANA Cloud') : L1 ? T.live('Live · SQLite') : T.sim('Browser storage'), 'SAP HANA Cloud (mta.yaml, CDS_ENV=hana)'],\n    ['Crew app', 'Captain / Driver deck: orders written by dispatchPlan, answered with reply()', L1 ? T.live('Live') : T.sim('Local only'), 'Same service; native app later'],\n    ['Launchpad', CFG.workzone ? 'Tile in SAP Build Work Zone opens this app' : 'Not set up', CFG.workzone ? T.live('Live') : T.plan('Planned'), 'SAP Build Work Zone site'],")

FINALE_JS = r'''
/* ================= FINALE: cockpit alerts, crew deck, dispatch orders ================= */
let audioCtx = null;
function beep(){ if (!S.sound) return; try { audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); [0,0.25,0.5].forEach(t => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type='square'; o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(audioCtx.destination); o.start(audioCtx.currentTime+t); o.stop(audioCtx.currentTime+t+0.15); }); } catch(e){} }
function raise(a){
  a = { id: a.id || ('A'+Date.now()+Math.random()), at: Date.now(), sev:'crit', ack:false, ...a };
  if (S.alerts.some(x => x.id===a.id)) return;
  S.alerts.unshift(a); S.alerts = S.alerts.slice(0, 30); beep();
  if (S.sound && 'Notification' in window && Notification.permission==='granted') { try { new Notification('SAP Rerouting · ' + a.title, { body: a.body || '' }); } catch(e){} }
  renderAlertBar(); if (S.sec==='cockpit') renderAlerts();
}
const openAlerts = () => S.alerts.filter(a => !a.ack);
function renderAlertBar(){
  const open = openAlerts(), bar = $('#alertBar'); if (!bar) return;
  $('#bellN').textContent = open.length; $('#bellBtn').classList.toggle('hot', open.some(a=>a.sev==='crit'));
  const top = open.find(a => a.sev==='crit');
  $$('#kpis .kpi').forEach((k,i) => k.classList.toggle('hot', i===2 && !!top));
  if (!top || S.mode==='deck') { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<span aria-hidden="true">⚠</span><span class="grow">${esc(top.title)}${top.body?' — <span style="font-weight:400">'+esc(top.body)+'</span>':''}</span>${top.go?`<button class="btn" data-go="${top.go}" data-alert="${top.id}">Open</button>`:''}<button class="btn ghost" data-ack="${top.id}">Acknowledge</button>${open.length>1?`<span style="font-weight:400">+${open.length-1} more</span>`:''}`;
}
function renderAlerts(){
  const el = $('#alertList'); if (!el) return; const open = openAlerts();
  $('#alertCount').textContent = `${open.length} open · ${S.alerts.length} total`;
  el.innerHTML = S.alerts.length ? S.alerts.map(a => `<div class="al ${a.sev==='crit'&&!a.ack?'crit':''}"><span class="when">${new Date(a.at).toLocaleTimeString('en-GB',{hour12:false,timeZone:TZ})}</span><div><b>${esc(a.title)}</b><div class="note">${esc(a.body||'')}</div></div><div style="display:flex;gap:6px">${a.go?`<button class="btn sm" data-go="${a.go}" data-alert="${a.id}">Open</button>`:''}${a.ack?'<span class="tag ok">Acknowledged</span>':`<button class="btn sm" data-ack="${a.id}">Acknowledge</button>`}</div></div>`).join('') : '<div class="empty">No alerts. Run a scenario or send a crew report to see one.</div>';
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ack]'); if (b) { const a = S.alerts.find(x=>x.id===b.dataset.ack); if (a) a.ack = true; renderAlertBar(); renderAlerts(); return; }
  const o = e.target.closest('[data-alert]'); if (o) { const a = S.alerts.find(x=>x.id===o.dataset.alert); if (a?.lat!=null && a.go==='investigate') setTimeout(() => { $('#ivText').value = a.text||''; S.draft = { c:[+a.lat, +a.lon], manual:true }; $('#ivWhere').textContent = `Location: ${where(S.draft.c)} (crew position)`; redrawMap(); fitView(); }, 60); }
});

/* crew orders: live = CAP Dispatches, demo = browser storage shared between tabs */
const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('sap-rerouting') : null;
const localDisp = () => (store.get().dispatches || []);
function saveLocalDisp(list){ const ls = store.get(); ls.dispatches = list.slice(0,100); store.set(ls); }
function localOrder(o){ const row = { ID: crypto.randomUUID?.() || String(Date.now()+Math.random()), status:'Sent', createdAt:new Date().toISOString(), ...o }; DB.dispatches = [row, ...localDisp()]; S.seenDisp[row.ID] = 'Sent'; saveLocalDisp(DB.dispatches); bc?.postMessage({ t:'disp' }); }
async function replyDispatch(id, status, note){
  if (DB.live) { try { const r = await api('/reply', { method:'POST', body:JSON.stringify({ ID:id, status, note }) }); const i = DB.dispatches.findIndex(x=>x.ID===id); if (i>=0) DB.dispatches[i] = r; } catch(e){ toast('Reply failed: '+e.message, 'crit'); return; } }
  else { DB.dispatches = localDisp(); const d = DB.dispatches.find(x=>x.ID===id); if (d) Object.assign(d, { status, reply:note||'', repliedAt:new Date().toISOString() }); saveLocalDisp(DB.dispatches); bc?.postMessage({ t:'disp' }); }
  toast(status==='Accepted' ? 'Accepted · Command Center informed' : 'Problem sent · Command Center alerted'); renderDeck();
}
async function pollDispatches(){
  if (DB.live) { try { DB.dispatches = (await api('/Dispatches?$orderby=createdAt desc&$top=100')).value; } catch(e){ return; } }
  else DB.dispatches = localDisp();
  let changed = false;
  for (const d of DB.dispatches) {
    const prev = S.seenDisp[d.ID]; if (prev === d.status) continue;
    S.seenDisp[d.ID] = d.status; changed = true;
    if (prev === undefined && d.status === 'Sent') { if (S.mode==='deck' && d.asset_ID===S.deckWho) beep(); continue; }
    const a = assetById(d.asset_ID); const who = `${a?.captain||''} (${a?.name||d.asset_ID})`; const K = DB.live ? 'sap' : 'sim';
    if (d.status === 'Accepted') { S.log.push([clockT(), `${who} accepted: ${d.routeName}`, 'ok', K]); renderLog(); if (S.mode==='cc') toast(`${who} accepted the reroute`); }
    if (d.status === 'Problem') { S.log.push([clockT(), `${who} reported a problem: ${d.reply||''}`, '', K]); renderLog(); raise({ id:'P'+d.ID, title:`Crew cannot follow reroute · ${a?.name||d.asset_ID}`, body:d.reply||'No details', go:'approval' }); }
  }
  if (changed && S.sec.startsWith('deck')) renderDeck();
}
async function pollReports(){
  if (!DB.live) return;
  try { const r = await api(`/Incidents?$filter=status eq 'Reported by crew'&$orderby=detectedAt desc&$top=20`); r.value.forEach(i => { if (Date.parse(i.detectedAt) >= Date.now() - 15*60e3) crewAlert(i); }); } catch(e){}
}
function crewAlert(i){ raise({ id:'R'+(i.ID||i.code), title:`Crew report · ${i.assets||''}: ${i.kind} (${i.severity})`, body:i.title, go:'investigate', lat:i.lat, lon:i.lon, text:i.title }); }
bc && (bc.onmessage = m => { if (m.data?.t==='disp') pollDispatches(); if (m.data?.t==='report') crewAlert(m.data.inc); });

const myDisp = () => DB.dispatches.filter(d => d.asset_ID===S.deckWho).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
function renderDeck(){
  const who = $('#deckWho'); if (!who) return;
  if (!who.options.length) { who.innerHTML = DB.assets.map(a=>`<option value="${a.ID}">${esc(a.captain||'')} · ${esc(a.name)} (${a.type==='VESSEL'?'vessel':'truck'})</option>`).join(''); who.value = S.deckWho; }
  const a = assetById(S.deckWho); if (!a) return;
  $('#deckConn').innerHTML = DB.live ? `<span class="dot"></span><span>Connected · ${onBTP() ? 'SAP BTP' : esc(apiHost())}</span>` : '<span class="dot gold"></span><span>Demo · syncs across tabs</span>';
  $('#pTitle').textContent = (a.type==='VESSEL'?'⚓ ':'🚚 ') + a.name; $('#pClock').textContent = clockT().slice(0,5);
  $('#deckKv').innerHTML = `<dt>Crew</dt><dd>${esc(a.captain||'—')}</dd><dt>Cargo</dt><dd>${esc(a.info)}</dd><dt>Destination</dt><dd>${esc(a.destination)}</dd><dt>Planned route</dt><dd>${esc(routesOf(a)[0]?.name||'—')}</dd><dt>ETA</dt><dd>${fmtDT(a.plan?.etaAt ?? a.etaAt)}</dd><dt>POs on board</dt><dd>${posOf([a.ID]).length}</dd>`;
  const list = myDisp(); const cur = list.find(d => d.status==='Sent') || list[0]; const isNew = cur && cur.status==='Sent';
  const keep = $('#probTxt')?.value, hadFocus = document.activeElement?.id==='probTxt';
  $('#deckMain').innerHTML = !cur ? `<div class="calm"><div class="ic">✅</div><b>No changes. Continue on the planned route.</b><div class="note">${esc(routesOf(a)[0]?.name||'')}</div><div class="note">New orders from the Command Center appear here.</div></div>`
    : `<div class="order ${isNew?'new':''}"><div class="eyebrow">${isNew?'New reroute order':'Order '+esc(cur.status).toLowerCase()} · ${esc(cur.incidentCode||'')}</div><h2>${esc(cur.routeName||'Reroute')}</h2><p style="margin:0 0 8px">${esc(cur.instruction||'')}</p><dl class="kv"><dt>New ETA</dt><dd>${fmtDT(Date.parse(cur.newEta))}</dd><dt>Sent</dt><dd>${fmtDT(Date.parse(cur.createdAt))}</dd>${cur.reply?`<dt>Your note</dt><dd>${esc(cur.reply)}</dd>`:''}</dl>
      ${isNew && S.probOpen===cur.ID ? `<label for="probTxt" class="note">What is the problem?</label><textarea id="probTxt" style="min-height:70px">Road on the new route is also closed</textarea><div class="big"><button class="btn danger" data-probsend="${cur.ID}">Send problem</button><button class="btn ghost" data-probcancel="1">Cancel</button></div>` : isNew ? `<div class="big"><button class="btn gold" data-acc="${cur.ID}">✔ Accept</button><button class="btn danger" data-prob="${cur.ID}">✖ Problem</button></div>` : `<span class="tag ${cur.status==='Accepted'?'ok':'crit'}">${esc(cur.status)}</span>`}</div>`;
  if (keep != null && $('#probTxt')) { $('#probTxt').value = keep; if (hadFocus) $('#probTxt').focus(); }
  $('#deckOrdN').textContent = `${list.length} order${list.length===1?'':'s'}`;
  $('#deckOrders').innerHTML = list.length ? `<div class="tw"><table><thead><tr><th>Sent</th><th>Incident</th><th>Route</th><th>New ETA</th><th>Status</th><th>Note</th></tr></thead><tbody>${list.map(d=>`<tr><td class="mono">${fmtDT(Date.parse(d.createdAt))}</td><td class="mono">${esc(d.incidentCode||'')}</td><td>${esc(d.routeName||'')}</td><td class="mono">${fmtDT(Date.parse(d.newEta))}</td><td><span class="tag ${d.status==='Accepted'?'ok':d.status==='Problem'?'crit':'gold'}">${esc(d.status)}</span></td><td class="note">${esc(d.reply||'')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No orders for this vehicle yet.</div>';
}
document.addEventListener('change', e => { if (e.target.id==='deckWho') { S.deckWho = e.target.value; S.probOpen = null; renderDeck(); } });
document.addEventListener('click', e => {
  const acc = e.target.closest('[data-acc]'); if (acc) return replyDispatch(acc.dataset.acc, 'Accepted', 'Following the new route');
  const pr = e.target.closest('[data-prob]'); if (pr) { S.probOpen = pr.dataset.prob; renderDeck(); setTimeout(() => $('#probTxt')?.focus(), 30); return; }
  const ps = e.target.closest('[data-probsend]'); if (ps) { const note = ($('#probTxt')?.value || '').trim() || 'No details'; S.probOpen = null; return replyDispatch(ps.dataset.probsend, 'Problem', note); }
  if (e.target.closest('[data-probcancel]')) { S.probOpen = null; renderDeck(); }
});
const REP_SAMPLES = ['Water over the road near the Palar bridge at Ambur, police stopping trucks.','Engine overheating, reducing speed, Bay of Bengal.','Long queue at Colombo anchorage, pilot says 20 hours wait.','Rocks falling on the ghat road near Sakleshpur.'];
async function sendReport(){
  const txt = $('#repText').value.trim(); if (!txt) { toast('Describe what is happening first.'); return; }
  const a = assetById(S.deckWho); $('#repSend').disabled = true; $('#repNote').textContent = 'Classifying…';
  const { r:cls } = await classifyAny(txt);
  const c = cls.coordinates || [a.lat, a.lon];
  const inc = { code:`RPT-${String(Date.now()).slice(-6)}`, title:txt.slice(0,120), kind:cls.event_type, mode:a.type==='VESSEL'?'Sea':'Road', severity:cls.severity, confidence:cls.confidence, lat:c[0], lon:c[1], radiusKm:30, assets:a.name, chosenRoute:'—', status:'Reported by crew', detectedAt:new Date().toISOString(), posAffected:posOf([a.ID]).length, posProtected:0 };
  if (DB.live) { try { const r = await api('/Incidents', { method:'POST', body:JSON.stringify(inc) }); inc.ID = r.ID; } catch(e){ toast('Report failed: '+e.message, 'crit'); $('#repSend').disabled = false; $('#repNote').textContent = ''; return; } }
  else { inc.ID = 'L'+Date.now(); persistLocal('incidents', inc); bc?.postMessage({ t:'report', inc }); crewAlert(inc); }
  DB.incidents.unshift(inc);
  $('#repSend').disabled = false; $('#repNote').textContent = '';
  $('#repOut').innerHTML = `<div class="ares"><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="tag gold">${esc(cls.event_type)}</span><span class="tag ${sevCls(cls.severity)}">${esc(cls.severity)}</span><span class="tag">conf ${(+cls.confidence).toFixed(2)}</span></div><div class="note">Sent ${clockT()} IST · classified by ${esc(cls.engine || 'rules in page')}</div><div class="note">The Command Center now shows a red alert with your report.</div></div>`;
  toast('Report sent to Command Center');
}
function initFinale(){
  $('#bellBtn').onclick = () => go('cockpit');
  $('#sndBtn').onclick = async () => { S.sound = !S.sound; if (S.sound && 'Notification' in window && Notification.permission==='default') { try { await Notification.requestPermission(); } catch(e){} } $('#sndBtn').textContent = `🔔 Sound + desktop alerts: ${S.sound?'on':'off'}`; if (S.sound) beep(); };
  $('#testAlert').onclick = () => raise({ title:'Test alert', body:'Cockpit alerting works', go:'cockpit' });
  $('#repChips').innerHTML = REP_SAMPLES.map((t,i)=>`<button class="chip" data-rp="${i}">${esc(t.slice(0,32))}…</button>`).join('');
  $('#repChips').onclick = e => { const b = e.target.closest('[data-rp]'); if (b) $('#repText').value = REP_SAMPLES[b.dataset.rp]; };
  $('#repSend').onclick = sendReport;
  if (!DB.live) DB.dispatches = localDisp();
  DB.dispatches.forEach(d => S.seenDisp[d.ID] = d.status);
  setInterval(() => { pollDispatches(); pollReports(); }, CFG.poll || 4000);
  renderAlertBar();
}
'''
rep("/* ================= BOOT ================= */", FINALE_JS + "\n/* ================= BOOT ================= */")
P.write_text(s, encoding='utf-8')
print('patched', len(s))
