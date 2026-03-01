const express = require('express');
const router = express.Router();
const { q } = require('../db');
const { verifyPasswordAuto } = require('../security');

function layoutLogin(error) {
  return {
    title: "Login · Punctoo",
    chrome: true,
    badge: "MyPunctoo",
    logoutAction: null,
    tabs: [{ href: "/login", label: "LOGIN", active: true }],
    error
  };
}

router.get('/login', async (req, res) => {
  res.render('auth/login', layoutLogin(null));
});

router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const companyNumber = (req.body.company_number || '').trim();

  if (!email || !companyNumber) {
    return res.render('auth/login', layoutLogin('Vul e-mail en klantnummer in.'));
  }

  const companyRes = await q(
    "SELECT id, company_name, company_number FROM companies WHERE company_number=$1 AND is_active=true LIMIT 1",
    [companyNumber]
  );
  if (!companyRes.rows.length) {
    return res.render('auth/login', layoutLogin('Klantnummer niet gevonden.'));
  }
  const company = companyRes.rows[0];

  const userRes = await q(
    "SELECT id, email, full_name, status FROM company_users WHERE company_id=$1 AND email=$2 LIMIT 1",
    [company.id, email]
  );
  if (!userRes.rows.length) return res.render('auth/login', layoutLogin('Gebruiker niet gevonden.'));
  const user = userRes.rows[0];
  if (user.status !== 'active') return res.render('auth/login', layoutLogin('Account is gedeactiveerd.'));

  const ok = await verifyPasswordAuto(email, company.id, req.body.password || '');
  if (!ok) return res.render('auth/login', layoutLogin('Wachtwoord klopt niet.'));

  await q("UPDATE company_users SET last_login_at=now() WHERE id=$1", [user.id]);

  req.session.user = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    company_id: company.id,
    company_number: company.company_number,
    company_name: company.company_name
  };
  res.redirect('/app');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
