function safeTrim(v) {
  return (v || "").toString().trim();
}

function randomCode(len) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function requireFields(obj, fields) {
  const missing = [];
  for (const f of fields) {
    if (!safeTrim(obj[f])) missing.push(f);
  }
  return missing;
}

module.exports = { safeTrim, randomCode, requireFields };
