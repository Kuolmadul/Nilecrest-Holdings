const express = require('express');
const pool = require('../../db');
const { stkPush, normalizePhone } = require('../mpesa');

const router = express.Router();

// ---------- PUBLIC: client triggers payment from the invoice view page ----------
// No staff auth -- this is what a client hits when they click "Pay with M-Pesa".
router.post('/pay/:invoiceId', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  try {
    const invoiceResult = await pool.query(
      `SELECT * FROM invoices WHERE id = $1 AND is_deleted = FALSE`,
      [req.params.invoiceId]
    );
    if (!invoiceResult.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invoiceResult.rows[0];

    const outstanding = Number(invoice.amount) - Number(invoice.amount_paid);
    if (outstanding <= 0) return res.status(400).json({ error: 'This invoice is already fully paid' });

    // BASE_URL must be the public Railway domain -- Safaricom needs to reach this from the internet.
    const callbackUrl = `${process.env.BASE_URL}/api/mpesa/callback`;

    const result = await stkPush({
      phone,
      amount: outstanding,
      accountRef: invoice.invoice_number,
      description: `Invoice ${invoice.invoice_number}`,
      callbackUrl,
    });

    await pool.query(
      `INSERT INTO mpesa_requests (invoice_id, checkout_request_id, merchant_request_id, phone, amount)
       VALUES ($1,$2,$3,$4,$5)`,
      [invoice.id, result.CheckoutRequestID, result.MerchantRequestID, normalizePhone(phone), outstanding]
    );

    res.json({ message: 'Check your phone to complete payment', checkoutRequestId: result.CheckoutRequestID });
  } catch (err) {
    console.error('STK push error:', err);
    res.status(500).json({ error: err.message || 'Failed to start M-Pesa payment' });
  }
});

// ---------- PUBLIC: client polls this to see if their payment went through ----------
router.get('/status/:checkoutRequestId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, result_desc FROM mpesa_requests WHERE checkout_request_id = $1`,
      [req.params.checkoutRequestId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Request not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// ---------- SAFARICOM CALLBACK ----------
// Daraja calls this once the client has entered their PIN (or cancelled/timed out).
// Must always respond 200 with ResultCode 0, or Safaricom will retry repeatedly.
router.post('/callback', async (req, res) => {
  console.log('M-Pesa callback received:', JSON.stringify(req.body));

  const stk = req.body?.Body?.stkCallback;
  if (!stk) {
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqResult = await client.query(
      `SELECT * FROM mpesa_requests WHERE checkout_request_id = $1 FOR UPDATE`,
      [CheckoutRequestID]
    );
    if (!reqResult.rows.length) {
      console.error('No matching mpesa_requests row for', CheckoutRequestID);
      await client.query('ROLLBACK');
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
    const mpesaReq = reqResult.rows[0];

    if (ResultCode === 0) {
      // Success -- pull the M-Pesa receipt number out of CallbackMetadata
      const items = CallbackMetadata?.Item || [];
      const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value || null;
      const amountPaid = items.find(i => i.Name === 'Amount')?.Value || mpesaReq.amount;

      await client.query(
        `UPDATE mpesa_requests SET status = 'Success', result_desc = $1, updated_at = NOW() WHERE id = $2`,
        [ResultDesc, mpesaReq.id]
      );

      await client.query(
        `INSERT INTO payments (invoice_id, amount, method, mpesa_receipt)
         VALUES ($1,$2,'mpesa',$3)`,
        [mpesaReq.invoice_id, amountPaid, receipt]
      );

      const totalResult = await client.query(
        'SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE invoice_id = $1',
        [mpesaReq.invoice_id]
      );
      const invoiceResult = await client.query('SELECT amount FROM invoices WHERE id = $1', [mpesaReq.invoice_id]);
      const totalPaidNow = Number(totalResult.rows[0].total);
      const fullAmount = Number(invoiceResult.rows[0].amount);
      const newStatus = totalPaidNow <= 0 ? 'Unpaid' : totalPaidNow < fullAmount ? 'Partial' : 'Paid';

      await client.query(
        `UPDATE invoices SET
          amount_paid = $1, status = $2, payment_method = 'mpesa',
          paid_at = CASE WHEN $2 = 'Paid' THEN NOW() ELSE paid_at END,
          updated_at = NOW()
         WHERE id = $3`,
        [totalPaidNow, newStatus, mpesaReq.invoice_id]
      );
    } else {
      // 1032 = cancelled by user, 1037 = timeout, others = various failures
      const status = ResultCode === 1032 ? 'Cancelled' : 'Failed';
      await client.query(
        `UPDATE mpesa_requests SET status = $1, result_desc = $2, updated_at = NOW() WHERE id = $3`,
        [status, ResultDesc, mpesaReq.id]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error processing M-Pesa callback:', err);
  } finally {
    client.release();
  }

  // Always acknowledge -- Safaricom retries on non-200 or non-zero ResultCode.
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

module.exports = router;
