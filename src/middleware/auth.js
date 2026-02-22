const db = require("../db");

async function attachUser(req, res, next) {
  if (!req.session || !req.session.userId) return next();
  const r = await db.query(
    `SELECT u.id, u.email, u.company_id, c.company_name, c.customer_number, c.subscription_start_date, c.vat_number
     FROM users u JOIN companies c ON c.id=u.company_id
     WHERE u.id=$1`,
    [req.session.userId]
  );
  if (r.rowCount) {
    req.user = { id: r.rows[0].id, email: r.rows[0].email, company_id: r.rows[0].company_id };
    req.company = {
      id: r.rows[0].company_id,
      company_name: r.rows[0].company_name,
      customer_number: r.rows[0].customer_number,
      subscription_start_date: r.rows[0].subscription_start_date,
      vat_number: r.rows[0].vat_number,
    };
  }
  return next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.redirect("/login");
}

function requireCompany(req, res, next) {
  if (req.company) return next();
  return res.redirect("/login");
}

// Admin session is separate
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/admin/login");
}

module.exports = { attachUser, requireAuth, requireCompany, requireAdmin };
