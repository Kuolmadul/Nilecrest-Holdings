-- ============================================
-- Nilecrest Holdings -- Invoice client email
-- Adds client_email so the system can automatically email the payment
-- link when an invoice is created, even for standalone invoices that
-- aren't linked to a quote or registered client.
-- ============================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email VARCHAR(180);
