/* Hydra rule-based event classifier.
 * One file, two runtimes: the CAP service requires it (srv/hydra-service.js → classify function)
 * and the web app loads it with <script> as the offline fallback when no backend is connected.
 * Production target: replace with an LLM call on SAP AI Core (Generative AI Hub); the output
 * shape below is the contract the other agents rely on. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HydraRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const GAZ = [['gulf of aden',12.8,48.5],['bab el-mandeb',12.6,43.4],['ambur',12.79,78.72],['vellore',12.92,79.13],['krishnagiri',12.52,78.21],['hosur',12.74,77.83],['nh48',12.92,79.13],['chennai',13.1,80.3],['bay of bengal',15.0,86.0],['colombo',6.95,79.84],['suez',29.9,32.6],['nhava sheva',18.95,72.95],['mumbai',18.95,72.95],['singapore',1.26,103.8],['arabian sea',15.0,64.0],['bengaluru',12.97,77.59],['andaman',11.7,92.7],['malacca',2.5,101.5],['shiradi',12.87,75.68],['sakleshpur',12.94,75.78],['mangaluru',12.92,74.85],['charmadi',13.08,75.47],['hassan',13.0,76.1],['kochi',9.97,76.25],['vizhinjam',8.38,76.99],['salalah',16.95,54.0],['hormuz',26.5,56.4],['jebel ali',25.01,55.06],['visakhapatnam',17.69,83.3],['haldia',22.03,88.06],['kolar',13.14,78.13],['chittoor',13.22,79.1]];
  const TYPES = [['Weather',['cyclone','storm','wind','typhoon','monsoon','rain','fog']],['Flood',['flood','waterlog','water over','inundat','overflow']],['Landslide',['landslide','mudslide','rockfall','ghat closed','debris']],['Mechanical',['engine','failure','breakdown','not under command','propulsion','rudder','fire']],['Port congestion',['congestion','berth','anchorage','waiting','queue','strike']],['Seismic',['earthquake','tsunami','seismic']],['Accident',['collision','accident','crash','grounding','capsiz','overturn']]];
  const HI = ['severe','critical','failure','blocked','halted','distress','closed','avoid','fire','tsunami','110','not under command','shut'];
  const MED = ['warning','delay','heavy','moderate','congestion','intensifying','waiting','crawling'];
  const VERSION = 'rules-1.1';

  function classify(txt) {
    const t = String(txt || '').toLowerCase(); let best = ['Other', 0];
    TYPES.forEach(([k, ws]) => { const n = ws.filter(w => t.includes(w)).length; if (n > best[1]) best = [k, n]; });
    // a specific hazard (flood, landslide, failure...) beats generic weather words like "rain"
    const spec = TYPES.filter(([k]) => k !== 'Weather').map(([k, ws]) => [k, ws.filter(w => t.includes(w)).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
    if (best[0] === 'Weather' && spec) best = [spec[0], best[1]];
    const hi = HI.filter(w => t.includes(w)).length, md = MED.filter(w => t.includes(w)).length;
    const sev = hi >= 2 ? 'Critical' : hi === 1 ? 'High' : md ? 'Medium' : 'Low';
    const loc = GAZ.find(([n]) => t.includes(n));
    const conf = Math.min(0.98, 0.42 + best[1] * 0.16 + (loc ? 0.14 : 0) + Math.min(hi + md, 3) * 0.05);
    return {
      event_type: best[0], severity: sev,
      location: loc ? loc[0].replace(/\b\w/g, c => c.toUpperCase()) : 'Unresolved',
      coordinates: loc ? [loc[1], loc[2]] : null,
      confidence: +conf.toFixed(2),
      action: conf < 0.7 ? 'HOLD_FOR_CORROBORATION' : (sev === 'Critical' || sev === 'High') ? 'TRIGGER_IMPACT_AGENT' : 'LOG_ONLY',
      engine: VERSION
    };
  }
  return { classify, VERSION };
});
