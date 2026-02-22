const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { safeTrim } = require("../services/helpers");

const router = express.Router();

router.get("/admin/login", (req, res) => {
  res.render("admin/login", { error: null, email: "" });
});

router.post("/admin/login", (req, res) => {
  const email = safeTrim(req.body.email).toLowerCase();
  const password = safeTrim(req.body.password);

  if (email === String(process.env.ADMIN_EMAIL || "").toLowerCase() &&
      password === String(process.env.ADMIN_PASSWORD || "")) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }
  return res.status(400).render("admin/login", { error: "Ongeldige login.", email });
});

router.post("/admin/logout", (req, res) => {
  req.session.isAdmin = false;
  return res.redirect("/admin/login");
});

router.get("/admin", requireAdmin, async (req, res) => {
  const newSignups = await db.query(`SELECT COUNT(*)::int AS c FROM companies WHERE admin_seen=FALSE`);
  const newOrders = await db.query(`SELECT COUNT(*)::int AS c FROM scantag_orders WHERE admin_seen=FALSE`);
  return res.render("admin/home", { kpis: { newSignups: newSignups.rows[0].c, newOrders: newOrders.rows[0].c } });
});

router.get("/admin/customers", requireAdmin, async (req, res) => {
  const r = await db.query(
    `SELECT id, company_name, vat_number, customer_number, subscription_start_date, admin_seen
     FROM companies
     ORDER BY subscription_start_date DESC, created_at DESC`
  );
  return res.render("admin/customers", { customers: r.rows });
});

router.get("/admin/customers/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
  const c = await db.query(`SELECT * FROM companies WHERE id=$1`, [id]);
  if (!c.rowCount) return res.status(404).send("Not found");

  await db.query(`UPDATE companies SET admin_seen=TRUE WHERE id=$1`, [id]);

  const tags = await db.query(`SELECT tag_name, tag_code FROM scantags WHERE company_id=$1 ORDER BY created_at DESC`, [id]);
  const orders = await db.query(`SELECT quantity, status, created_at FROM scantag_orders WHERE company_id=$1 ORDER BY created_at DESC`, [id]);

  const mappedOrders = orders.rows.map(o => ({
    quantity: o.quantity,
    status: o.status,
    date: new Date(o.created_at).toISOString().slice(0,10),
  }));

  return res.render("admin/customer_detail", { company: c.rows[0], tags: tags.rows, orders: mappedOrders });
});

module.exports = router;
