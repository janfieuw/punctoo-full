const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth, requireCompany } = require("../middleware/auth");
const { randomCode, safeTrim, requireFields } = require("../services/helpers");
const { makeTagPdf } = require("../services/tagPdf");

const router = express.Router();

router.get("/my", requireAuth, requireCompany, async (req, res) => {
  const company = req.company;
  const employees = await db.query(
    `SELECT id, employee_name, pairing_code, created_at
     FROM employees WHERE company_id = $1 ORDER BY created_at DESC`,
    [company.id]
  );
  const tags = await db.query(
    `SELECT id, tag_name, tag_code, created_at
     FROM scantags WHERE company_id = $1 ORDER BY created_at DESC`,
    [company.id]
  );
  return res.render("my/home", { user: req.user, company, employees: employees.rows, tags: tags.rows });
});

// Employees list + create
router.get("/my/employees", requireAuth, requireCompany, async (req, res) => {
  const employees = await db.query(
    `SELECT id, employee_name, pairing_code, created_at
     FROM employees WHERE company_id = $1 ORDER BY created_at DESC`,
    [req.company.id]
  );
  return res.render("my/employees", { user: req.user, company: req.company, employees: employees.rows, error: null });
});

router.post("/my/employees", requireAuth, requireCompany, async (req, res) => {
  const name = safeTrim(req.body.employee_name);
  if (!name) {
    const employees = await db.query(
      `SELECT id, employee_name, pairing_code, created_at
       FROM employees WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.company.id]
    );
    return res.status(400).render("my/employees", { user: req.user, company: req.company, employees: employees.rows, error: "Geef een naam in." });
  }

  // pairing code unique per company
  let code = randomCode(6);
  for (let i = 0; i < 5; i++) {
    const exists = await db.query(`SELECT 1 FROM employees WHERE company_id=$1 AND pairing_code=$2`, [req.company.id, code]);
    if (!exists.rowCount) break;
    code = randomCode(6);
  }

  await db.query(
    `INSERT INTO employees (id, company_id, employee_name, pairing_code)
     VALUES ($1,$2,$3,$4)`,
    [uuidv4(), req.company.id, name, code]
  );

  return res.redirect("/my/employees");
});

// edit employee name
router.post("/my/employees/:id/update-name", requireAuth, requireCompany, async (req, res) => {
  const id = req.params.id;
  const name = safeTrim(req.body.employee_name);
  if (!name) return res.redirect("/my/employees");

  await db.query(
    `UPDATE employees SET employee_name=$3
     WHERE id=$1 AND company_id=$2`,
    [id, req.company.id, name]
  );
  return res.redirect("/my/employees");
});

// Tags list + create
router.get("/my/tags", requireAuth, requireCompany, async (req, res) => {
  const tags = await db.query(
    `SELECT id, tag_name, tag_code, created_at
     FROM scantags WHERE company_id = $1 ORDER BY created_at DESC`,
    [req.company.id]
  );
  return res.render("my/tags", { user: req.user, company: req.company, tags: tags.rows, error: null });
});

router.post("/my/tags", requireAuth, requireCompany, async (req, res) => {
  const name = safeTrim(req.body.tag_name);
  if (!name) {
    const tags = await db.query(`SELECT id, tag_name, tag_code, created_at FROM scantags WHERE company_id=$1 ORDER BY created_at DESC`, [req.company.id]);
    return res.status(400).render("my/tags", { user: req.user, company: req.company, tags: tags.rows, error: "Geef een naam in." });
  }

  let code = randomCode(8);
  for (let i = 0; i < 5; i++) {
    const exists = await db.query(`SELECT 1 FROM scantags WHERE company_id=$1 AND tag_code=$2`, [req.company.id, code]);
    if (!exists.rowCount) break;
    code = randomCode(8);
  }

  await db.query(
    `INSERT INTO scantags (id, company_id, tag_name, tag_code)
     VALUES ($1,$2,$3,$4)`,
    [uuidv4(), req.company.id, name, code]
  );

  return res.redirect("/my/tags");
});

// Tag PDF always downloadable
router.get("/my/tags/:id/pdf", requireAuth, requireCompany, async (req, res) => {
  const r = await db.query(
    `SELECT id, tag_name, tag_code FROM scantags WHERE id=$1 AND company_id=$2`,
    [req.params.id, req.company.id]
  );
  if (!r.rowCount) return res.status(404).send("Not found");

  const tag = r.rows[0];
  const pdf = await makeTagPdf({
    companyName: req.company.company_name,
    tagName: tag.tag_name,
    tagCode: tag.tag_code,
    baseUrl: req.appBaseUrl,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="ScanTag-${tag.tag_code}.pdf"`);
  return res.send(pdf);
});

// Extra ScanTag order (delivery address required again)
router.get("/my/order-scantag", requireAuth, requireCompany, (req, res) => {
  return res.render("my/order_scantag", { user: req.user, company: req.company, error: null, values: {} });
});

router.post("/my/order-scantag", requireAuth, requireCompany, async (req, res) => {
  const values = req.body || {};
  const missing = requireFields(values, [
    "delivery_name",
    "delivery_address_line1",
    "delivery_postcode",
    "delivery_city",
    "delivery_country",
    "quantity",
  ]);
  if (missing.length) {
    return res.status(400).render("my/order_scantag", { user: req.user, company: req.company, error: "Vul alle verplichte velden in.", values });
  }
  const qty = Number(values.quantity || "1");
  if (!Number.isFinite(qty) || qty < 1) {
    return res.status(400).render("my/order_scantag", { user: req.user, company: req.company, error: "Ongeldige hoeveelheid.", values });
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

  return res.redirect("/my?order=ok");
});

module.exports = router;
