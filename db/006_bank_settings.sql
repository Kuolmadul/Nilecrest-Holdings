-- ============================================
-- Nilecrest Holdings -- Bank transfer settings
-- Adds bank_name and bank_account_number to site_settings so pay.html
-- can display real details instead of a hardcoded placeholder.
-- Edit the actual values from the admin Settings page after this runs --
-- the ones below are placeholders too, just stored properly this time.
-- ============================================

INSERT INTO site_settings (key, value) VALUES
  ('bank_name',           'Set this from the Settings page'),
  ('bank_account_number', 'Set this from the Settings page')
ON CONFLICT (key) DO NOTHING;
