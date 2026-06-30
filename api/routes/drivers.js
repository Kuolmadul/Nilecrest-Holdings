const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// ---------- STAFF: list drivers ----------
// GET /api/drivers?status=active
router.get('/', requireStaff, async (req, res) => {
  const { status = '' } = req.query;
  const conditions = ['is_deleted = FALSE'];
  const params = [];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  try {
    const result = await pool.query(
      `SELECT * FROM drivers WHERE ${conditions.join(' AND ')} ORDER BY full_name ASC`,
      params
    );
    res.json({ rows: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// ---------- STAFF: drivers available for a given trip time window ----------
// GET /api/drivers/available?departure_time=...&arrival_time=...&exclude_trip_id=5
// Excludes drivers already assigned to another trip (Scheduled or In Progress)
// whose time window overlaps the requested one. exclude_trip_id lets editing
// an existing trip not flag itself as a conflict.
router.get('/available', requireStaff, async (req, res) => {
  const { departure_time, arrival_time, exclude_trip_id } = req.query;
  try {
    let busyQuery = `
      SELECT DISTINCT driver_id FROM trips
      WHERE is_deleted = FALSE AND driver_id IS NOT NULL
        AND status IN ('Scheduled','In Progress')`;
    const params = [];

    if (departure_time && arrival_time) {
      // Overlap check: existing trip's window intersects the requested window.
      params.push(arrival_time, departure_time);
      busyQuery += ` AND departure_time < $1 AND COALESCE(arrival_time, departure_time) > $2`;
    }
    if (exclude_trip_id) {
      params.push(exclude_trip_id);
      busyQuery += ` AND id != $${params.length}`;
    }

    const busyResult = await pool.query(busyQuery, params);
    const busyIds = busyResult.rows.map(r => r.driver_id);

    const driversResult = busyIds.length
      ? await pool.query(
          `SELECT * FROM drivers WHERE is_deleted = FALSE AND status = 'active' AND id != ALL($1) ORDER BY full_name ASC`,
          [busyIds]
        )
      : await pool.query(`SELECT * FROM drivers WHERE is_deleted = FALSE AND status = 'active' ORDER BY full_name ASC`);

    res.json({ rows: driversResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch available drivers' });
  }
});

// ---------- STAFF: view single driver ----------
router.get('/:id', requireStaff, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Driver not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch driver' });
  }
});

// ---------- STAFF: update driver (license, phone, status) ----------
router.put('/:id', requireStaff, async (req, res) => {
  const { phone, email, license_number, status, notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE drivers SET
        phone = COALESCE($1, phone),
        email = COALESCE($2, email),
        license_number = COALESCE($3, license_number),
        status = COALESCE($4, status),
        notes = COALESCE($5, notes),
        updated_at = NOW()
       WHERE id = $6 AND is_deleted = FALSE RETURNING *`,
      [phone, email, license_number, status, notes, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Driver not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update driver' });
  }
});

// ---------- STAFF: soft delete (with required reason) ----------
router.delete('/:id', requireStaff, async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to remove a driver' });
  try {
    const result = await pool.query(
      `UPDATE drivers SET is_deleted = TRUE, deleted_at = NOW(), deleted_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Driver not found' });
    res.json({ message: 'Driver removed', driver: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove driver' });
  }
});

module.exports = router;
