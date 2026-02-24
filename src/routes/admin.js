const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { attachUser } = require("../middleware/auth");

const router = express.Router();
router.use(attachUser);

// --------------------
// Helpers
// --------------------
function safeTrim(v) {
  return String(v ?? "").trim();
}

function requireAdmin(req, res, next) {
  // Admin session is apart van user session
  if (req.session && req.session.adminId) return next();
  return res.redirect("/admin/login");
}

// --------------------
// Admin auth (seeded via env)
// --------------------
async function ensureAdminSeeded() {
  const email = safeTrim(process.env.ADMIN_EMAIL).toLowerCase();
  const pass = safeTrim(process.env.ADMIN_PASSWORD);

  if (!email || !pass) return; // zonder env vars doen we niks

  const exists = await db.query(`SELECT 1 FROM admins WHERE email=$1`, [email]);
  if (exists.rowCount) return;

  const hash = await bcrypt.hash(pass, 10);
  await db.query(`INSERT INTO admins (email, password_hash) VALUES ($1,$2)`, [email, hash]);
}

// --------------------
// Routes
// --------------------
router.get("/admin/login", async (req, res, next) => {
  try {
    await ensureAdminSeeded();
    if (req.session && req.session.adminId) return res.redirect("/admin");
    return res.render("admin/login", { error: null, email: "" });
  } catch (err) {
    return next(err);
  }
});

router.post("/admin/login", async (req, res, next) => {
  try {
    const email = safeTrim(req.body.email).toLowerCase();
    const password = safeTrim(req.body.password);

    const r = await db.query(`SELECT id, password_hash FROM admins WHERE email=$1`, [email]);
    if (!r.rowCount) return res.status(400).render("admin/login", { error: "Ongeldige login.", email });

    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.status(400).render("admin/login", { error: "Ongeldige login.", email });

    req.session.adminId = r.rows[0].id;
    return res.redirect("/admin");
  } catch (err) {
    return next(err);
  }
});

router.post("/admin/logout", (req, res) => {
  req.session.adminId = null;
  return res.redirect("/admin/login");
});

// Dashboard
router.get("/admin", requireAdmin, async (req, res, next) => {
  try {
    // Nieuwe klanten / nieuwe orders (admin_seen = FALSE)
    const newCustomers = await db.query(
      `SELECT id, customer_number, company_name, subscription_start_date
       FROM companies
       WHERE admin_seen = FALSE
       ORDER BY subscription_start_date DESC NULLS LAST, company_name ASC
       LIMIT 50`
    );

    const newOrders = await db.query(
      `SELECT id, company_id, quantity, status, created_at
       FROM scantag_orders
       WHERE admin_seen = FALSE
       ORDER BY created_at DESC
       LIMIT 50`
    );

    return res.render("admin/dashboard", {
      newCustomers: newCustomers.rows,
      newOrders: newOrders.rows,
    });
  } catch (err) {
    return next(err);
  }
});

// Klantenlijst
router.get("/admin/customers", requireAdmin, async (req, res, next) => {
  try {
    const customers = await db.query(
      `SELECT id, customer_number, company_name, subscription_start_date
       FROM companies
       ORDER BY subscription_start_date DESC NULLS LAST, company_name ASC`
    );

    return res.render("admin/customers", { customers: customers.rows });
  } catch (err) {
    return next(err);
  }
});

// Klantfiche
router.get("/admin/customers/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;

    const c = await db.query(
      `SELECT *
       FROM companies
       WHERE id=$1`,
      [id]
    );
    if (!c.rowCount) return res.status(404).send("Not found");

    const tags = await db.query(
      `SELECT id, tag_name, tag_code, created_at
       FROM scantags
       WHERE company_id=$1
       ORDER BY created_at DESC`,
      [id]
    );

    const employees = await db.query(
      `SELECT id, employee_name, pairing_code, created_at
       FROM employees
       WHERE company_id=$1
       ORDER BY created_at DESC`,
      [id]
    );

    const orders = await db.query(
      `SELECT id, quantity, status, admin_seen, created_at
       FROM scantag_orders
       WHERE company_id=$1
       ORDER BY created_at DESC`,
      [id]
    );

    return res.render("admin/customer", {
      customer: c.rows[0],
      tags: tags.rows,
      employees: employees.rows,
      orders: orders.rows,
    });
  } catch (err) {
    return next(err);
  }
});

// Mark order done
router.post("/admin/orders/:id/mark-done", requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;

    await db.query(
      `UPDATE scantag_orders
       SET status='done', admin_seen=TRUE
       WHERE id=$1`,
      [id]
    );

    return res.redirect("/admin");
  } catch (err) {
    return next(err);
  }
});

// Mark customer seen
router.post("/admin/customers/:id/mark-seen", requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;

    await db.query(
      `UPDATE companies
       SET admin_seen=TRUE
       WHERE id=$1`,
      [id]
    );

    return res.redirect("/admin");
  } catch (err) {
    return next(err);
  }
});

module.exports = router;