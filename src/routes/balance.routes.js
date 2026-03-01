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

function csvEscape(v) {
  const s = (v ?? '').toString();
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

async function getDailyBalance(companyId, employeeId, fromDate, toDate) {
  const sql = `
WITH days AS (
  SELECT d::date AS ref_date
  FROM generate_series($3::date, $4::date, interval '1 day') d
),
day_scans AS (
  SELECT
    se.employee_id,
    se.scanned_at::date AS ref_date,
    MIN(se.scanned_at) FILTER (WHERE se.scan_type = 'IN')  AS first_in,
    MAX(se.scanned_at) FILTER (WHERE se.scan_type = 'OUT') AS last_out,
    COUNT(*) FILTER (WHERE se.scan_type = 'IN')  AS in_count,
    COUNT(*) FILTER (WHERE se.scan_type = 'OUT') AS out_count
  FROM scan_events se
  WHERE se.company_id = $1
    AND se.employee_id = $2
    AND se.scanned_at >= $3::date
    AND se.scanned_at <  ($4::date + INTERVAL '1 day')
  GROUP BY se.employee_id, se.scanned_at::date
),
expected AS (
  SELECT
    d.ref_date,
    COALESCE(o.expected_minutes, w.expected_minutes, 0) AS expected_minutes,
    CASE
      WHEN o.id IS NOT NULL THEN 'override'
      WHEN w.id IS NOT NULL THEN 'weekday'
      ELSE 'none'
    END AS expected_source
  FROM days d
  LEFT JOIN employee_date_reference_override o
    ON o.employee_id = $2
   AND o.company_id = $1
   AND o.ref_date = d.ref_date
  LEFT JOIN employee_day_reference w
    ON w.employee_id = $2
   AND w.company_id = $1
   AND w.weekday = EXTRACT(ISODOW FROM d.ref_date)::int
   AND w.effective_to IS NULL
)
SELECT
  e.ref_date,
  e.expected_minutes,
  e.expected_source,
  s.first_in,
  s.last_out,
  COALESCE(s.in_count, 0)  AS in_count,
  COALESCE(s.out_count, 0) AS out_count,
  CASE
    WHEN s.first_in IS NOT NULL
     AND s.last_out IS NOT NULL
     AND s.last_out > s.first_in
    THEN FLOOR(EXTRACT(EPOCH FROM (s.last_out - s.first_in)) / 60)::int
    ELSE NULL
  END AS worked_minutes,
  CASE
    WHEN s.first_in IS NOT NULL
     AND s.last_out IS NOT NULL
     AND s.last_out > s.first_in
    THEN (FLOOR(EXTRACT(EPOCH FROM (s.last_out - s.first_in)) / 60)::int - e.expected_minutes)
    ELSE NULL
  END AS delta_minutes,
  CASE
    WHEN s.first_in IS NULL AND s.last_out IS NULL THEN 'NO_SCANS'
    WHEN s.first_in IS NULL AND s.last_out IS NOT NULL THEN 'MISSING_IN'
    WHEN s.first_in IS NOT NULL AND s.last_out IS NULL THEN 'MISSING_OUT'
    WHEN s.last_out <= s.first_in THEN 'INVALID_ORDER'
    ELSE 'OK'
  END AS status
FROM expected e
LEFT JOIN day_scans s
  ON s.ref_date = e.ref_date
ORDER BY e.ref_date;
  `;
  const r = await q(sql, [companyId, employeeId, fromDate, toDate]);
  return r.rows;
}

function defaultFromTo(daysBack = 14) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (daysBack - 1));
  return {
    fromISO: from.toISOString().slice(0, 10),
    toISO: to.toISOString().slice(0, 10)
  };
}

function mmToHHMM(min) {
  if (min === null || typeof min === 'undefined') return '—';
  const sign = min < 0 ? '-' : '';
  const m = Math.abs(parseInt(min, 10));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return sign + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

router.get('/app/balance', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;

  const employees = await q(
    "SELECT id, display_name FROM employees WHERE company_id=$1 AND status='active' ORDER BY display_name ASC",
    [companyId]
  );

  const { fromISO, toISO } = defaultFromTo(14);

  const employeeId = (req.query.employee_id || employees.rows[0]?.id || '').toString();
  const from = (req.query.from || fromISO).toString();
  const to = (req.query.to || toISO).toString();

  let rows = [];
  let employee = null;

  if (employeeId) {
    const emp = await q("SELECT id, display_name FROM employees WHERE id=$1 AND company_id=$2 LIMIT 1", [employeeId, companyId]);
    employee = emp.rows[0] || null;
    if (employee) rows = await getDailyBalance(companyId, employeeId, from, to);
  }

  const totals = rows.reduce((acc, r) => {
    if (r.worked_minutes !== null) {
      acc.worked += parseInt(r.worked_minutes, 10);
      acc.expected += parseInt(r.expected_minutes || 0, 10);
      acc.delta += parseInt(r.delta_minutes || 0, 10);
      acc.days += 1;
    }
    return acc;
  }, { worked: 0, expected: 0, delta: 0, days: 0 });

  res.render('app/balance', {
    title: "Balans · MyPunctoo",
    chrome: true,
    badge: req.session.user.company_name,
    topMeta: "Klant #" + req.session.user.company_number,
    logoutAction: "/logout",
    tabs: appTabs("bal"),
    employees: employees.rows,
    selectedEmployeeId: employeeId,
    selectedFrom: from,
    selectedTo: to,
    employee,
    rows,
    totals,
    mmToHHMM
  });
});

router.get('/app/balance.csv', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;

  const employeeId = (req.query.employee_id || '').toString();
  const from = (req.query.from || '').toString();
  const to = (req.query.to || '').toString();
  if (!employeeId || !from || !to) return res.redirect('/app/balance');

  const emp = await q("SELECT id, display_name FROM employees WHERE id=$1 AND company_id=$2 LIMIT 1", [employeeId, companyId]);
  const employee = emp.rows[0];
  if (!employee) return res.redirect('/app/balance');

  const rows = await getDailyBalance(companyId, employeeId, from, to);

  const header = ["date","expected_minutes","expected_source","first_in","last_out","worked_minutes","delta_minutes","status"];
  const lines = [header.join(",")];

  for (const r of rows) {
    lines.push([
      csvEscape(r.ref_date),
      csvEscape(r.expected_minutes),
      csvEscape(r.expected_source),
      csvEscape(r.first_in ? new Date(r.first_in).toISOString() : ""),
      csvEscape(r.last_out ? new Date(r.last_out).toISOString() : ""),
      csvEscape(r.worked_minutes ?? ""),
      csvEscape(r.delta_minutes ?? ""),
      csvEscape(r.status)
    ].join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="punctoo-balance-${employee.display_name}-${from}-to-${to}.csv"`);
  res.send(lines.join("\n"));
});

module.exports = router;
