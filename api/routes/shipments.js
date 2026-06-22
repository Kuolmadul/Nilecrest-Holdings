const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// ---------- LIST ----------
// GET /api/shipments?page=1&limit=10&status=In+Transit&client_id=
router.get('/', requireStaff, async (req, res) => {
  const { page = 1, limit = 10, status = '', client_id = '' } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = ['s.is_deleted = FALSE'];
  const params = [];

  // Logistics managers see only logistics; admin sees all
  if (req.staff.role !== 'admin') {
    // shipments are always logistics -- managers of other depts can't see them
    // (optional: adjust if you want cross-dept access)
  }

  if (status) { params.push(status); conditions.push(`s.status = $${params.length}`); }
  if (client_id) { params.push(client_id); conditions.push(`s.client_id = $${params.length}`); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM shipments s ${where}`, params);
    params.push(limit, offset);
    const rowsRes = await pool.query(
      `SELECT s.*, f.reg_number AS truck_reg, f.make_model AS truck_model
       FROM shipments s
       LEFT JOIN fleet f ON f.id = s.fleet_id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total: Number(countRes.rows[0].count), rows: rowsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
});

// ---------- SUMMARY ----------
router.get('/summary', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) FROM shipments WHERE is_deleted = FALSE GROUP BY status`
    );
    const summary = { Pending: 0, Loading: 0, 'In Transit': 0, 'At Border': 0, Delivered: 0, Cancelled: 0 };
    result.rows.forEach(r => { summary[r.status] = Number(r.count); });
    summary.total = Object.values(summary).reduce((a, b) => a + b, 0);
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ---------- SINGLE ----------
router.get('/:id', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, f.reg_number AS truck_reg, f.make_model AS truck_model,
              f.vehicle_type AS truck_type
       FROM shipments s
       LEFT JOIN fleet f ON f.id = s.fleet_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Shipment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch shipment' });
  }
});

// ---------- CREATE ----------
router.post('/', requireStaff, async (req, res) => {
  const {
    client_id, client_name, origin, destination, cargo_type, weight_tons, volume_cbm,
    fleet_id, assigned_driver, departure_date, expected_delivery,
    status = 'Pending', border_clearance = false, notes, quote_id, invoice_id
  } = req.body;

  if (!client_name || !origin || !destination) {
    return res.status(400).json({ error: 'client_name, origin, and destination are required' });
  }

  try {
    const refRes = await pool.query('SELECT next_shipment_ref() AS ref');
    const shipment_ref = refRes.rows[0].ref;

    const result = await pool.query(
      `INSERT INTO shipments
        (shipment_ref, client_id, client_name, origin, destination, cargo_type,
         weight_tons, volume_cbm, fleet_id, assigned_driver, departure_date,
         expected_delivery, status, border_clearance, notes, quote_id, invoice_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [shipment_ref, client_id || null, client_name, origin, destination, cargo_type || null,
       weight_tons || null, volume_cbm || null, fleet_id || null, assigned_driver || null,
       departure_date || null, expected_delivery || null, status, border_clearance,
       notes || null, quote_id || null, invoice_id || null, req.staff.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create shipment' });
  }
});

// ---------- UPDATE ----------
router.put('/:id', requireStaff, async (req, res) => {
  const {
    client_id, client_name, origin, destination, cargo_type, weight_tons, volume_cbm,
    fleet_id, assigned_driver, departure_date, expected_delivery, actual_delivery,
    status, border_clearance, proof_of_delivery, notes, quote_id, invoice_id
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE shipments SET
        client_id=$1, client_name=$2, origin=$3, destination=$4, cargo_type=$5,
        weight_tons=$6, volume_cbm=$7, fleet_id=$8, assigned_driver=$9,
        departure_date=$10, expected_delivery=$11, actual_delivery=$12,
        status=$13, border_clearance=$14, proof_of_delivery=$15, notes=$16,
        quote_id=$17, invoice_id=$18, updated_at=NOW()
       WHERE id=$19 AND is_deleted=FALSE RETURNING *`,
      [client_id || null, client_name, origin, destination, cargo_type || null,
       weight_tons || null, volume_cbm || null, fleet_id || null, assigned_driver || null,
       departure_date || null, expected_delivery || null, actual_delivery || null,
       status, border_clearance, proof_of_delivery || null, notes || null,
       quote_id || null, invoice_id || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Shipment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update shipment' });
  }
});

// ---------- SOFT DELETE ----------
router.delete('/:id', requireStaff, async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'A reason is required' });
  try {
    const result = await pool.query(
      `UPDATE shipments SET is_deleted=TRUE, deleted_at=NOW(), deleted_reason=$1, updated_at=NOW()
       WHERE id=$2 AND is_deleted=FALSE RETURNING id`,
      [reason, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Shipment not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete shipment' });
  }
});

module.exports = router;
