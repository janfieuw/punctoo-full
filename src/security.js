const bcrypt = require('bcryptjs');
const { q } = require('./db');

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Backwards compatible with seed that uses crypt()
async function verifyPasswordAuto(email, companyId, plain) {
  // Try bcrypt first
  const { rows } = await q(
    "SELECT password_hash FROM company_users WHERE company_id=$1 AND email=$2 LIMIT 1",
    [companyId, email]
  );
  if (!rows.length) return false;
  const hash = rows[0].password_hash;

  // bcrypt hashes start with $2
  if (hash && hash.startsWith("$2")) {
    return verifyPassword(plain, hash);
  }

  // fallback to postgres crypt (seed)
  const r = await q(
    "SELECT (password_hash = crypt($1, password_hash)) AS ok FROM company_users WHERE company_id=$2 AND email=$3",
    [plain, companyId, email]
  );
  return !!r.rows?.[0]?.ok;
}

async function verifyAdminPasswordAuto(email, plain) {
  const { rows } = await q("SELECT password_hash FROM admin_users WHERE email=$1 LIMIT 1", [email]);
  if (!rows.length) return false;
  const hash = rows[0].password_hash;
  if (hash && hash.startsWith("$2")) return verifyPassword(plain, hash);
  const r = await q("SELECT (password_hash = crypt($1, password_hash)) AS ok FROM admin_users WHERE email=$2", [plain, email]);
  return !!r.rows?.[0]?.ok;
}

module.exports = { hashPassword, verifyPassword, verifyPasswordAuto, verifyAdminPasswordAuto };
