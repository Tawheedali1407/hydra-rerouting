// Custom bootstrap: CORS so the UI can call this service from another origin (e.g. GitHub Pages).
// Allowed origins: HYDRA_CORS_ORIGINS (comma-separated, "*" allows any). Defaults cover GitHub Pages and localhost.
const cds = require('@sap/cds');

const DEFAULTS = ['https://tawheedali1407.github.io', /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const list = (process.env.HYDRA_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowed = origin => list.includes('*') || list.includes(origin) || DEFAULTS.some(d => d instanceof RegExp ? d.test(origin) : d === origin);

cds.on('bootstrap', app => app.use((req, res, next) => {
  const { origin } = req.headers;
  if (origin && allowed(origin)) {
    res.set({
      'access-control-allow-origin': origin, vary: 'Origin',
      'access-control-allow-methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,accept,x-hydra-source,if-match,authorization',
      'access-control-max-age': '600'
    });
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
}));

module.exports = cds.server;
