const express = require('express');
const router = express.Router();
const { q } = require('../db');
const { requireUser } = require('../middleware/auth');
const { minutesToHHMM } = require('../utils/time');

function appTabs(active) {
  return [
    { href: "/app", label: "DASHBOARD", active: active === "dash" },
    { href: "/app/employees", label: "WERKNEMERS", active: active === "emp" },
    { href: "/app/reference", label: "REFERENTIE", active: active === "ref" },
    { href: "/app/balance", label: "BALANS", active: active === "bal" },
    { href: "/app/export", label: "EXPORT", active: active === "exp" }
  ];
}

router.get('/app', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;

  const empCount = await q("SELECT COUNT(*)::int AS n FROM employees WHERE company_id=$1 AND status='active'", [companyId]);
  const lastScans = await q(
    `SELECT se.scanned_at, se.scan_type, e.display_name, st.location_label
     FROM scan_events se
     JOIN employees e ON e.id = se.employee_id
     JOIN scan_tags st ON st.id = se.scan_tag_id
     WHERE se.company_id=$1
     ORDER BY se.scanned_at DESC
     LIMIT 10`, [companyId]
  );

  const ref = await q(
    `SELECT reference_days, weekly_minutes_target, effective_from
     FROM reference_profiles
     WHERE company_id=$1 AND effective_to IS NULL
     ORDER BY effective_from DESC
     LIMIT 1`, [companyId]
  );

  let balance = null;
  if (ref.rows.length) {
    const { reference_days, weekly_minutes_target } = ref.rows[0];
    const worked = await q(
      `WITH ev AS (
          SELECT employee_id, scanned_at, scan_type,
                 LAG(scanned_at) OVER (PARTITION BY employee_id ORDER BY scanned_at) AS prev_time,
                 LAG(scan_type)  OVER (PARTITION BY employee_id ORDER BY scanned_at) AS prev_type
          FROM scan_events
          WHERE company_id=$1 AND scanned_at >= now() - ($2 || ' days')::interval
      )
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (scanned_at - prev_time))/60),0)::int AS minutes
      FROM ev
      WHERE scan_type='OUT' AND prev_type='IN' AND prev_time IS NOT NULL`,
      [companyId, reference_days]
    );
    const workedMin = worked.rows[0].minutes || 0;
    const targetMin = Math.round(weekly_minutes_target * (reference_days / 7));
    balance = { workedMin, targetMin, diffMin: workedMin - targetMin, diffHHMM: minutesToHHMM(workedMin - targetMin) };
  }

  res.render('app/dashboard', {
    title: "Dashboard · MyPunctoo",
    chrome: true,
    badge: req.session.user.company_name,
    topMeta: "Klant #" + req.session.user.company_number,
    logoutAction: "/logout",
    tabs: appTabs("dash"),
    empCount: empCount.rows[0].n,
    lastScans: lastScans.rows,
    ref: ref.rows[0] || null,
    balance
  });
});

module.exports = router;