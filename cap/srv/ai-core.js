// Classifier on SAP AI Core · Generative AI Hub (orchestration service).
// Active only when an AI Core service binding exists (VCAP_SERVICES "aicore") or AICORE_SERVICE_KEY is set.
// Any failure returns null so the caller falls back to the rule engine; the demo never breaks on stage.
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const RESOURCE_GROUP = process.env.AI_RESOURCE_GROUP || 'default';
const KINDS = ['Weather', 'Flood', 'Landslide', 'Mechanical', 'Port congestion', 'Seismic', 'Accident', 'Other'];
const SEVS = ['Critical', 'High', 'Medium', 'Low'];
let lastError = null, lastOkAt = null;

function bound() {
  if (process.env.AICORE_SERVICE_KEY) return true;
  try { return !!JSON.parse(process.env.VCAP_SERVICES || '{}').aicore?.length; } catch { return false; }
}

const SYSTEM = `You are the classifier agent in a supply-chain disruption system for Indian Ocean shipping lanes and South Indian highways.
Read one alert and answer ONLY with minified JSON: {"event_type": one of ${JSON.stringify(KINDS)}, "severity": one of ${JSON.stringify(SEVS)}, "location": short place name or "Unresolved", "lat": number or null, "lon": number or null, "confidence": number between 0 and 1}.
Use null coordinates when unsure. Never invent places.`;

const actionFor = (conf, sev) => conf < 0.7 ? 'HOLD_FOR_CORROBORATION' : (sev === 'Critical' || sev === 'High') ? 'TRIGGER_IMPACT_AGENT' : 'LOG_ONLY';
const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(+v)) ? null : +v;

async function classify(text) {
  if (!bound()) return null;
  try {
    const { OrchestrationClient } = require('@sap-ai-sdk/orchestration');
    const client = new OrchestrationClient({
      promptTemplating: {
        model: { name: MODEL, params: { temperature: 0, max_tokens: 200 } },
        prompt: { template: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Alert: {{?alert}}' }] }
      }
    }, { resourceGroup: RESOURCE_GROUP });
    const res = await client.chatCompletion({ placeholderValues: { alert: String(text).slice(0, 2000) } });
    const raw = res.getContent() || '';
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const severity = SEVS.includes(j.severity) ? j.severity : 'Low';
    const confidence = +Math.max(0, Math.min(1, +j.confidence || 0)).toFixed(2);
    lastError = null; lastOkAt = new Date().toISOString();
    return {
      event_type: KINDS.includes(j.event_type) ? j.event_type : 'Other', severity,
      location: String(j.location || 'Unresolved').slice(0, 60), lat: num(j.lat), lon: num(j.lon),
      confidence, action: actionFor(confidence, severity), engine: `SAP AI Core · ${MODEL}`
    };
  } catch (e) {
    lastError = String(e.message || e).slice(0, 160);
    console.warn('[ai-core] classify failed, falling back to rules:', lastError);
    return null;
  }
}

function status() {
  if (!bound()) return 'not bound';
  if (lastError) return `bound · last call failed: ${lastError}`;
  return lastOkAt ? `bound · ${MODEL} · last ok ${lastOkAt}` : `bound · ${MODEL} · not called yet`;
}

module.exports = { classify, status, bound, lastError: () => lastError };
