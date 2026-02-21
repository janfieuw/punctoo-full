const { v4: uuidv4 } = require("uuid");
const db = require("../db");

function getSessionDays() {
  const d = Number(process.env.SESSION_DAYS || "30");
  return Number.isFinite(d) && d > 0 ? d : 30;
}

async function createSession(userId) {
  const id = uuidv4();
  const days = getSessionDays();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)`,
    [id, userId, expiresAt]
  );
  return { id, expiresAt };
}

async function getSession(sessionId) {
  const r = await db.query(
    `SELECT s.id, s.user_id, s.expires_at, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [sessionId]
  );
  return r.rows[0] || null;
}

async function touchSession(sessionId) {
  const days = getSessionDays();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await db.query(`UPDATE sessions SET expires_at = $2 WHERE id = $1`, [sessionId, expiresAt]);
  return expiresAt;
}

async function deleteSession(sessionId) {
  await db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
}

async function purgeExpiredSessions() {
  await db.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
}

module.exports = { createSession, getSession, touchSession, deleteSession, purgeExpiredSessions };
