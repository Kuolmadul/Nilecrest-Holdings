const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../../db');
require('dotenv').config();

const router = express.Router();
const SIGN_OPTS = { expiresIn: process.env.JWT_EXPIRES_IN || '7d' };

router.post('/staff/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT s.*, d.name AS department_name, d.slug AS department_slug
       FROM staff s LEFT JOIN departments d ON d.id = s.department_id
       WHERE s.email = $1 AND s.is_active = TRUE`,
      [email]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Account not found' });

    const staff = result.rows[0];
    const valid = await bcrypt.compare(password, staff.password);
    if (!valid) return res.status(400).json({ error: 'Invalid password' });

    await pool.query('UPDATE staff SET last_login = NOW() WHERE id = $1', [staff.id]);

    const token = jwt.sign(
      { type: 'staff', id: staff.id, role: staff.role, department_id: staff.department_id },
      process.env.JWT_SECRET,
      SIGN_OPTS
    );

    res.json({
      token,
      staff: {
        id: staff.id, name: staff.name, email: staff.email, role: staff.role,
        department: staff.department_name, department_slug: staff.department_slug,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login error' });
  }
});

router.post('/client/register', async (req, res) => {
  const { name, company, email, phone, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO clients (name, company, email, phone, password)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email`,
      [name, company || null, email, phone || null, hashed]
    );
    const client = result.rows[0];
    const token = jwt.sign({ type: 'client', id: client.id }, process.env.JWT_SECRET, SIGN_OPTS);
    res.json({ token, client });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Registration error' });
  }
});

router.post('/client/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM clients WHERE email = $1 AND is_active = TRUE', [email]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Account not found' });

    const client = result.rows[0];
    const valid = await bcrypt.compare(password, client.password);
    if (!valid) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ type: 'client', id: client.id }, process.env.JWT_SECRET, SIGN_OPTS);
    res.json({ token, client: { id: client.id, name: client.name, email: client.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login error' });
  }
});

module.exports = router;
