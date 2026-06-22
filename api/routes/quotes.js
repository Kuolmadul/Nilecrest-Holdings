const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// ---------- PUBLIC: submit a quote request from the website ----------
// No auth -- anyone can request a quote. Always lands as Pending for staff to triage.
router.post('/public', async (req, res) => {
  const { client_name, client_email, client_phone, company, service_type, description, origin, destination } = req.body;

  if (!client_name || !client_email || !service_type) {
    return res.status(400).json({ error: 'Name, email, and service type are required' });
  }

  try {
    const seq = await pool.query("SELECT nextval('quote_ref_seq') AS n");
    const ref = `QT-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(3, '0')}`;

    const result = await pool.query(
      `INSERT INTO quotes (ref_number, client_name, client_email, client_phone, company, service_type, description, origin, destination, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pending') RETURNING *`,
      [ref, client_name, client_email, client_phone || null, company || null, service_type, description || null, origin || null, destination || null]
    );

    await pool.query(
      `INSERT INTO quote_history (quote_id, action, snapshot) VALUES ($1,'created',$2)`,
      [result.rows[0].id, JSON.stringify(result.rows[0])]
    );

    res.status(201).json({ ref_number: ref, message: 'Quote request submitted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit quote request' });
  }
});

// ---------- LIST + LIVE SEARCH + FILTER ----------
// GET /api/quotes?q=ken&status=Pending&service=Logistics&page=1&limit=10
router.get('/', requireStaff, async (req, res) => {
  const { q = '', status = '', service = '', page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const conditions = ['is_deleted = FALSE'];
  const params = [];

  if (q) {
    params.push(`${q}%`); // prefix match -- "same first characters as it continues to align"
    conditions.push(`(client_name ILIKE $${params.length} OR company ILIKE $${params.length} OR ref_number ILIKE $${params.length})`);
  }
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (service) { params.push(service); conditions.push(`service_type = $${params.length}`); }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM quotes ${whereClause}`, params);
    params.push(limit, offset);
    const rowsResult = await pool.query(
      `SELECT * FROM quotes ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total: Number(countResult.rows[0].count), rows: rowsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// ---------- LIVE AUTOCOMPLETE SUGGESTIONS ----------
// GET /api/quotes/suggest?q=ke  -> matching client names / companies / ref numbers, prefix-matched
router.get('/suggest', requireStaff, async (req, res) => {
  const { q = '' } = req.query;
  if (!q) return res.json({ suggestions: [] });
  try {
    const result = await pool.query(
      `SELECT id, ref_number, client_name, company, service_type, status
       FROM quotes
       WHERE is_deleted = FALSE AND (client_name ILIKE $1 OR company ILIKE $1 OR ref_number ILIKE $1)
       ORDER BY created_at DESC LIMIT 8`,
      [`${q}%`]
    );
    res.json({ suggestions: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Suggest failed' });
  }
});

// ---------- SUMMARY COUNTS (for stat pills, real-time) ----------
router.get('/summary', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) FROM quotes WHERE is_deleted = FALSE GROUP BY status`
    );
    const summary = { Pending: 0, 'In Review': 0, Won: 0, Lost: 0 };
    result.rows.forEach(r => { summary[r.status] = Number(r.count); });
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ---------- VIEW single quote, full detail ----------
router.get('/:id', requireStaff, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM quotes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });

    const history = await pool.query(
      `SELECT qh.*, s.name AS changed_by_name FROM quote_history qh
       LEFT JOIN staff s ON s.id = qh.changed_by
       WHERE qh.quote_id = $1 ORDER BY qh.created_at DESC`,
      [req.params.id]
    );
    res.json({ quote: result.rows[0], history: history.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// ---------- CREATE ----------
router.post('/', requireStaff, async (req, res) => {
  const { client_name, client_email, client_phone, company, service_type, description, origin, destination, estimated_value, status } = req.body;
  try {
    const seq = await pool.query("SELECT nextval('quote_ref_seq') AS n");
    const ref = `QT-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(3, '0')}`;

    const result = await pool.query(
      `INSERT INTO quotes (ref_number, client_name, client_email, client_phone, company, service_type, description, origin, destination, estimated_value, status, handled_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [ref, client_name, client_email, client_phone || null, company || null, service_type, description || null, origin || null, destination || null, estimated_value || null, status || 'Pending', req.staff.id]
    );

    await pool.query(
      `INSERT INTO quote_history (quote_id, action, changed_by, snapshot) VALUES ($1,'created',$2,$3)`,
      [result.rows[0].id, req.staff.id, JSON.stringify(result.rows[0])]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

// ---------- EDIT ----------
router.put('/:id', requireStaff, async (req, res) => {
  const { client_name, client_email, client_phone, company, service_type, description, origin, destination, estimated_value, status, reason } = req.body;
  try {
    const result = await pool.query(
      `UPDATE quotes SET
        client_name = COALESCE($1, client_name),
        client_email = COALESCE($2, client_email),
        client_phone = COALESCE($3, client_phone),
        company = COALESCE($4, company),
        service_type = COALESCE($5, service_type),
        description = COALESCE($6, description),
        origin = COALESCE($7, origin),
        destination = COALESCE($8, destination),
        estimated_value = COALESCE($9, estimated_value),
        status = COALESCE($10, status),
        updated_at = NOW()
       WHERE id = $11 AND is_deleted = FALSE RETURNING *`,
      [client_name, client_email, client_phone, company, service_type, description, origin, destination, estimated_value, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });

    await pool.query(
      `INSERT INTO quote_history (quote_id, action, reason, changed_by, snapshot) VALUES ($1,'updated',$2,$3,$4)`,
      [req.params.id, reason || null, req.staff.id, JSON.stringify(result.rows[0])]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update quote' });
  }
});

// ---------- SOFT DELETE (with required reason) ----------
router.delete('/:id', requireStaff, async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to delete a quote' });

  try {
    const result = await pool.query(
      `UPDATE quotes SET is_deleted = TRUE, deleted_at = NOW(), deleted_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });

    await pool.query(
      `INSERT INTO quote_history (quote_id, action, reason, changed_by, snapshot) VALUES ($1,'deleted',$2,$3,$4)`,
      [req.params.id, reason, req.staff.id, JSON.stringify(result.rows[0])]
    );

    res.json({ message: 'Quote deleted (soft delete -- record retained)', quote: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});

module.exports = router;
