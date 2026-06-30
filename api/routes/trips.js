const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// Shared overlap check used by both create and update -- returns the
// conflicting trip (with its trip_ref, for a useful error message) or null.
// excludeTripId lets editing an existing trip skip flagging itself.
async function checkConflict(column, value, departureTime, arrivalTime, excludeTripId) {
  const params = [value, arrivalTime || departureTime, departureTime];
  let query = `
    SELECT trip_ref FROM trips
    WHERE is_deleted = FALSE AND ${column} = $1
      AND status IN ('Scheduled','In Progress')
      AND departure_time < $2 AND COALESCE(arrival_time, departure_time) > $3`;
  if (excludeTripId) {
    params.push(excludeTripId);
    query += ` AND id != $${params.length}`;
  }
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

// ---------- LIST ----------
// GET /api/trips?page=1&limit=10&status=Scheduled
router.get('/', requireStaff, async (req, res) => {
  const { page = 1, limit = 10, status = '', trip_type = '' } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = ['t.is_deleted = FALSE'];
  const params = [];

  if (status) { params.push(status); conditions.push(`t.status = $${params.length}`); }
  if (trip_type) { params.push(trip_type); conditions.push(`t.trip_type = $${params.length}`); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM trips t ${where}`, params);
    params.push(limit, offset);
    const rowsRes = await pool.query(
      `SELECT t.*, f.reg_number AS vehicle_reg_num, f.make_model AS vehicle_model,
              f.specs->>'seating_capacity' AS seating_capacity,
              d.full_name AS driver_name, d.phone AS driver_phone
       FROM trips t
       LEFT JOIN fleet f ON f.id = t.fleet_id
       LEFT JOIN drivers d ON d.id = t.driver_id
       ${where}
       ORDER BY t.departure_time ASC NULLS LAST, t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total: Number(countRes.rows[0].count), rows: rowsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// ---------- SUMMARY ----------
router.get('/summary', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) FROM trips WHERE is_deleted = FALSE GROUP BY status`
    );
    const summary = { Scheduled: 0, 'In Progress': 0, Completed: 0, Cancelled: 0 };
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
      `SELECT t.*, f.reg_number AS vehicle_reg_num, f.make_model AS vehicle_model,
              d.full_name AS driver_name, d.phone AS driver_phone
       FROM trips t
       LEFT JOIN fleet f ON f.id = t.fleet_id
       LEFT JOIN drivers d ON d.id = t.driver_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Trip not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trip' });
  }
});

// ---------- CREATE ----------
router.post('/', requireStaff, async (req, res) => {
  const {
    client_id, client_name, fleet_id, vehicle_reg, driver_id, assigned_driver,
    route, origin, destination, departure_time, arrival_time,
    passenger_count = 0, trip_type = 'one_off', status = 'Scheduled',
    notes, quote_id, invoice_id
  } = req.body;

  if (!client_name || !route) {
    return res.status(400).json({ error: 'client_name and route are required' });
  }

  try {
    // Server-side double-booking guard -- the admin UI only shows available
    // drivers/vehicles in the dropdown, but this check is what actually
    // prevents two staff members racing to book the same one simultaneously.
    if (fleet_id && departure_time) {
      const conflict = await checkConflict('fleet_id', fleet_id, departure_time, arrival_time, null);
      if (conflict) return res.status(409).json({ error: `That vehicle is already booked on trip ${conflict.trip_ref} during this time window.` });
    }
    if (driver_id && departure_time) {
      const conflict = await checkConflict('driver_id', driver_id, departure_time, arrival_time, null);
      if (conflict) return res.status(409).json({ error: `That driver is already assigned to trip ${conflict.trip_ref} during this time window.` });
    }

    const refRes = await pool.query('SELECT next_trip_ref() AS ref');
    const trip_ref = refRes.rows[0].ref;

    const result = await pool.query(
      `INSERT INTO trips
        (trip_ref, client_id, client_name, fleet_id, vehicle_reg, driver_id, assigned_driver,
         route, origin, destination, departure_time, arrival_time,
         passenger_count, trip_type, status, notes, quote_id, invoice_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [trip_ref, client_id || null, client_name, fleet_id || null, vehicle_reg || null,
       driver_id || null, assigned_driver || null, route, origin || null, destination || null,
       departure_time || null, arrival_time || null,
       passenger_count, trip_type, status, notes || null,
       quote_id || null, invoice_id || null, req.staff.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

// ---------- UPDATE ----------
router.put('/:id', requireStaff, async (req, res) => {
  const {
    client_id, client_name, fleet_id, vehicle_reg, driver_id, assigned_driver,
    route, origin, destination, departure_time, arrival_time,
    passenger_count, trip_type, status, notes, quote_id, invoice_id
  } = req.body;

  try {
    if (fleet_id && departure_time) {
      const conflict = await checkConflict('fleet_id', fleet_id, departure_time, arrival_time, req.params.id);
      if (conflict) return res.status(409).json({ error: `That vehicle is already booked on trip ${conflict.trip_ref} during this time window.` });
    }
    if (driver_id && departure_time) {
      const conflict = await checkConflict('driver_id', driver_id, departure_time, arrival_time, req.params.id);
      if (conflict) return res.status(409).json({ error: `That driver is already assigned to trip ${conflict.trip_ref} during this time window.` });
    }

    const result = await pool.query(
      `UPDATE trips SET
        client_id=$1, client_name=$2, fleet_id=$3, vehicle_reg=$4, driver_id=$5, assigned_driver=$6,
        route=$7, origin=$8, destination=$9, departure_time=$10, arrival_time=$11,
        passenger_count=$12, trip_type=$13, status=$14, notes=$15,
        quote_id=$16, invoice_id=$17, updated_at=NOW()
       WHERE id=$18 AND is_deleted=FALSE RETURNING *`,
      [client_id || null, client_name, fleet_id || null, vehicle_reg || null,
       driver_id || null, assigned_driver || null, route, origin || null, destination || null,
       departure_time || null, arrival_time || null,
       passenger_count || 0, trip_type, status, notes || null,
       quote_id || null, invoice_id || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Trip not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// ---------- SOFT DELETE ----------
router.delete('/:id', requireStaff, async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'A reason is required' });
  try {
    const result = await pool.query(
      `UPDATE trips SET is_deleted=TRUE, deleted_at=NOW(), deleted_reason=$1, updated_at=NOW()
       WHERE id=$2 AND is_deleted=FALSE RETURNING id`,
      [reason, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Trip not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

module.exports = router;
