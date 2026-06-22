const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// ---------- LIST (paginated for "load more") ----------
// GET /api/fleet?page=1&limit=6&status=Active&type=Truck
router.get('/', requireStaff, async (req, res) => {
  const { page = 1, limit = 6, status = '', type = '' } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const conditions = ['is_deleted = FALSE'];
  const params = [];
  // Managers only see their own department's fleet; admin sees everything.
  if (req.staff.role !== 'admin' && req.staff.department_id) {
    params.push(req.staff.department_id);
    conditions.push(`department_id = $${params.length}`);
  }
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`vehicle_type = $${params.length}`); }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM fleet ${whereClause}`, params);
    params.push(limit, offset);
    const rowsResult = await pool.query(
      `SELECT * FROM fleet ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total: Number(countResult.rows[0].count), rows: rowsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch fleet' });
  }
});

// ---------- REAL-TIME STATUS COUNTS ----------
router.get('/summary', requireStaff, async (req, res) => {
  try {
    const conditions = ['is_deleted = FALSE'];
    const params = [];
    if (req.staff.role !== 'admin' && req.staff.department_id) {
      params.push(req.staff.department_id);
      conditions.push(`department_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT status, COUNT(*) FROM fleet WHERE ${conditions.join(' AND ')} GROUP BY status`,
      params
    );
    const summary = { active: 0, maintenance: 0, standby: 0, out_of_service: 0 };
    result.rows.forEach(r => { summary[r.status] = Number(r.count); });
    summary.total = summary.active + summary.maintenance + summary.standby + summary.out_of_service;
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch fleet summary' });
  }
});

// ---------- PUBLIC: same counts as the admin summary, no auth ----------
// This keeps the public Fleet page stat cards identical to what staff see on the dashboard.
router.get('/summary-public', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) FROM fleet WHERE is_deleted = FALSE GROUP BY status`
    );
    const summary = { active: 0, maintenance: 0, standby: 0, out_of_service: 0 };
    result.rows.forEach(r => { summary[r.status] = Number(r.count); });
    summary.total = summary.active + summary.maintenance + summary.standby + summary.out_of_service;
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch fleet summary' });
  }
});

// ---------- PUBLIC: list vehicles, sensitive fields stripped ----------
// No driver names, exact location, or internal notes -- just type, department, and status.
// Backed by the same `fleet` table as the admin view, so counts always match.
router.get('/public', async (req, res) => {
  const { page = 1, limit = 6, status = '' } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const conditions = ['f.is_deleted = FALSE'];
  const params = [];
  if (status) { params.push(status); conditions.push(`f.status = $${params.length}`); }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM fleet f ${whereClause}`, params);
    params.push(limit, offset);
    const rowsResult = await pool.query(
      `SELECT f.id, f.vehicle_type, f.status, d.name AS department_name
       FROM fleet f LEFT JOIN departments d ON d.id = f.department_id
       ${whereClause} ORDER BY f.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total: Number(countResult.rows[0].count), rows: rowsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch fleet' });
  }
});

// ---------- VIEW single vehicle + history ----------
router.get('/:id', requireStaff, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fleet WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    const history = await pool.query(
      `SELECT fh.*, s.name AS changed_by_name FROM fleet_history fh
       LEFT JOIN staff s ON s.id = fh.changed_by
       WHERE fh.fleet_id = $1 ORDER BY fh.created_at DESC`,
      [req.params.id]
    );
    res.json({ vehicle: result.rows[0], history: history.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vehicle' });
  }
});

// ---------- CREATE ----------
router.post('/', requireStaff, async (req, res) => {
  const { reg_number, vehicle_type, make_model, assigned_driver, status, current_location, notes, specs } = req.body;
  // Managers create vehicles in their own department only; admin can specify any department.
  const department_id = req.staff.role === 'admin' ? (req.body.department_id || null) : req.staff.department_id;
  try {
    const result = await pool.query(
      `INSERT INTO fleet (reg_number, vehicle_type, make_model, department_id, assigned_driver, status, current_location, notes, specs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [reg_number, vehicle_type, make_model, department_id, assigned_driver || null, status || 'standby', current_location || null, notes || null, JSON.stringify(specs || {})]
    );
    await pool.query(
      `INSERT INTO fleet_history (fleet_id, action, changed_by, snapshot) VALUES ($1,'created',$2,$3)`,
      [result.rows[0].id, req.staff.id, JSON.stringify(result.rows[0])]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Registration number already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

// ---------- EDIT (reason required) ----------
router.put('/:id', requireStaff, async (req, res) => {
  const { vehicle_type, make_model, assigned_driver, status, current_location, notes, specs, reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to edit a vehicle record' });

  try {
    // Managers can only edit vehicles belonging to their department
    const current = await pool.query('SELECT department_id FROM fleet WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Vehicle not found' });
    if (req.staff.role !== 'admin' && req.staff.department_id && current.rows[0].department_id !== req.staff.department_id) {
      return res.status(403).json({ error: 'You can only edit vehicles in your own department.' });
    }

    const result = await pool.query(
      `UPDATE fleet SET
        vehicle_type = COALESCE($1, vehicle_type),
        make_model = COALESCE($2, make_model),
        assigned_driver = COALESCE($3, assigned_driver),
        status = COALESCE($4, status),
        current_location = COALESCE($5, current_location),
        notes = COALESCE($6, notes),
        specs = COALESCE($7, specs),
        updated_at = NOW()
       WHERE id = $8 AND is_deleted = FALSE RETURNING *`,
      [vehicle_type, make_model, assigned_driver, status, current_location, notes, specs ? JSON.stringify(specs) : null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    await pool.query(
      `INSERT INTO fleet_history (fleet_id, action, reason, changed_by, snapshot) VALUES ($1,'updated',$2,$3,$4)`,
      [req.params.id, reason, req.staff.id, JSON.stringify(result.rows[0])]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

// ---------- SOFT DELETE (reason required) ----------
router.delete('/:id', requireStaff, async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to remove a vehicle' });

  try {
    // Managers can only remove vehicles belonging to their department
    const current = await pool.query('SELECT department_id FROM fleet WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Vehicle not found' });
    if (req.staff.role !== 'admin' && req.staff.department_id && current.rows[0].department_id !== req.staff.department_id) {
      return res.status(403).json({ error: 'You can only remove vehicles in your own department.' });
    }

    const result = await pool.query(
      `UPDATE fleet SET is_deleted = TRUE, deleted_at = NOW(), deleted_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    await pool.query(
      `INSERT INTO fleet_history (fleet_id, action, reason, changed_by, snapshot) VALUES ($1,'deleted',$2,$3,$4)`,
      [req.params.id, reason, req.staff.id, JSON.stringify(result.rows[0])]
    );

    res.json({ message: 'Vehicle removed (soft delete -- record retained)', vehicle: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove vehicle' });
  }
});

module.exports = router;
