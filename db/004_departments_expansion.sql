-- ============================================================
-- Nilecrest Holdings -- Department Expansion Migration
-- Run AFTER 001, 002, 003
--   psql -U postgres -d nilecrest_holdings -f 004_departments_expansion.sql
-- ============================================================

-- ---------------------------------------------------------------
-- LOGISTICS: Shipments (the real unit of work for a logistics co.)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id                SERIAL PRIMARY KEY,
  shipment_ref      VARCHAR(30) NOT NULL UNIQUE,
  client_id         INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name       VARCHAR(120) NOT NULL,
  origin            VARCHAR(200) NOT NULL,
  destination       VARCHAR(200) NOT NULL,
  cargo_type        VARCHAR(100),               -- e.g. "General Goods", "Perishables", "Machinery"
  weight_tons       NUMERIC(8,2),
  volume_cbm        NUMERIC(8,2),
  fleet_id          INTEGER REFERENCES fleet(id) ON DELETE SET NULL,
  assigned_driver   VARCHAR(120),
  departure_date    DATE,
  expected_delivery DATE,
  actual_delivery   DATE,
  status            VARCHAR(25) NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','Loading','In Transit','At Border','Delivered','Cancelled')),
  border_clearance  BOOLEAN NOT NULL DEFAULT FALSE,
  proof_of_delivery TEXT,
  notes             TEXT,
  quote_id          INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_id        INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  created_by        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ,
  deleted_reason    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_active  ON shipments(is_deleted);
CREATE INDEX IF NOT EXISTS idx_shipments_status  ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_client  ON shipments(client_id);
CREATE SEQUENCE IF NOT EXISTS shipment_ref_seq START 1;

-- ---------------------------------------------------------------
-- TRANSPORT: Trips / Schedule
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
  id              SERIAL PRIMARY KEY,
  trip_ref        VARCHAR(30) NOT NULL UNIQUE,
  client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name     VARCHAR(120) NOT NULL,
  fleet_id        INTEGER REFERENCES fleet(id) ON DELETE SET NULL,
  vehicle_reg     VARCHAR(30),
  assigned_driver VARCHAR(120),
  route           VARCHAR(200) NOT NULL,
  origin          VARCHAR(150),
  destination     VARCHAR(150),
  departure_time  TIMESTAMPTZ,
  arrival_time    TIMESTAMPTZ,
  passenger_count SMALLINT DEFAULT 0,
  trip_type       VARCHAR(20) NOT NULL DEFAULT 'one_off'
                  CHECK (trip_type IN ('one_off','recurring','charter')),
  status          VARCHAR(20) NOT NULL DEFAULT 'Scheduled'
                  CHECK (status IN ('Scheduled','In Progress','Completed','Cancelled')),
  notes           TEXT,
  quote_id        INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_id      INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  deleted_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_active  ON trips(is_deleted);
CREATE INDEX IF NOT EXISTS idx_trips_status  ON trips(status);
CREATE SEQUENCE IF NOT EXISTS trip_ref_seq START 1;

-- ---------------------------------------------------------------
-- CONSTRUCTION: Extend projects with real construction fields
-- ---------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS contract_value    NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS budget_spent      NUMERIC(16,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase             VARCHAR(30) DEFAULT 'foundation'
                                             CHECK (phase IN ('planning','foundation','structure','finishing','handover')),
  ADD COLUMN IF NOT EXISTS site_engineer     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS foreman           VARCHAR(120),
  ADD COLUMN IF NOT EXISTS permit_number     VARCHAR(60),
  ADD COLUMN IF NOT EXISTS permit_approved   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_company    VARCHAR(150);

-- ---------------------------------------------------------------
-- FLEET: Fuel Log (all departments -- catches theft/inefficiency)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuel_log (
  id            SERIAL PRIMARY KEY,
  fleet_id      INTEGER NOT NULL REFERENCES fleet(id) ON DELETE CASCADE,
  log_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  litres        NUMERIC(8,2) NOT NULL,
  cost_kes      NUMERIC(10,2),
  odometer_km   INTEGER,
  fuel_hours    INTEGER,                  -- for construction equipment
  filled_by     VARCHAR(120),
  station       VARCHAR(150),
  notes         TEXT,
  created_by    INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_log_fleet ON fuel_log(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fuel_log_date  ON fuel_log(log_date);

-- ---------------------------------------------------------------
-- CONSTRUCTION: Subcontractors
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subcontractors (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,
  contact_phone   VARCHAR(25),
  contact_email   VARCHAR(180),
  trade           VARCHAR(100),            -- e.g. "Electrical", "Plumbing", "Masonry"
  contract_value  NUMERIC(14,2),
  amount_paid     NUMERIC(14,2) DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'Active'
                  CHECK (status IN ('Active','Completed','Terminated')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subcontractors_project ON subcontractors(project_id);

-- ---------------------------------------------------------------
-- SEED: shipment ref helper function
-- ---------------------------------------------------------------
-- Ref format: SHP-YYYYMMDD-NNNN
-- Usage: SELECT next_shipment_ref();
CREATE OR REPLACE FUNCTION next_shipment_ref()
RETURNS VARCHAR AS $$
  SELECT 'SHP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('shipment_ref_seq')::text, 4, '0');
$$ LANGUAGE SQL;

-- Ref format: TRP-YYYYMMDD-NNNN
CREATE OR REPLACE FUNCTION next_trip_ref()
RETURNS VARCHAR AS $$
  SELECT 'TRP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('trip_ref_seq')::text, 4, '0');
$$ LANGUAGE SQL;
