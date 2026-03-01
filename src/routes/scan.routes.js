const express = require('express');
const router = express.Router();
const { q } = require('../db');

async function loadTag(tagCode) {
  const r = await q(
    `SELECT st.id AS scan_tag_id, st.tag_code, st.location_label, st.company_id, c.company_name
     FROM scan_tags st
     JOIN companies c ON c.id = st.company_id
     WHERE st.tag_code=$1 AND st.is_active=true AND c.is_active=true
     LIMIT 1`, [tagCode]
  );
  return r.rows[0] || null;
}

router.get('/s/:tagCode/:type(in|out)', async (req, res) => {
  const tag = await loadTag(req.params.tagCode);
  if (!tag) return res.status(404).render('scan/notfound');

  const employees = await q(
    `SELECT id, display_name, coupling_code
     FROM employees
     WHERE company_id=$1 AND status='active'
     ORDER BY display_name ASC`, [tag.company_id]
  );

  res.render('scan/scan', {
    tag,
    scanType: req.params.type.toUpperCase(),
    employees: employees.rows,
    error: null
  });
});

router.post('/s/:tagCode/:type(in|out)', async (req, res) => {
  const tag = await loadTag(req.params.tagCode);
  if (!tag) return res.status(404).render('scan/notfound');

  const scanType = req.params.type.toUpperCase();
  const coupling = (req.body.coupling_code || '').trim();

  const emp = await q(
    `SELECT id, display_name, coupling_code
     FROM employees
     WHERE company_id=$1 AND coupling_code=$2 AND status='active'
     LIMIT 1`, [tag.company_id, coupling]
  );
  if (!emp.rows.length) {
    const employees = await q(
      `SELECT id, display_name, coupling_code
       FROM employees
       WHERE company_id=$1 AND status='active'
       ORDER BY display_name ASC`, [tag.company_id]
    );
    return res.status(400).render('scan/scan', {
      tag,
      scanType,
      employees: employees.rows,
      error: 'Koppelcode niet gevonden. Controleer en probeer opnieuw.'
    });
  }

  const employee = emp.rows[0];

  // Insert immutable event
  await q(
    `INSERT INTO scan_events(company_id, employee_id, scan_tag_id, scan_type, ip_address, user_agent, device_hint, source, event_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'qr','temp')`,
    [
      tag.company_id,
      employee.id,
      tag.scan_tag_id,
      scanType,
      req.ip,
      req.get('user-agent') || null,
      req.get('sec-ch-ua') || null
    ]
  );

  res.render('scan/success', { tag, scanType, employee });
});

module.exports = router;
