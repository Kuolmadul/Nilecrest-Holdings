-- ============================================
-- Nilecrest Holdings -- Payment tracking
-- Adds payment method tracking to invoices and a
-- full payment audit trail (an invoice can be paid
-- in installments via mixed methods).
-- ============================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)
  CHECK (payment_method IN ('mpesa','bank_transfer','cash'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- ---------- PAYMENTS: one row per payment event against an invoice ----------
CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL PRIMARY KEY,
  invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount          NUMERIC(14,2) NOT NULL,
  method          VARCHAR(20) NOT NULL CHECK (method IN ('mpesa','bank_transfer','cash')),
  mpesa_receipt   VARCHAR(40),   -- Safaricom confirmation code, e.g. "QGH7XJKL9P"
  bank_reference  VARCHAR(80),   -- client-supplied transfer ref / deposit slip number
  notes           TEXT,
  recorded_by     INTEGER REFERENCES staff(id) ON DELETE SET NULL,  -- NULL once auto-confirmed by M-Pesa callback
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- Separate sequence for invoice numbers, mirroring quote_ref_seq, so numbering
-- survives deletions and concurrent inserts safely (the old COUNT(*) approach did not).
CREATE SEQUENCE IF NOT EXISTS invoice_ref_seq START 1;

-- ---------- M-PESA STK PUSH TRACKING ----------
-- Daraja's callback only gives us back CheckoutRequestID, so we need this
-- table to know which invoice a given STK push was actually for.
CREATE TABLE IF NOT EXISTS mpesa_requests (
  id                  SERIAL PRIMARY KEY,
  invoice_id          INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  checkout_request_id VARCHAR(60) NOT NULL UNIQUE,
  merchant_request_id VARCHAR(60),
  phone               VARCHAR(15) NOT NULL,
  amount              NUMERIC(14,2) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Success','Failed','Cancelled')),
  result_desc         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_requests_invoice ON mpesa_requests(invoice_id);
