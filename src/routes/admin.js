const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { hashPassword, verifyPassword } = require("../services/password");
const sessionSvc = require("../services/session");
const { COOKIE_NAME } = require("../middleware/auth");

const router = express.Router();

const ADMIN_COOKIE = "punctoo_admin_session";

function adminCredsConfigured() {
  return !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
}

async function ensureAdminUser() {
  if (!adminCredsConfigured()) return;

  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const r = await db.query(`SELECT id, password_hash FROM admin_users WHERE email=$1`, [email]);
  if (!r.rowCount) {
    const id = uuidv4();
    const hash = await hashPassword(password);
    await db.query(`INSERT INTO admin_users (id, email, password_hash) VALUES ($1,$2,$3)`, [id, email, hash]);
  }
}

function setAdminCookie(res, sid, expiresAt) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(ADMIN_COOKIE, sid, { httpOnly: true, sameSite: "lax", secure: isProd, expires: new Date(expiresAt) });
}

async function attachAdmin(req, _res, next) {
  try {
    const sid = req.cookies[ADMIN_COOKIE];
    if (!sid) {
      req.admin = null;
      return next();
    }
    // reuse sessions table but separate cookie
    const sess = await sessionSvc.getSession(sid);
    if (!sess) {
      req.admin = null;
      return next();
    }
    if (new Date(sess.expires_at).getTime() < Date.now()) {
      await sessionSvc.deleteSession(sid);
      req.admin = null;
      return next();
    }
    req.admin = { id: sess.user_id, email: sess.email };
    return next();
  } catch (e) {
    return next(e);
  }
}

function requireAdmin(req, res, next) {
  if (!req.admin) return res.redirect("/admin/login");
  return next();
}

router.use(async (req, _res, next) => {
  // seed admin user on first touch
  try {
    await ensureAdminUser();
  } catch (e) {
    console.error("admin seed error", e);
  }
  return next();
});

router.use(attachAdmin);

router.get("/admin/login", (req, res) => {
  if (!adminCredsConfigured()) {
    return res.status(500).send("ADMIN_EMAIL/ADMIN_PASSWORD ontbreken in .env");
  }
  if (req.admin) return res.redirect("/admin");
  return res.render("admin/login", { error: null, email: process.env.ADMIN_EMAIL || "" });
});

router.post("/admin/login", async (req, res) => {
  if (!adminCredsConfigured()) return res.status(500).send("Admin creds not set");
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const r = await db.query(`SELECT id, password_hash FROM admin_users WHERE email=$1`, [email]);
  if (!r.rowCount) return res.status(400).render("admin/login", { error: "Login is niet correct.", email });

  const ok = await verifyPassword(password, r.rows[0].password_hash);
  if (!ok) return res.status(400).render("admin/login", { error: "Login is niet correct.", email });

  // create session in sessions table (user_id = admin_users.id), but sessionSvc joins to users by default
  // -> create dedicated admin_sessions table to avoid mixing.
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id UUID PRIMARY KEY,
      admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  const sid = uuidv4();
  const days = Number(process.env.SESSION_DAYS || "30");
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await db.query(`INSERT INTO admin_sessions (id, admin_user_id, expires_at) VALUES ($1,$2,$3)`, [sid, r.rows[0].id, expiresAt]);
  setAdminCookie(res, sid, expiresAt);

  return res.redirect("/admin");
});

async function getAdminSession(sid) {
  const r = await db.query(
    `SELECT s.id, s.admin_user_id, s.expires_at, a.email
     FROM admin_sessions s
     JOIN admin_users a ON a.id = s.admin_user_id
     WHERE s.id = $1`,
    [sid]
  );
  return r.rows[0] || null;
}

async function attachAdmin2(req, _res, next) {
  const sid = req.cookies[ADMIN_COOKIE];
  if (!sid) { req.admin = null; return next(); }
  const sess = await getAdminSession(sid);
  if (!sess) { req.admin = null; return next(); }
  if (new Date(sess.expires_at).getTime() < Date.now()) {
    await db.query(`DELETE FROM admin_sessions WHERE id=$1`, [sid]);
    req.admin = null; 
    return next();
  }
  req.admin = { id: sess.admin_user_id, email: sess.email };
  return next();
}

// override attachAdmin with correct table
router.use(attachAdmin2);

router.post("/admin/logout", async (req, res) => {
  const sid = req.cookies[ADMIN_COOKIE];
  if (sid) await db.query(`DELETE FROM admin_sessions WHERE id=$1`, [sid]);
  res.clearCookie(ADMIN_COOKIE);
  return res.redirect("/admin/login");
});

router.get("/admin", requireAdmin, async (req, res) => {
  const newSignups = await db.query(`SELECT COUNT(*)::int AS n FROM companies WHERE admin_seen = FALSE`);
  const newOrders = await db.query(`SELECT COUNT(*)::int AS n FROM scantag_orders WHERE admin_seen = FALSE`);
  return res.render("admin/home", {
    admin: req.admin,
    kpis: { newSignups: newSignups.rows[0].n, newOrders: newOrders.rows[0].n },
  });
});

router.get("/admin/customers", requireAdmin, async (req, res) => {
  const r = await db.query(
    `SELECT id, customer_number, subscription_start_date, company_name, vat_number, admin_seen
     FROM companies
     ORDER BY subscription_start_date DESC, created_at DESC`
  );
  return res.render("admin/customers", { admin: req.admin, customers: r.rows });
});

router.get("/admin/customers/:companyId", requireAdmin, async (req, res) => {
  const companyId = req.params.companyId;

  const c = await db.query(`SELECT * FROM companies WHERE id=$1`, [companyId]);
  if (!c.rowCount) return res.status(404).send("Not found");

  // mark seen
  await db.query(`UPDATE companies SET admin_seen = TRUE WHERE id=$1`, [companyId]);

  const tags = await db.query(
    `SELECT id, tag_name, tag_code, created_at FROM scantags WHERE company_id=$1 ORDER BY created_at DESC`,
    [companyId]
  );
  const orders = await db.query(
    `SELECT id, quantity, status, admin_seen, created_at, delivery_name, delivery_address_line1, delivery_address_line2, delivery_postcode, delivery_city, delivery_country
     FROM scantag_orders WHERE company_id=$1 ORDER BY created_at DESC`,
    [companyId]
  );

  // mark orders seen
  await db.query(`UPDATE scantag_orders SET admin_seen = TRUE WHERE company_id=$1`, [companyId]);

  return res.render("admin/customer_detail", { admin: req.admin, company: c.rows[0], tags: tags.rows, orders: orders.rows });
});

module.exports = router;
