const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// ---------- LIST by vehicle ----------
// GET /api/fuel?fleet_id=3&limit=20&page=1
router.get('/', requireStaff, async (req, res) => {
  const { fleet_id = '', page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = [];
  const params = [];

  if (fleet_id) { params.push(fleet_id); conditions.push(`fl.fleet_id = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM fuel_log fl ${where}`, params);
    params.push(limit, offset);
    const rowsRes = await pool.query(
      `SELECT fl.*, f.reg_number, f.vehicle_type
       FROM fuel_log fl
       LEFT JOIN fleet f ON f.id = fl.fleet_id
       ${where}
       ORDER BY fl.log_date DESC, fl.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total: Number(countRes.rows[0].count), rows: rowsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch fuel log' });
  }
});

// ---------- CREATE ----------
router.post('/', requireStaff, async (req, res) => {
  const { fleet_id, log_date, litres, cost_kes, odometer_km, fuel_hours, filled_by, station, notes } = req.body;
  if (!fleet_id || !litres) return res.status(400).json({ error: 'fleet_id and litres are required' });
  try {
    const result = await pool.query(
      `INSERT INTO fuel_log (fleet_id, log_date, litres, cost_kes, odometer_km, fuel_hours, filled_by, station, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [fleet_id, log_date || null, litres, cost_kes || null, odometer_km || null,
       fuel_hours || null, filled_by || null, station || null, notes || null, req.staff.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log fuel' });
  }
});

// ---------- DELETE ----------
router.delete('/:id', requireStaff, async (req, res) => {
  try {
    await pool.query('DELETE FROM fuel_log WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete fuel entry' });
  }
});

module.exports = router;
