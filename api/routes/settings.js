const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../../db');
const { requireStaff, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ---------- GET all settings (public -- used to render contact info / map on the site) ----------
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM site_settings ORDER BY key');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ---------- UPDATE settings (admin only) ----------
router.put('/', requireAdmin, async (req, res) => {
  const updates = req.body; // { key: value, ... }
  try {
    const entries = Object.entries(updates);
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO site_settings (key, value, updated_by, updated_at) VALUES ($1,$2,$3,NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, value, req.staff.id]
      );
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ---------- CHANGE OWN PASSWORD (any logged-in staff) ----------
router.put('/account/password', requireStaff, async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const result = await pool.query('SELECT password FROM staff WHERE id = $1', [req.staff.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });

    const valid = await bcrypt.compare(current_password, result.rows[0].password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE staff SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, req.staff.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
