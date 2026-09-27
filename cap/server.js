// Custom bootstrap: CORS so the UI can call this service from another origin (e.g. GitHub Pages).
// Allowed origins: CORS_ORIGINS (comma-separated, "*" allows any). Defaults cover GitHub Pages and localhost.
const cds = require('@sap/cds');
const crypto = require('node:crypto');

// Team-only access. When TEAM_USERS is set, every page and API call needs a login (HTTP Basic, over HTTPS on BTP).
// Format: "ali:<password>,priya:<password>" or with hashes "ali:sha256:<hex>" (npm run hash-password -- <password>).
// Only /health stays open so Cloud Foundry can check the app. Not set → open (local development).
const TEAM = new Map((process.env.TEAM_USERS || '').split(',').map(s => s.trim()).filter(Boolean).map(e => {
  const i = e.indexOf(':'); return [e.slice(0, i), e.slice(i + 1)];
}).filter(([u, p]) => u && p));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const same = (a, b) => { const x = Buffer.from(sha(a)), y = Buffer.from(sha(b)); return crypto.timingSafeEqual(x, y); };
function teamUser(req) {
  const m = /^Basic (.+)$/.exec(req.headers.authorization || ''); if (!m) return null;
  const raw = Buffer.from(m[1], 'base64').toString('utf8'); const i = raw.indexOf(':'); if (i < 0) return null;
  const user = raw.slice(0, i), pass = raw.slice(i + 1), want = TEAM.get(user);
  if (!want) { same(pass, 'x'); return null; }
  const ok = want.startsWith('sha256:') ? same(sha(pass), want.slice(7)) : same(pass, want);
  return ok ? user : null;
}

const DEFAULTS = ['https://tawheedali1407.github.io', /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const list = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowed = origin => list.includes('*') || list.includes(origin) || DEFAULTS.some(d => d instanceof RegExp ? d.test(origin) : d === origin);

cds.on('bootstrap', app => {
  if (TEAM.size) app.use((req, res, next) => {
    if (req.path === '/health' || req.method === 'OPTIONS') return next();
    const u = teamUser(req);
    if (!u) { res.set('WWW-Authenticate', 'Basic realm="SAP Rerouting - team only", charset="UTF-8"'); return res.status(401).send('Team login required'); }
    req.headers['x-team-user'] = u; next();
  });
  if (TEAM.size) cds.log('rerouting').info(`team-only access on for ${TEAM.size} user(s)`);
});
cds.on('bootstrap', app => app.use((req, res, next) => {
  const { origin } = req.headers;
  if (origin && allowed(origin)) {
    res.set({
      'access-control-allow-origin': origin, vary: 'Origin',
      'access-control-allow-methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,accept,x-rerouting-source,if-match,authorization',
      'access-control-max-age': '600'
    });
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
}));

module.exports = cds.server;
