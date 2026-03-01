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

async function renderEmployees(req, res, error) {
  const companyId = req.session.user.company_id;
  const employees = await q(
    "SELECT id, display_name, coupling_code, status, created_at FROM employees WHERE company_id=$1 ORDER BY created_at DESC",
    [companyId]
  );

  return res.render('app/employees', {
    title: "Werknemers · MyPunctoo",
    chrome: true,
    badge: req.session.user.company_name,
    topMeta: "Klant #" + req.session.user.company_number,
    logoutAction: "/logout",
    tabs: appTabs("emp"),
    employees: employees.rows,
    error: error || null
  });
}

router.get('/app/employees', requireUser, async (req, res) => {
  return renderEmployees(req, res, null);
});

router.post('/app/employees/add', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const name = (req.body.name || '').trim();
  const code = (req.body.coupling_code || '').trim();

  if (!name || !code) return renderEmployees(req, res, 'Naam en koppelcode zijn verplicht.');

  try {
    await q("INSERT INTO employees(company_id, display_name, coupling_code) VALUES ($1,$2,$3)", [companyId, name, code]);
    return res.redirect('/app/employees');
  } catch (e) {
    return renderEmployees(req, res, 'Koppelcode bestaat al.');
  }
});

router.post('/app/employees/:id/rename', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const id = req.params.id;
  const name = (req.body.display_name || '').trim();
  if (!name) return res.redirect('/app/employees');
  await q("UPDATE employees SET display_name=$1 WHERE id=$2 AND company_id=$3", [name, id, companyId]);
  res.redirect('/app/employees');
});

router.post('/app/employees/:id/toggle', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const id = req.params.id;
  await q("UPDATE employees SET status = CASE WHEN status='active' THEN 'inactive' ELSE 'active' END WHERE id=$1 AND company_id=$2", [id, companyId]);
  res.redirect('/app/employees');
});

module.exports = router;
