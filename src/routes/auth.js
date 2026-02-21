const express = require("express");
const { v4: uuidv4 } = require("uuid");

const db = require("../db");
const { hashPassword, verifyPassword } = require("../services/password");
const sessionSvc = require("../services/session");
const { requireFields, safeTrim, normalizeVat } = require("../services/helpers");
const { COOKIE_NAME } = require("../middleware/auth");

const router = express.Router();

function setSessionCookie(res, sessionId, expiresAt) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    expires: new Date(expiresAt),
  });
}

router.get("/signup", (req, res) => {
  if (req.user) return res.redirect("/my");
  return res.render("signup", { error: null, values: {} });
});

router.post("/signup", async (req, res) => {
  try {
    const values = req.body || {};
    const missing = requireFields(values, [
      "email",
      "password",
      "company_name",
      "vat_number",
      "company_address_line1",
      "company_postcode",
      "company_city",
      "company_country",
      "delivery_name",
      "delivery_address_line1",
      "delivery_postcode",
      "delivery_city",
      "delivery_country",
    ]);

    if (missing.length) {
      return res.status(400).render("signup", {
        error: "Vul alle verplichte velden in.",
        values,
      });
    }

    const email = safeTrim(values.email).toLowerCase();
    const password = String(values.password || "");
    if (password.length < 8) {
      return res.status(400).render("signup", {
        error: "Wachtwoord moet minstens 8 tekens zijn.",
        values,
      });
    }

    const existing = await db.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (existing.rowCount) {
      return res.status(400).render("signup", {
        error: "Dit e-mailadres is al geregistreerd.",
        values,
      });
    }

    const userId = uuidv4();
    const companyId = uuidv4();

    const pwdHash = await hashPassword(password);

    await db.query("BEGIN");

    await db.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3)`,
      [userId, email, pwdHash]
    );

    await db.query(
      `INSERT INTO companies (
        id, company_name, vat_number,
        company_address_line1, company_address_line2, company_postcode, company_city, company_country,
        delivery_name, delivery_address_line1, delivery_address_line2, delivery_postcode, delivery_city, delivery_country,
        admin_seen
      ) VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,
        FALSE
      )`,
      [
        companyId,
        safeTrim(values.company_name),
        normalizeVat(values.vat_number),
        safeTrim(values.company_address_line1),
        safeTrim(values.company_address_line2),
        safeTrim(values.company_postcode),
        safeTrim(values.company_city),
        safeTrim(values.company_country),
        safeTrim(values.delivery_name),
        safeTrim(values.delivery_address_line1),
        safeTrim(values.delivery_address_line2),
        safeTrim(values.delivery_postcode),
        safeTrim(values.delivery_city),
        safeTrim(values.delivery_country),
      ]
    );

    await db.query(
      `INSERT INTO company_members (company_id, user_id, role) VALUES ($1,$2,'owner')`,
      [companyId, userId]
    );

    await db.query("COMMIT");

    const sess = await sessionSvc.createSession(userId);
    setSessionCookie(res, sess.id, sess.expiresAt);

    return res.redirect("/my");
  } catch (e) {
    try { await db.query("ROLLBACK"); } catch {}
    console.error(e);
    return res.status(500).render("signup", { error: "Er ging iets mis.", values: req.body || {} });
  }
});

router.get("/login", (req, res) => {
  if (req.user) return res.redirect("/my");
  return res.render("login", { error: null, email: "" });
});

router.post("/login", async (req, res) => {
  const email = safeTrim(req.body.email).toLowerCase();
  const password = String(req.body.password || "");
  const r = await db.query(`SELECT id, password_hash FROM users WHERE email = $1`, [email]);
  if (!r.rowCount) return res.status(400).render("login", { error: "Login is niet correct.", email });

  const ok = await verifyPassword(password, r.rows[0].password_hash);
  if (!ok) return res.status(400).render("login", { error: "Login is niet correct.", email });

  const sess = await sessionSvc.createSession(r.rows[0].id);
  setSessionCookie(res, sess.id, sess.expiresAt);

  return res.redirect("/my");
});

router.post("/logout", async (req, res) => {
  const sid = req.cookies[COOKIE_NAME];
  if (sid) await sessionSvc.deleteSession(sid);
  res.clearCookie(COOKIE_NAME);
  return res.redirect("/login");
});

module.exports = router;
