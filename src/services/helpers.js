const crypto = require("crypto");

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function safeTrim(v) {
  return String(v || "").trim();
}

function requireFields(obj, fields) {
  const missing = [];
  for (const f of fields) {
    if (!safeTrim(obj[f])) missing.push(f);
  }
  return missing;
}

function normalizeVat(v) {
  return safeTrim(v).replace(/\s+/g, "").toUpperCase();
}

module.exports = { randomCode, safeTrim, requireFields, normalizeVat };
