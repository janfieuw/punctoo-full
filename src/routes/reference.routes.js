const express = require('express');
const router = express.Router();
const { q } = require('../db');
const { requireUser } = require('../middleware/auth');

router.get('/app/reference', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
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

  res.render('app/reference', { current: current.rows[0] || null, history: history.rows, error: null });
});

router.post('/app/reference', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const days = parseInt(req.body.reference_days, 10);
  const weeklyHours = parseFloat(req.body.weekly_hours);
  const eff = (req.body.effective_from || '').trim();

  if (!days || Number.isNaN(days) || days < 7 || days > 366 || !weeklyHours || weeklyHours < 0) {
    const cur = await q(`SELECT id, reference_days, weekly_minutes_target, effective_from
                         FROM reference_profiles WHERE company_id=$1 AND effective_to IS NULL
                         ORDER BY effective_from DESC LIMIT 1`, [companyId]);
    const hist = await q(`SELECT reference_days, weekly_minutes_target, effective_from, effective_to
                          FROM reference_profiles WHERE company_id=$1 ORDER BY effective_from DESC LIMIT 10`, [companyId]);
    return res.render('app/reference', { current: cur.rows[0] || null, history: hist.rows, error: 'Ongeldige waarden.' });
  }

  const weeklyMinutes = Math.round(weeklyHours * 60);

  // close current open-ended
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
