// Prints a TEAM_USERS entry with a SHA-256 hash instead of the plain password.
// Usage: node tools/hash-password.js <user> <password>
const [u, p] = process.argv.slice(2);
if (!u || !p) { console.error('usage: node tools/hash-password.js <user> <password>'); process.exit(1); }
console.log(`${u}:sha256:${require('node:crypto').createHash('sha256').update(p).digest('hex')}`);
