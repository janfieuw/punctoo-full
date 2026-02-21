const db = require("../db");
const sessionSvc = require("../services/session");

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "punctoo_session";

async function attachUser(req, _res, next) {
  try {
    const sid = req.cookies[COOKIE_NAME];
    if (!sid) {
      req.user = null;
      return next();
    }

    const sess = await sessionSvc.getSession(sid);
    if (!sess) {
      req.user = null;
      return next();
    }

    // expire check
    if (new Date(sess.expires_at).getTime() < Date.now()) {
      await sessionSvc.deleteSession(sid);
      req.user = null;
      return next();
    }

    // sliding expiry
    await sessionSvc.touchSession(sid);

    req.user = { id: sess.user_id, email: sess.email };
    return next();
  } catch (e) {
    return next(e);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.redirect("/login");
  return next();
}

async function attachCompany(req, _res, next) {
  // For now: 1 company per user (owner). If later: implement switcher.
  if (!req.user) {
    req.company = null;
    return next();
  }
  const r = await db.query(
    `SELECT c.*, cm.role
     FROM company_members cm
     JOIN companies c ON c.id = cm.company_id
     WHERE cm.user_id = $1
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [req.user.id]
  );
  req.company = r.rows[0] || null;
  return next();
}

function requireCompany(req, res, next) {
  if (!req.company) return res.redirect("/signup-company");
  return next();
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.company) return res.redirect("/signup-company");
    if (!allowed.includes(req.company.role)) return res.status(403).send("Forbidden");
    return next();
  };
}

module.exports = { attachUser, requireAuth, attachCompany, requireCompany, requireRole, COOKIE_NAME };
