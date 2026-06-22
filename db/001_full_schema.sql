-- ============================================================
-- Nilecrest Holdings -- full PostgreSQL schema
-- Run in pgAdmin 4 (Query Tool) or:
--   psql -U postgres -d nilecrest_holdings -f 001_full_schema.sql
-- ============================================================

-- ---------- DEPARTMENTS ----------
CREATE TABLE IF NOT EXISTS departments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  slug        VARCHAR(60) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO departments (name, slug) VALUES
  ('Construction',  'construction'),
  ('Transportation','transportation'),
  ('Logistics',     'logistics')
ON CONFLICT (slug) DO NOTHING;

-- ---------- STAFF (admin + managers, internal only) ----------
CREATE TABLE IF NOT EXISTS staff (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(180) NOT NULL UNIQUE,
  phone         VARCHAR(20),
  password      VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'manager' CHECK (role IN ('admin','manager')),
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Admin has no department (oversees all three); managers must have one
CREATE INDEX IF NOT EXISTS idx_staff_department ON staff(department_id);

-- ---------- CLIENTS (separate from staff entirely) ----------
CREATE TABLE IF NOT EXISTS clients (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  company     VARCHAR(150),
  email       VARCHAR(180) NOT NULL UNIQUE,
  phone       VARCHAR(20),
  password    VARCHAR(255),
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- PASSWORD RESETS (covers both staff and clients) ----------
CREATE TABLE IF NOT EXISTS password_resets (
  id           SERIAL PRIMARY KEY,
  account_type VARCHAR(10) NOT NULL CHECK (account_type IN ('staff','client')),
  account_id   INTEGER     NOT NULL,
  email        VARCHAR(180) NOT NULL,
  token        VARCHAR(64)  NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ  NOT NULL,
  used         BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- PROJECTS ----------
CREATE TABLE IF NOT EXISTS projects (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  location      VARCHAR(150),
  description   TEXT,
  status        VARCHAR(20)  NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','completed','planned','on_hold')),
  progress_pct  SMALLINT     NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  started_at    DATE,
  ended_at      DATE,
  is_deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ,
  deleted_reason TEXT,
  created_by    INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_deleted);
CREATE INDEX IF NOT EXISTS idx_projects_dept   ON projects(department_id);

-- ---------- FLEET ----------
CREATE TABLE IF NOT EXISTS fleet (
  id             SERIAL PRIMARY KEY,
  reg_number     VARCHAR(30) NOT NULL UNIQUE,
  vehicle_type   VARCHAR(60),
  make_model     VARCHAR(120),
  department_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  assigned_driver VARCHAR(120),
  status         VARCHAR(20) NOT NULL DEFAULT 'standby' CHECK (status IN ('active','maintenance','standby','out_of_service')),
  current_location VARCHAR(200),
  notes          TEXT,
  is_deleted     BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at     TIMESTAMPTZ,
  deleted_reason TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fleet_active ON fleet(is_deleted);
CREATE INDEX IF NOT EXISTS idx_fleet_status ON fleet(status);

-- ---------- QUOTES (with soft delete + edit/status history) ----------
CREATE TABLE IF NOT EXISTS quotes (
  id            SERIAL PRIMARY KEY,
  ref_number    VARCHAR(20) NOT NULL UNIQUE,
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name   VARCHAR(120) NOT NULL,
  client_email  VARCHAR(180) NOT NULL,
  client_phone  VARCHAR(20),
  company       VARCHAR(150),
  service_type  VARCHAR(60) NOT NULL CHECK (service_type IN ('Logistics','Transport','Construction')),
  description   TEXT,
  origin        VARCHAR(150),
  destination   VARCHAR(150),
  file_path     VARCHAR(300),
  estimated_value NUMERIC(14,2),
  status        VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','In Review','Won','Lost')),
  is_deleted    BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ,
  deleted_reason TEXT,
  handled_by    INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_active ON quotes(is_deleted);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_service ON quotes(service_type);

-- Quote ref number sequence helper
CREATE SEQUENCE IF NOT EXISTS quote_ref_seq START 1;

-- ---------- QUOTE EDIT HISTORY (every edit/delete logged with a reason) ----------
CREATE TABLE IF NOT EXISTS quote_history (
  id          SERIAL PRIMARY KEY,
  quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  action      VARCHAR(20) NOT NULL CHECK (action IN ('created','updated','status_changed','deleted','restored')),
  reason      TEXT,
  changed_by  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  snapshot    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- FLEET HISTORY (edits/deletes with reasons) ----------
CREATE TABLE IF NOT EXISTS fleet_history (
  id          SERIAL PRIMARY KEY,
  fleet_id    INTEGER NOT NULL REFERENCES fleet(id) ON DELETE CASCADE,
  action      VARCHAR(20) NOT NULL CHECK (action IN ('created','updated','status_changed','deleted','restored')),
  reason      TEXT,
  changed_by  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  snapshot    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- INVOICES ----------
CREATE TABLE IF NOT EXISTS invoices (
  id            SERIAL PRIMARY KEY,
  invoice_number VARCHAR(30) NOT NULL UNIQUE,
  quote_id      INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name   VARCHAR(120) NOT NULL,
  amount        NUMERIC(14,2) NOT NULL,
  amount_paid   NUMERIC(14,2) NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid','Partial','Paid','Overdue')),
  due_date      DATE,
  is_deleted    BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at    TIMESTAMPTZ,
  deleted_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_active ON invoices(is_deleted);

-- ---------- ENQUIRIES (general contact form) ----------
CREATE TABLE IF NOT EXISTS enquiries (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(180) NOT NULL,
  phone       VARCHAR(20),
  subject     VARCHAR(200),
  message     TEXT NOT NULL,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- SITE SETTINGS (key/value, editable from Settings page) ----------
CREATE TABLE IF NOT EXISTS site_settings (
  key         VARCHAR(80) PRIMARY KEY,
  value       TEXT,
  updated_by  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_settings (key, value) VALUES
  ('site_name',    'Nilecrest Holdings'),
  ('site_tagline', 'Logistics . Transport . Construction'),
  ('site_email',   'Nilecrest@gmail.com'),
  ('site_phone',   '+254 11 0500712'),
  ('whatsapp_number','254110500712'),
  ('site_address', 'Nairobi Kenya, PO BOX 0,00100'),
  ('maps_embed_url', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d31910.72895303232!2d36.789429097616626!3d-1.2681246180662977!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x182f173c0a1f9de7%3A0xad2c84df1f7f2ec8!2sWestlands%2C%20Nairobi!5e0!3m2!1sen!2ske!4v1781775494906!5m2!1sen!2ske')
ON CONFLICT (key) DO NOTHING;

-- ---------- SEED: one overall admin (no department) ----------
-- Password for ALL seeded accounts below is: Admin@1234 -- change immediately after first login.
-- This hash was generated with: node -e "require('bcrypt').hash('Admin@1234',10).then(console.log)"
INSERT INTO staff (name, email, password, role, department_id)
VALUES ('Nilecrest Admin', 'admin@nilecrestholdings.com', '$2b$10$0l7lk6DkMg2gW6.nACjUPuEJOgSRpdJBx4FsojSpnpHq9Bv6/OeBe', 'admin', NULL)
ON CONFLICT (email) DO NOTHING;

-- ---------- SEED: one manager per department ----------
INSERT INTO staff (name, email, password, role, department_id)
SELECT 'Construction Manager', 'construction.manager@nilecrestholdings.com', '$2b$10$0l7lk6DkMg2gW6.nACjUPuEJOgSRpdJBx4FsojSpnpHq9Bv6/OeBe', 'manager', id
FROM departments WHERE slug = 'construction'
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff (name, email, password, role, department_id)
SELECT 'Transportation Manager', 'transport.manager@nilecrestholdings.com', '$2b$10$0l7lk6DkMg2gW6.nACjUPuEJOgSRpdJBx4FsojSpnpHq9Bv6/OeBe', 'manager', id
FROM departments WHERE slug = 'transportation'
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff (name, email, password, role, department_id)
SELECT 'Logistics Manager', 'logistics.manager@nilecrestholdings.com', '$2b$10$0l7lk6DkMg2gW6.nACjUPuEJOgSRpdJBx4FsojSpnpHq9Bv6/OeBe', 'manager', id
FROM departments WHERE slug = 'logistics'
ON CONFLICT (email) DO NOTHING;
