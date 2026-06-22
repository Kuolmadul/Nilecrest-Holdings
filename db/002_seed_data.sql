-- ============================================================
-- Nilecrest Holdings -- sample seed data (optional)
-- Run AFTER 001_full_schema.sql:
--   psql -U postgres -d nilecrest_holdings -f 002_seed_data.sql
-- Safe to skip in production; useful for local development/demo.
-- ============================================================

-- Sample clients
INSERT INTO clients (name, company, email, phone) VALUES
  ('James Kariuki', 'Kenya Breweries Ltd', 'james.kariuki@kbl.example.com', '+254712345601'),
  ('Mary Wanjiru',  'Techbridge Contracting', 'mary.wanjiru@techbridge.example.com', '+254712345602'),
  ('David Otieno',  'Safaricom PLC', 'david.otieno@safaricom.example.com', '+254712345603'),
  ('Grace Mutua',   'Bamburi Cement', 'grace.mutua@bamburi.example.com', '+254712345604')
ON CONFLICT (email) DO NOTHING;

-- Sample projects, tied to departments and clients
INSERT INTO projects (title, department_id, client_id, location, description, status, progress_pct, started_at)
SELECT 'Mombasa Road Commercial Hub', d.id, c.id, 'Nairobi, Kenya', 'Mixed-use commercial development along Mombasa Road.', 'ongoing', 72, '2025-09-01'
FROM departments d, clients c WHERE d.slug = 'construction' AND c.email = 'mary.wanjiru@techbridge.example.com';

INSERT INTO projects (title, department_id, client_id, location, description, status, progress_pct, started_at)
SELECT 'Cross-border Freight Programme', d.id, c.id, 'Kenya - Uganda', 'Scheduled freight haulage between Nairobi and Kampala.', 'ongoing', 45, '2025-11-15'
FROM departments d, clients c WHERE d.slug = 'logistics' AND c.email = 'james.kariuki@kbl.example.com';

INSERT INTO projects (title, department_id, location, description, status, progress_pct, started_at)
SELECT 'County Road Rehabilitation', d.id, 'Nakuru, Kenya', 'Rehabilitation of county trunk roads.', 'ongoing', 90, '2025-06-01'
FROM departments d WHERE d.slug = 'construction';

INSERT INTO projects (title, department_id, client_id, location, description, status, progress_pct, started_at)
SELECT 'Corporate Fleet Programme', d.id, c.id, 'Nairobi, Kenya', 'Dedicated staff shuttle and fleet management.', 'ongoing', 28, '2026-01-10'
FROM departments d, clients c WHERE d.slug = 'transportation' AND c.email = 'david.otieno@safaricom.example.com';

-- Sample fleet vehicles
INSERT INTO fleet (reg_number, vehicle_type, make_model, department_id, assigned_driver, status, current_location) VALUES
  ('KDA 123A',  'Heavy Truck',  'Hino 500',           (SELECT id FROM departments WHERE slug='logistics'),      'John Mwangi',     'active',      'Nairobi to Kampala'),
  ('KDB 456B',  'Heavy Truck',  'Isuzu FVR',          (SELECT id FROM departments WHERE slug='logistics'),      'Peter Otieno',    'maintenance', 'Garage A - engine overhaul'),
  ('KDC 789C',  'Staff Bus',    'Rosa 20-seater',     (SELECT id FROM departments WHERE slug='transportation'), 'Samuel Kipchoge', 'active',      'Safaricom shuttle, CBD'),
  ('NCH-EX01',  'Excavator',    'CAT 320',            (SELECT id FROM departments WHERE slug='construction'),   'David Njoroge',   'active',      'Nakuru road project'),
  ('KDD 321D',  'Tipper Truck', 'SINOTRUK',           (SELECT id FROM departments WHERE slug='logistics'),      NULL,              'standby',     'Yard - Nairobi'),
  ('NCH-GD02',  'Grader',       'Komatsu GD655',      (SELECT id FROM departments WHERE slug='construction'),   'Alex Mutua',      'maintenance', 'Blade replacement')
ON CONFLICT (reg_number) DO NOTHING;

-- Sample quotes
INSERT INTO quotes (ref_number, client_id, client_name, client_email, company, service_type, description, status)
SELECT 'QT-2026-024', c.id, c.name, c.email, c.company, 'Logistics', 'Cross-border cargo, Nairobi to Kampala', 'Pending'
FROM clients c WHERE c.email = 'james.kariuki@kbl.example.com'
ON CONFLICT (ref_number) DO NOTHING;

INSERT INTO quotes (ref_number, client_id, client_name, client_email, company, service_type, description, status)
SELECT 'QT-2026-023', c.id, c.name, c.email, c.company, 'Construction', 'Site preparation and earthworks, Thika', 'In Review'
FROM clients c WHERE c.email = 'mary.wanjiru@techbridge.example.com'
ON CONFLICT (ref_number) DO NOTHING;

INSERT INTO quotes (ref_number, client_id, client_name, client_email, company, service_type, description, status)
SELECT 'QT-2026-022', c.id, c.name, c.email, c.company, 'Transport', 'Monthly staff shuttle, Nairobi CBD', 'Won'
FROM clients c WHERE c.email = 'david.otieno@safaricom.example.com'
ON CONFLICT (ref_number) DO NOTHING;

INSERT INTO quotes (ref_number, client_id, client_name, client_email, company, service_type, description, status)
SELECT 'QT-2026-021', c.id, c.name, c.email, c.company, 'Logistics', 'Bulk cement haulage, Mombasa to Nairobi', 'Won'
FROM clients c WHERE c.email = 'grace.mutua@bamburi.example.com'
ON CONFLICT (ref_number) DO NOTHING;
