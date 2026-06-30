-- ============================================
-- Nilecrest Holdings -- Drivers
-- A real drivers table, replacing the free-text "assigned_driver" fields on
-- fleet and trips. Driver records are created automatically when a job
-- application in the Transportation department is marked "Hired" -- this
-- keeps the driver list grounded in real hiring data instead of being a
-- second place staff have to manually re-enter the same person.
-- ============================================

CREATE TABLE IF NOT EXISTS drivers (
  id                  SERIAL PRIMARY KEY,
  full_name           VARCHAR(120) NOT NULL,
  phone               VARCHAR(20),
  email               VARCHAR(180),
  license_number      VARCHAR(50),
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','on_leave','inactive')),
  job_application_id  INTEGER REFERENCES job_applications(id) ON DELETE SET NULL,
  notes               TEXT,
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at          TIMESTAMPTZ,
  deleted_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(is_deleted);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);

-- Prevents the same hired application from creating two driver records if
-- a status is accidentally toggled Hired -> something else -> Hired again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_unique_application
  ON drivers(job_application_id) WHERE job_application_id IS NOT NULL;

-- ---------- Link fleet and trips to real driver records ----------
-- The old free-text assigned_driver columns are kept (so existing data
-- isn't lost) but are no longer the source of truth going forward --
-- driver_id is. The app code will read/write driver_id from now on.
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL;
ALTER TABLE trips  ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_driver ON fleet(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
