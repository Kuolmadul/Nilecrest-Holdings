const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// ---------- PUBLIC: submit contact form ----------
router.post('/', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message are required' });
  try {
    const result = await pool.query(
      `INSERT INTO enquiries (name, email, phone, subject, message) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, email, phone || null, subject || null, message]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit enquiry' });
  }
});

// ---------- STAFF: list enquiries ----------
router.get('/', requireStaff, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM enquiries WHERE is_deleted = FALSE ORDER BY created_at DESC');
    res.json({ rows: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch enquiries' });
  }
});

router.put('/:id/read', requireStaff, async (req, res) => {
  try {
    const result = await pool.query('UPDATE enquiries SET is_read = TRUE WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Enquiry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update enquiry' });
  }
});

module.exports = router;
