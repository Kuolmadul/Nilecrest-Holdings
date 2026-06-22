const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireStaff, async (req, res) => {
  const { q = '' } = req.query;
  const conditions = [];
  const params = [];
  if (q) { params.push(`${q}%`); conditions.push(`(name ILIKE $1 OR company ILIKE $1 OR email ILIKE $1)`); }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.company, c.email, c.phone, c.is_active, c.created_at,
              COUNT(DISTINCT p.id) AS project_count, COUNT(DISTINCT q.id) AS quote_count
       FROM clients c
       LEFT JOIN projects p ON p.client_id = c.id AND p.is_deleted = FALSE
       LEFT JOIN quotes q ON q.client_id = c.id AND q.is_deleted = FALSE
       ${whereClause}
       GROUP BY c.id ORDER BY c.created_at DESC`,
      params
    );
    res.json({ rows: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

router.get('/:id', requireStaff, async (req, res) => {
  try {
    const client = await pool.query('SELECT id, name, company, email, phone, is_active, created_at FROM clients WHERE id = $1', [req.params.id]);
    if (client.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    const projects = await pool.query('SELECT * FROM projects WHERE client_id = $1 AND is_deleted = FALSE', [req.params.id]);
    const quotes = await pool.query('SELECT * FROM quotes WHERE client_id = $1 AND is_deleted = FALSE', [req.params.id]);

    res.json({ client: client.rows[0], projects: projects.rows, quotes: quotes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

module.exports = router;
