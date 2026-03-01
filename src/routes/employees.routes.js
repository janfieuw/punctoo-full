const express = require('express');
const router = express.Router();
const { q } = require('../db');
const { requireUser } = require('../middleware/auth');

router.get('/app/employees', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const employees = await q(
    "SELECT id, display_name, coupling_code, status, created_at FROM employees WHERE company_id=$1 ORDER BY created_at DESC",
    [companyId]
  );
  res.render('app/employees', { employees: employees.rows, error: null });
});

router.post('/app/employees/add', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const name = (req.body.name || '').trim();
  const code = (req.body.coupling_code || '').trim();

  if (!name || !code) {
    const employees = await q("SELECT id, display_name, coupling_code, status, created_at FROM employees WHERE company_id=$1 ORDER BY created_at DESC", [companyId]);
    return res.render('app/employees', { employees: employees.rows, error: 'Naam en koppelcode zijn verplicht.' });
  }

  try {
    await q(
      "INSERT INTO employees(company_id, display_name, coupling_code) VALUES ($1,$2,$3)",
      [companyId, name, code]
    );
    res.redirect('/app/employees');
  } catch (e) {
    const employees = await q("SELECT id, display_name, coupling_code, status, created_at FROM employees WHERE company_id=$1 ORDER BY created_at DESC", [companyId]);
    return res.render('app/employees', { employees: employees.rows, error: 'Koppelcode bestaat al.' });
  }
});

router.post('/app/employees/:id/rename', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const id = req.params.id;
  const name = (req.body.display_name || '').trim();
  if (!name) return res.redirect('/app/employees');
  await q(
    "UPDATE employees SET display_name=$1 WHERE id=$2 AND company_id=$3",
    [name, id, companyId]
  );
  res.redirect('/app/employees');
});

router.post('/app/employees/:id/toggle', requireUser, async (req, res) => {
  const companyId = req.session.user.company_id;
  const id = req.params.id;
  await q(
    "UPDATE employees SET status = CASE WHEN status='active' THEN 'inactive' ELSE 'active' END WHERE id=$1 AND company_id=$2",
    [id, companyId]
  );
  res.redirect('/app/employees');
});

module.exports = router;
