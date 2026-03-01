const express = require('express');
const router = express.Router();
const { q } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { verifyAdminPasswordAuto } = require('../security');

router.get('/admin/login', (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/admin/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const ok = await verifyAdminPasswordAuto(email, req.body.password || '');
  if (!ok) return res.render('admin/login', { error: 'Onjuiste login.' });

  const u = await q("SELECT id, email, full_name, status FROM admin_users WHERE email=$1 LIMIT 1", [email]);
  if (!u.rows.length) return res.render('admin/login', { error: 'Onjuiste login.' });
  if (u.rows[0].status !== 'active') return res.render('admin/login', { error: 'Account gedeactiveerd.' });

  await q("UPDATE admin_users SET last_login_at=now() WHERE id=$1", [u.rows[0].id]);

  req.session.admin = {
    id: u.rows[0].id,
    email: u.rows[0].email,
    full_name: u.rows[0].full_name
  };
  res.redirect('/admin');
});

router.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/admin', requireAdmin, async (req, res) => {
  const stats = await q(
    `SELECT
       (SELECT COUNT(*)::int FROM companies WHERE is_active=true) AS companies_active,
       (SELECT COUNT(*)::int FROM company_users) AS users_total,
       (SELECT COUNT(*)::int FROM employees WHERE status='active') AS employees_active,
       (SELECT COUNT(*)::bigint FROM scan_events) AS scan_events_total`
  );

  const companies = await q(
    `SELECT c.company_number, c.company_name, c.city, c.email, c.created_at,
            (SELECT COUNT(*)::int FROM employees e WHERE e.company_id=c.id AND e.status='active') AS employees_active
     FROM companies c
     ORDER BY c.created_at DESC
     LIMIT 50`
  );

  res.render('admin/dashboard', { stats: stats.rows[0], companies: companies.rows });
});

module.exports = router;
