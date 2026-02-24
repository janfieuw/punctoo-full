const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { attachUser, requireAuth, requireCompany } = require("../middleware/auth");

const router = express.Router();
router.use(attachUser);

function safeTrim(v) {
  return String(v ?? "").trim();
}

function randomCode(len) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// ✅ Dashboard
router.get("/app", requireAuth, requireCompany, async (req, res, next) => {
  try {
    const company = req.company;

    const employees = await db.query(
      `SELECT id, employee_name, pairing_code, created_at
       FROM employees WHERE company_id=$1
       ORDER BY created_at DESC`,
      [company.id]
    );

    const tags = await db.query(
      `SELECT id, tag_name, tag_code, created_at
       FROM scantags WHERE company_id=$1
       ORDER BY created_at DESC`,
      [company.id]
    );

    const orderOk = String(req.query.order || "") === "ok";
    const subscriptionStart = company.subscription_start_date
      ? new Date(company.subscription_start_date).toISOString().slice(0, 10)
      : null;

    return res.render("my/home", {
      company,
      employees: employees.rows,
      tags: tags.rows,
      orderOk,
      subscriptionStart,
    });
  } catch (err) {
    return next(err);
  }
});

// ✅ Werknemers lijst
router.get("/app/employees", requireAuth, requireCompany, async (req, res, next) => {
  try {
    const employees = await db.query(
      `SELECT id, employee_name, pairing_code, created_at
       FROM employees WHERE company_id=$1
       ORDER BY created_at DESC`,
      [req.company.id]
    );

    return res.render("my/employees", { company: req.company, employees: employees.rows, error: null });
  } catch (err) {
    return next(err);
  }
});

// ✅ Werknemer toevoegen
router.post("/app/employees", requireAuth, requireCompany, async (req, res, next) => {
  try {
    const name = safeTrim(req.body.employee_name);

    if (!name) {
      const employees = await db.query(
        `SELECT id, employee_name, pairing_code, created_at
         FROM employees WHERE company_id=$1
         ORDER BY created_at DESC`,
        [req.company.id]
      );
      return res.status(400).render("my/employees", {
        company: req.company,
        employees: employees.rows,
        error: "Geef een naam in.",
      });
    }

    let code = randomCode(6);
    for (let i = 0; i < 10; i++) {
      const exists = await db.query(
        `SELECT 1 FROM employees WHERE company_id=$1 AND pairing_code=$2`,
        [req.company.id, code]
      );
      if (!exists.rowCount) break;
      code = randomCode(6);
    }

    await db.query(
      `INSERT INTO employees (id, company_id, employee_name, pairing_code)
       VALUES ($1,$2,$3,$4)`,
      [uuidv4(), req.company.id, name, code]
    );

    return res.redirect("/app/employees");
  } catch (err) {
    return next(err);
  }
});

// ✅ Naam wijzigen
router.post("/app/employees/:id/update-name", requireAuth, requireCompany, async (req, res, next) => {
  try {
    const id = req.params.id;
    const name = safeTrim(req.body.employee_name);
    if (!name) return res.redirect("/app/employees");

    await db.query(
      `UPDATE employees SET employee_name=$3 WHERE id=$1 AND company_id=$2`,
      [id, req.company.id, name]
    );

    return res.redirect("/app/employees");
  } catch (err) {
    return next(err);
  }
});

// ✅ Tags overzicht
router.get("/app/tags", requireAuth, requireCompany, async (req, res, next) => {
  try {
    const tags = await db.query(
      `SELECT id, tag_name, tag_code, created_at
       FROM scantags WHERE company_id=$1
       ORDER BY created_at DESC`,
      [req.company.id]
    );

    return res.render("my/tags", { company: req.company, tags: tags.rows, error: null });
  } catch (err) {
    return next(err);
  }
});

// ✅ Tag toevoegen
router.post("/app/tags", requireAuth, requireCompany, async (req, res, next) => {
  try {
    const name = safeTrim(req.body.tag_name);

    if (!name) {
      const tags = await db.query(
        `SELECT id, tag_name, tag_code, created_at
         FROM scantags WHERE company_id=$1
         ORDER BY created_at DESC`,
        [req.company.id]
      );
      return res.status(400).render("my/tags", { company: req.company, tags: tags.rows, error: "Geef een naam in." });
    }

    let code = randomCode(8);
    for (let i = 0; i < 10; i++) {
      const exists = await db.query(
        `SELECT 1 FROM scantags WHERE company_id=$1 AND tag_code=$2`,
        [req.company.id, code]
      );
      if (!exists.rowCount) break;
      code = randomCode(8);
    }

    await db.query(
      `INSERT INTO scantags (id, company_id, tag_name, tag_code)
       VALUES ($1,$2,$3,$4)`,
      [uuidv4(), req.company.id, name, code]
    );

    return res.redirect("/app/tags");
  } catch (err) {
    return next(err);
  }
});

// ✅ Extra ScanTag bestellen (adres opnieuw invullen)
router.get("/app/order-scantag", requireAuth, requireCompany, (req, res) => {
  res.render("my/order_scantag", { company: req.company, error: null, values: {} });
});

router.post("/app/order-scantag", requireAuth, requireCompany, async (req, res, next) => {
  try {
    const values = req.body || {};

    const required = ["delivery_name", "delivery_address_line1", "delivery_postcode", "delivery_city", "delivery_country", "quantity"];
    const missing = required.filter((k) => !safeTrim(values[k]));

    if (missing.length) {
      return res.status(400).render("my/order_scantag", { company: req.company, error: "Vul alle verplichte velden in.", values });
    }

    const qty = Number(values.quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).render("my/order_scantag", { company: req.company, error: "Ongeldige hoeveelheid.", values });
    }

    await db.query(
      `INSERT INTO scantag_orders (
        id, company_id, delivery_name, delivery_address_line1, delivery_address_line2,
        delivery_postcode, delivery_city, delivery_country, quantity, admin_seen, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,'new')`,
      [
        uuidv4(),
        req.company.id,
        safeTrim(values.delivery_name),
        safeTrim(values.delivery_address_line1),
        safeTrim(values.delivery_address_line2),
        safeTrim(values.delivery_postcode),
        safeTrim(values.delivery_city),
        safeTrim(values.delivery_country),
        qty,
      ]
    );

    // mark for admin dashboard
    await db.query(`UPDATE companies SET admin_seen=FALSE WHERE id=$1`, [req.company.id]);

    return res.redirect("/app?order=ok");
  } catch (err) {
    return next(err);
  }
});

module.exports = router;