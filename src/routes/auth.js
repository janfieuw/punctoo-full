const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { attachUser } = require("../middleware/auth");
const { safeTrim, requireFields } = require("../services/helpers");

const router = express.Router();
router.use(attachUser);

router.get("/signup", (req, res) => {
  if (req.user) return res.redirect("/my");
  res.render("signup", { error: null, values: {} });
});

router.post("/signup", async (req, res) => {
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
    return res.status(400).render("signup", { error: "Vul alle verplichte velden in.", values });
  }

  const email = safeTrim(values.email).toLowerCase();
  const password = safeTrim(values.password);
  if (password.length < 8) {
    return res.status(400).render("signup", { error: "Wachtwoord moet minstens 8 tekens zijn.", values });
  }

  const exists = await db.query(`SELECT 1 FROM users WHERE email=$1`, [email]);
  if (exists.rowCount) {
    return res.status(400).render("signup", { error: "Dit e-mailadres bestaat al.", values });
  }

  // customer_number: max + 1
  const max = await db.query(`SELECT COALESCE(MAX(customer_number), 1000) AS m FROM companies`);
  const nextCustomerNumber = Number(max.rows[0].m) + 1;

  const companyId = uuidv4();
  const userId = uuidv4();
  const password_hash = await bcrypt.hash(password, 10);

  const today = new Date().toISOString().slice(0, 10);

  await db.query(
    `INSERT INTO companies (
      id, company_name, vat_number, company_address_line1, company_address_line2, company_postcode, company_city, company_country,
      delivery_name, delivery_address_line1, delivery_address_line2, delivery_postcode, delivery_city, delivery_country,
      customer_number, subscription_start_date, admin_seen
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,
      $9,$10,$11,$12,$13,$14,
      $15,$16,FALSE
    )`,
    [
      companyId,
      safeTrim(values.company_name),
      safeTrim(values.vat_number),
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
      nextCustomerNumber,
      today,
    ]
  );

  await db.query(
    `INSERT INTO users (id, company_id, email, password_hash) VALUES ($1,$2,$3,$4)`,
    [userId, companyId, email, password_hash]
  );

  // Mark as unseen for admin dashboard
  await db.query(`UPDATE companies SET admin_seen=FALSE WHERE id=$1`, [companyId]);

  req.session.userId = userId;
  return res.redirect("/my");
});

router.get("/login", (req, res) => {
  if (req.user) return res.redirect("/my");
  res.render("login", { error: null, email: "" });
});

router.post("/login", async (req, res) => {
  const email = safeTrim(req.body.email).toLowerCase();
  const password = safeTrim(req.body.password);

  const r = await db.query(`SELECT id, password_hash FROM users WHERE email=$1`, [email]);
  if (!r.rowCount) return res.status(400).render("login", { error: "Ongeldige login.", email });

  const ok = await bcrypt.compare(password, r.rows[0].password_hash);
  if (!ok) return res.status(400).render("login", { error: "Ongeldige login.", email });

  req.session.userId = r.rows[0].id;
  return res.redirect("/my");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

module.exports = router;
