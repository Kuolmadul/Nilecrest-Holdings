const express = require('express');
const pool = require('../../db');
const { requireStaff, canAccessSlug } = require('../middleware/auth');
const { sendInvoiceEmail } = require('../email');

const router = express.Router();

// Maps department_slug -> service_type for scoping invoices via their linked quote
const SLUG_TO_SERVICE = {
  logistics:      'Logistics',
  transportation: 'Transport',
  construction:   'Construction',
};

// ---------- PUBLIC: view one invoice for the client-facing payment page ----------
// Deliberately returns only what a client needs to see and pay -- no internal IDs
// beyond the invoice's own, no department/handler info, no audit fields.
router.get('/public/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT invoice_number, client_name, amount, amount_paid, status, due_date
       FROM invoices WHERE id = $1 AND is_deleted = FALSE`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

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
  const { quote_id, client_id, client_name, client_email, amount, due_date, status } = req.body;
  try {
    const seq = await pool.query("SELECT nextval('invoice_ref_seq') AS n");
    const num = `INV-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(3, '0')}`;
    const result = await pool.query(
      `INSERT INTO invoices (invoice_number, quote_id, client_id, client_name, client_email, amount, due_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [num, quote_id || null, client_id || null, client_name, client_email || null, amount, due_date || null, status || 'Unpaid']
    );
    const invoice = result.rows[0];
    res.status(201).json(invoice);

    // Fire-and-forget: never let a slow/failed email delay or break invoice
    // creation. The response above has already gone out to the browser.
    sendInvoiceEmail(invoice).then(outcome => {
      if (!outcome.sent) console.warn(`Invoice ${invoice.invoice_number} email not sent: ${outcome.reason}`);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// ---------- CREATE FROM A WON QUOTE ----------
// Pre-fills client details from the quote so staff only need to confirm the agreed amount.
router.post('/from-quote/:quoteId', requireStaff, async (req, res) => {
  const { amount, due_date } = req.body;
  if (!amount) return res.status(400).json({ error: 'Amount is required' });

  try {
    const quoteResult = await pool.query(
      `SELECT * FROM quotes WHERE id = $1 AND is_deleted = FALSE`,
      [req.params.quoteId]
    );
    if (!quoteResult.rows.length) return res.status(404).json({ error: 'Quote not found' });
    const quote = quoteResult.rows[0];

    const existing = await pool.query(
      `SELECT id, invoice_number FROM invoices WHERE quote_id = $1 AND is_deleted = FALSE`,
      [quote.id]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: `An invoice already exists for this quote (${existing.rows[0].invoice_number})` });
    }

    const seq = await pool.query("SELECT nextval('invoice_ref_seq') AS n");
    const num = `INV-${new Date().getFullYear()}-${String(seq.rows[0].n).padStart(3, '0')}`;

    const result = await pool.query(
      `INSERT INTO invoices (invoice_number, quote_id, client_name, client_email, amount, due_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,'Unpaid') RETURNING *`,
      [num, quote.id, quote.client_name, quote.client_email, amount, due_date || null]
    );
    const invoice = result.rows[0];
    res.status(201).json(invoice);

    sendInvoiceEmail(invoice).then(outcome => {
      if (!outcome.sent) console.warn(`Invoice ${invoice.invoice_number} email not sent: ${outcome.reason}`);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create invoice from quote' });
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

// ---------- PAYMENT HISTORY for one invoice ----------
router.get('/:id/payments', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, s.name AS recorded_by_name FROM payments p
       LEFT JOIN staff s ON s.id = p.recorded_by
       WHERE p.invoice_id = $1 ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    res.json({ payments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// ---------- RECORD A PAYMENT (mpesa / bank_transfer / cash) ----------
// Inserts a payment row, then recalculates amount_paid and status from the
// sum of all payments so far -- amount_paid is never trusted as hand-typed input.
router.post('/:id/payments', requireStaff, async (req, res) => {
  const { amount, method, mpesa_receipt, bank_reference, notes } = req.body;

  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A valid amount is required' });
  if (!['mpesa', 'bank_transfer', 'cash'].includes(method)) {
    return res.status(400).json({ error: 'Method must be mpesa, bank_transfer, or cash' });
  }
  if (method === 'bank_transfer' && (!bank_reference || !bank_reference.trim())) {
    return res.status(400).json({ error: 'A bank reference is required for bank transfers' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceResult = await client.query(
      'SELECT * FROM invoices WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
      [req.params.id]
    );
    if (!invoiceResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const invoice = invoiceResult.rows[0];

    await client.query(
      `INSERT INTO payments (invoice_id, amount, method, mpesa_receipt, bank_reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [invoice.id, amount, method, mpesa_receipt || null, bank_reference || null, notes || null, req.staff.id]
    );

    const totalResult = await client.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE invoice_id = $1',
      [invoice.id]
    );
    const totalPaid = Number(totalResult.rows[0].total);
    const newStatus = totalPaid <= 0 ? 'Unpaid' : totalPaid < Number(invoice.amount) ? 'Partial' : 'Paid';

    const updateResult = await client.query(
      `UPDATE invoices SET
        amount_paid = $1,
        status = $2,
        payment_method = $3,
        paid_at = CASE WHEN $2 = 'Paid' THEN NOW() ELSE paid_at END,
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [totalPaid, newStatus, method, invoice.id]
    );

    await client.query('COMMIT');
    res.status(201).json(updateResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to record payment' });
  } finally {
    client.release();
  }
});

module.exports = router;
