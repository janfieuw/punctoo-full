const express = require('express');
const router = express.Router();
const { q } = require('../db');
const { requireUser } = require('../middleware/auth');

function appTabs(active) {
  return [
    { href: "/app", label: "DASHBOARD", active: active === "dash" },
    { href: "/app/employees", label: "WERKNEMERS", active: active === "emp" },
    { href: "/app/reference", label: "REFERENTIE", active: active === "ref" },
    { href: "/app/export", label: "EXPORT", active: active === "exp" }
  ];
}

function csvEscape(v) {
  const s = (v ?? '').toString();
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

router.get('/app/export', requireUser, async (req, res) => {
  res.render('app/export', {
    title: "Export · MyPunctoo",
    chrome: true,
    badge: req.session.user.company_name,
    topMeta: "Klant #" + req.session.user.company_number,
    logoutAction: "/logout",
    tabs: appTabs("exp"),
    error: null
  });
});

router.get('/app/export/events.csv', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const from = (req.query.from || '').trim();
  const to = (req.query.to || '').trim();
  if (!from || !to) return res.redirect('/app/export');

  const { rows } = await q(
    `SELECT se.scanned_at, se.scan_type, e.display_name, e.coupling_code, st.tag_code, st.location_label, se.ip_address, se.user_agent
     FROM scan_events se
     JOIN employees e ON e.id=se.employee_id
     JOIN scan_tags st ON st.id=se.scan_tag_id
     WHERE se.company_id=$1
       AND se.scanned_at >= (DATE($2))::timestamptz
       AND se.scanned_at <  (DATE($3) + INTERVAL '1 day')::timestamptz
     ORDER BY se.scanned_at ASC`,
    [companyId, from, to]
  );

  const header = ["scanned_at","scan_type","employee_name","coupling_code","tag_code","location","ip_address","user_agent"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      csvEscape(r.scanned_at?.toISOString?.() ?? r.scanned_at),
      csvEscape(r.scan_type),
      csvEscape(r.display_name),
      csvEscape(r.coupling_code),
      csvEscape(r.tag_code),
      csvEscape(r.location_label || ''),
      csvEscape(r.ip_address || ''),
      csvEscape(r.user_agent || '')
    ].join(","));
  }

  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="punctoo-events-${from}-to-${to}.csv"`);
  res.send(lines.join("\n"));
});

module.exports = router;
