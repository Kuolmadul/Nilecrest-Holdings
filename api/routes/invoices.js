const express = require('express');
const pool = require('../../db');
const { requireStaff, canAccessSlug } = require('../middleware/auth');

const router = express.Router();

// Maps department_slug -> service_type for scoping invoices via their linked quote
const SLUG_TO_SERVICE = {
  logistics:      'Logistics',
  transportation: 'Transport',
  construction:   'Construction',
};

router.get('/', requireStaff, async (req, res) => {
  const { page = 1, limit = 10, status = '' } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const conditions = ['i.is_deleted = FALSE'];
  const params = [];

  // Managers only see invoices that belong to their department (via the linked quote)
  if (req.staff.role !== 'admin' && req.staff.department_slug) {
    const svc = SLUG_TO_SERVICE[req.staff.department_slug];
    if (svc) {
      params.push(svc);
      conditions.push(`(q.service_type = $${params.length} OR i.quote_id IS NULL)`);
    }
  }

  if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM invoices i LEFT JOIN quotes q ON q.id = i.quote_id ${whereClause}`, params
    );
    params.push(limit, offset);
    const rowsResult = await pool.query(
      `SELECT i.* FROM invoices i LEFT JOIN quotes q ON q.id = i.quote_id
       ${whereClause} ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total: Number(countResult.rows[0].count), rows: rowsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.get('/summary', requireStaff, async (req, res) => {
  try {
    const conditions = ['i.is_deleted = FALSE'];
    const params = [];
    if (req.staff.role !== 'admin' && req.staff.department_slug) {
      const svc = SLUG_TO_SERVICE[req.staff.department_slug];
      if (svc) {
        params.push(svc);
        conditions.push(`(q.service_type = $${params.length} OR i.quote_id IS NULL)`);
      }
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await pool.query(
      `SELECT i.status, COUNT(*), COALESCE(SUM(i.amount),0) AS total
       FROM invoices i LEFT JOIN quotes q ON q.id = i.quote_id
       ${where} GROUP BY i.status`,
      params
    );
    const summary = { Unpaid: 0, Partial: 0, Paid: 0, Overdue: 0, total_value: 0 };
    result.rows.forEach(r => {
      summary[r.status] = Number(r.count);
      summary.total_value += Number(r.total);
    });
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch invoice summary' });
  }
});

router.get('/:id', requireStaff, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

router.post('/', requireStaff, async (req, res) => {
  const { quote_id, client_id, client_name, amount, due_date, status } = req.body;
  try {
    const countResult = await pool.query('SELECT COUNT(*) FROM invoices');
    const num = `INV-${new Date().getFullYear()}-${String(Number(countResult.rows[0].count) + 1).padStart(3, '0')}`;
    const result = await pool.query(
      `INSERT INTO invoices (invoice_number, quote_id, client_id, client_name, amount, due_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [num, quote_id || null, client_id || null, client_name, amount, due_date || null, status || 'Unpaid']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

router.put('/:id', requireStaff, async (req, res) => {
  const { amount_paid, status, due_date } = req.body;
  try {
    // Managers can only edit invoices linked to their department's service type
    const ownership = await pool.query(
      `SELECT q.service_type FROM invoices i
       LEFT JOIN quotes q ON q.id = i.quote_id
       WHERE i.id = $1 AND i.is_deleted = FALSE`,
      [req.params.id]
    );
    if (!ownership.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    if (req.staff.role !== 'admin' && ownership.rows[0].service_type) {
      const svc = SLUG_TO_SERVICE[req.staff.department_slug];
      if (svc && svc !== ownership.rows[0].service_type) {
        return res.status(403).json({ error: 'You can only edit invoices in your own department.' });
      }
    }

    const result = await pool.query(
      `UPDATE invoices SET
        amount_paid = COALESCE($1, amount_paid),
        status = COALESCE($2, status),
        due_date = COALESCE($3, due_date),
        updated_at = NOW()
       WHERE id = $4 AND is_deleted = FALSE RETURNING *`,
      [amount_paid, status, due_date, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

router.delete('/:id', requireStaff, async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to delete an invoice' });
  try {
    const ownership = await pool.query(
      `SELECT q.service_type FROM invoices i
       LEFT JOIN quotes q ON q.id = i.quote_id
       WHERE i.id = $1 AND i.is_deleted = FALSE`,
      [req.params.id]
    );
    if (!ownership.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    if (req.staff.role !== 'admin' && ownership.rows[0].service_type) {
      const svc = SLUG_TO_SERVICE[req.staff.department_slug];
      if (svc && svc !== ownership.rows[0].service_type) {
        return res.status(403).json({ error: 'You can only delete invoices in your own department.' });
      }
    }

    const result = await pool.query(
      `UPDATE invoices SET is_deleted = TRUE, deleted_at = NOW(), deleted_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice deleted (soft delete -- record retained)', invoice: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

module.exports = router;
