"""UI end-to-end check. Usage: python3 test/ui-e2e.py [base_url] [outdir]"""
import sys, time, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4004/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/claude-0/shots'
import os; os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, m):
    print(('  ✓ ' if c else '  ✗ ') + m)
    if not c: fails.append(m)

with sync_playwright() as p:
    b = p.chromium.launch()
    LEAF = open('/tmp/claude-0/package/dist/leaflet.js').read()
    def route(ctx):
        ctx.route('**/cdnjs.cloudflare.com/**', lambda r: r.fulfill(body=LEAF, content_type='application/javascript'))
        ctx.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
        ctx.route('**/fonts.gstatic.com/**', lambda r: r.abort())
        ctx.route('**/basemaps.cartocdn.com/**', lambda r: r.abort())
    errs = []
    ctx = b.new_context(viewport={'width': 1366, 'height': 768}); route(ctx)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and 'ERR_' not in m.text and '404' not in m.text and errs.append(m.text))
    pg.goto(BASE); pg.wait_for_timeout(2500)
    check(pg.title() == 'SAP Rerouting', f'title = {pg.title()}')
    check('SAP' in pg.inner_text('.logo'), 'logo says SAP Rerouting')
    pill = pg.inner_text('#dataPill'); print('   data pill:', pill)
    live = 'live' in pill.lower()
    # page fits width
    sw = pg.evaluate('document.documentElement.scrollWidth'); check(sw <= 1366, f'no horizontal scroll at 1366 (scrollWidth {sw})')
    pg.screenshot(path=f'{OUT}/1366-overview.png')
    # run flood scenario
    pg.click('[data-run="flood"]'); pg.wait_for_timeout(1200)
    check(pg.is_visible('#alertBar'), 'red alert bar shows on detection')
    check(pg.inner_text('#bellN') != '0', 'bell counter increments')
    pg.screenshot(path=f'{OUT}/1366-alert.png')
    pg.wait_for_timeout(5500)
    pg.evaluate("go('approval')"); pg.wait_for_timeout(300)
    check(pg.is_visible('#apBtn'), 'approve button available')
    pg.click('#apBtn'); pg.wait_for_timeout(2500)
    log = pg.inner_text('#dlog'); check('Driver order' in log or 'Voyage instruction' in log, 'dispatch log shows crew orders')
    # deck in same tab
    pg.evaluate("setMode('deck')"); pg.wait_for_timeout(500)
    pg.select_option('#deckWho', 'TR1'); pg.wait_for_timeout(300)
    check(pg.is_visible('[data-acc]'), 'driver TR1 sees the new reroute order')
    pg.screenshot(path=f'{OUT}/1366-deck-order.png')
    pg.click('[data-prob]'); pg.wait_for_timeout(200)
    pg.fill('#probTxt', 'Chittoor road also flooded'); pg.wait_for_timeout(4500)  # survive a poll
    check(pg.input_value('#probTxt') == 'Chittoor road also flooded', 'typed problem text survives polling')
    pg.click('[data-probsend]'); pg.wait_for_timeout(600)
    check('Problem' in pg.inner_text('#deckMain'), 'deck shows Problem status')
    # driver report
    pg.evaluate("go('deckreport')"); pg.wait_for_timeout(300)
    pg.click('#repSend'); pg.wait_for_timeout(1500)
    check('classified by' in pg.inner_text('#repOut'), 'crew report sent + classified')
    # back to command center — alerts should be there
    pg.evaluate("setMode('cc')"); pg.wait_for_timeout(CFG_POLL := 5000)
    pg.evaluate("go('cockpit')"); pg.wait_for_timeout(1200)
    al = pg.inner_text('#alertList'); print('   alerts:', al.replace('\n', ' | ')[:300])
    check('Crew cannot follow reroute' in al, 'cockpit alert for crew problem')
    check('Crew report' in al, 'cockpit alert for crew report')
    lc = pg.inner_text('#stOut'); print('   live checks:', lc.replace('\n', ' | ')[:400])
    pg.screenshot(path=f'{OUT}/1366-cockpit.png', full_page=True)
    pg.evaluate("go('classify')"); pg.click('#clsBtn'); pg.wait_for_timeout(1200)
    check('engine' in pg.inner_text('#clsOut'), 'classifier output shows which engine answered')
    pg.evaluate("go('arch')"); pg.wait_for_timeout(400)
    arch = pg.inner_text('#sapMap'); check('Simulated' in arch or 'Sample data' in arch, 'architecture table uses honest labels')
    tags = pg.eval_on_selector_all('#sapMap .tag', 'els => els.map(e => e.textContent)'); check('Modelled' not in arch , f'no Modelled overclaims {sorted(set(tags))}')
    pg.screenshot(path=f'{OUT}/1366-arch.png', full_page=True)
    if live:
        pg.evaluate("go('history')"); pg.evaluate("document.querySelector('#histSeg [data-h=po]').click()"); pg.wait_for_timeout(500)
        check('Dispatch agent' in pg.inner_text('#poHist'), 'live: write-back rows visible in PO change log')
    check(not errs, f'no JS errors ({errs[:3]})')

    # sizes
    for w, h, name in [(1920, 1080, '1920'), (1280, 720, '1280'), (390, 844, 'phone')]:
        c2 = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1); route(c2)
        q = c2.new_page(); e2 = []; q.on('pageerror', lambda e: e2.append(str(e)))
        q.goto(BASE); q.wait_for_timeout(2000)
        sw = q.evaluate('document.documentElement.scrollWidth'); check(sw <= w, f'{name}: no horizontal scroll ({sw}/{w})')
        q.screenshot(path=f'{OUT}/{name}-overview.png')
        q.evaluate("setMode('deck')"); q.wait_for_timeout(400)
        sw = q.evaluate('document.documentElement.scrollWidth'); check(sw <= w, f'{name} deck: no horizontal scroll ({sw}/{w})')
        q.screenshot(path=f'{OUT}/{name}-deck.png')
        check(not e2, f'{name}: no JS errors {e2[:2]}')
        c2.close()
    b.close()
print('\nFAILED:' if fails else '\nALL UI CHECKS PASSED', fails)
sys.exit(1 if fails else 0)
