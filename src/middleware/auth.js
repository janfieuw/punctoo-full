const db = require("../db");

/**
 * attachUser
 * - vult req.user en req.company indien session userId bestaat
 * - zet res.locals.user en res.locals.company zodat EJS dit kan gebruiken
 */
async function attachUser(req, res, next) {
  try {
    req.user = null;
    req.company = null;

    res.locals.user = null;
    res.locals.company = null;

    if (!req.session || !req.session.userId) return next();

    const r = await db.query(
      `SELECT 
         u.id AS user_id,
         u.email AS user_email,
         u.company_id AS company_id,
         c.company_name,
         c.customer_number,
         c.subscription_start_date
       FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1`,
      [req.session.userId]
    );

    if (!r.rowCount) return next();

    const row = r.rows[0];

    req.user = {
      id: row.user_id,
      email: row.user_email,
      companyId: row.company_id,
    };

    req.company = {
      id: row.company_id,
      company_name: row.company_name,
      customer_number: row.customer_number,
      subscription_start_date: row.subscription_start_date,
    };

    res.locals.user = req.user;
    res.locals.company = req.company;

    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.redirect("/login");
}

function requireCompany(req, res, next) {
  if (req.company) return next();
  return res.redirect("/login");
}

module.exports = {
  attachUser,
  requireAuth,
  requireCompany,
};