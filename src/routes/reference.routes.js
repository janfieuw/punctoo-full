const express = require('express');
const router = express.Router();
const { q } = require('../db');
const { requireUser } = require('../middleware/auth');

function appTabs(active) {
  return [
    { href: "/app", label: "DASHBOARD", active: active === "dash" },
    { href: "/app/employees", label: "WERKNEMERS", active: active === "emp" },
    { href: "/app/reference", label: "REFERENTIE", active: active === "ref" },
    { href: "/app/balance", label: "BALANS", active: active === "bal" },
    { href: "/app/export", label: "EXPORT", active: active === "exp" }
  ];
}

async function loadData(companyId) {
  const current = await q(
    `SELECT id, reference_days, weekly_minutes_target, effective_from
     FROM reference_profiles
     WHERE company_id=$1 AND effective_to IS NULL
     ORDER BY effective_from DESC
     LIMIT 1`, [companyId]
  );

  const history = await q(
    `SELECT reference_days, weekly_minutes_target, effective_from, effective_to
     FROM reference_profiles
     WHERE company_id=$1
     ORDER BY effective_from DESC
     LIMIT 10`, [companyId]
  );

  return { current: current.rows[0] || null, history: history.rows };
}

router.get('/app/reference', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const { current, history } = await loadData(companyId);

  res.render('app/reference', {
    title: "Referentie · MyPunctoo",
    chrome: true,
    badge: req.session.user.company_name,
    topMeta: "Klant #" + req.session.user.company_number,
    logoutAction: "/logout",
    tabs: appTabs("ref"),
    current,
    history,
    error: null
  });
});

router.post('/app/reference', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const days = parseInt(req.body.reference_days, 10);
  const weeklyHours = parseFloat(req.body.weekly_hours);
  const eff = (req.body.effective_from || '').trim();

  if (!days || Number.isNaN(days) || days < 7 || days > 366 || !weeklyHours || weeklyHours < 0 || !eff) {
    const { current, history } = await loadData(companyId);
    return res.render('app/reference', {
      title: "Referentie · MyPunctoo",
      chrome: true,
      badge: req.session.user.company_name,
      topMeta: "Klant #" + req.session.user.company_number,
      logoutAction: "/logout",
      tabs: appTabs("ref"),
      current,
      history,
      error: "Ongeldige waarden."
    });
  }

  const weeklyMinutes = Math.round(weeklyHours * 60);

  await q(
    `UPDATE reference_profiles
     SET effective_to = (DATE($2) - INTERVAL '1 day')::date
     WHERE company_id=$1 AND effective_to IS NULL`,
    [companyId, eff]
  );

  await q(
    `INSERT INTO reference_profiles(company_id, reference_days, weekly_minutes_target, effective_from, created_by_user_id)
     VALUES ($1,$2,$3,DATE($4),$5)`,
    [companyId, days, weeklyMinutes, eff, req.session.user.id]
  );

  res.redirect('/app/reference');
});

module.exports = router;