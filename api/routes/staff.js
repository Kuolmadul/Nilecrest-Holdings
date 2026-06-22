const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../../db');
const { requireStaff, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ---------- LIST all staff, grouped by department (admin sees all) ----------
router.get('/', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.name, s.email, s.phone, s.role, s.is_active, s.last_login, s.created_at,
              d.id AS department_id, d.name AS department_name, d.slug AS department_slug
       FROM staff s LEFT JOIN departments d ON d.id = s.department_id
       ORDER BY (s.role = 'admin') DESC, d.name, s.name`
    );
    res.json({ rows: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

// ---------- COUNT per department (for the "number of users per department" view) ----------
router.get('/summary', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.name AS department, COUNT(s.id) AS staff_count
       FROM departments d LEFT JOIN staff s ON s.department_id = d.id AND s.is_active = TRUE
       GROUP BY d.name ORDER BY d.name`
    );
    const adminCount = await pool.query(`SELECT COUNT(*) FROM staff WHERE role = 'admin' AND is_active = TRUE`);
    res.json({ departments: result.rows, admins: Number(adminCount.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch staff summary' });
  }
});

// ---------- DEPARTMENTS LIST (for dropdowns) ----------
router.get('/departments', requireStaff, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM departments ORDER BY name');
    res.json({ rows: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// ---------- CREATE staff (admin only -- only admin can add managers) ----------
router.post('/', requireAdmin, async (req, res) => {
  const { name, email, phone, password, role, department_id } = req.body;
  if (role === 'manager' && !department_id) {
    return res.status(400).json({ error: 'Managers must belong to a department' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO staff (name, email, phone, password, role, department_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, role, department_id`,
      [name, email, phone || null, hashed, role || 'manager', role === 'admin' ? null : department_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already in use' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create staff account' });
  }
});

// ---------- EDIT staff (admin only) ----------
router.put('/:id', requireAdmin, async (req, res) => {
  const { name, phone, role, department_id, is_active } = req.body;
  try {
    const result = await pool.query(
      `UPDATE staff SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        role = COALESCE($3, role),
        department_id = CASE WHEN $3 = 'admin' THEN NULL ELSE COALESCE($4, department_id) END,
        is_active = COALESCE($5, is_active),
        updated_at = NOW()
       WHERE id = $6 RETURNING id, name, email, role, department_id, is_active`,
      [name, phone, role, department_id, is_active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Staff member not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update staff account' });
  }
});

// ---------- DEACTIVATE staff (admin only, kept for audit instead of hard delete) ----------
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE staff SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, name, email`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Staff member not found' });
    res.json({ message: 'Staff account deactivated', staff: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deactivate staff account' });
  }
});

module.exports = router;
