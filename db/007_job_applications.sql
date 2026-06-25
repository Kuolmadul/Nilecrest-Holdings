-- ============================================
-- Nilecrest Holdings -- Job Applications
-- Backs the public Careers page. Applicants submit a CV/cover letter
-- (stored via Cloudinary, same pattern as quote attachments), staff review
-- and update status from the admin dashboard.
-- ============================================

CREATE TABLE IF NOT EXISTS job_applications (
  id              SERIAL PRIMARY KEY,
  ref_number      VARCHAR(20) NOT NULL UNIQUE,
  full_name       VARCHAR(120) NOT NULL,
  email           VARCHAR(180) NOT NULL,
  phone           VARCHAR(20),
  department_id   INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  position_title  VARCHAR(150) NOT NULL,   -- e.g. "Heavy Truck Driver", "Site Engineer"
  cover_message   TEXT,
  cv_file_path    VARCHAR(500),            -- Cloudinary URL
  status          VARCHAR(20) NOT NULL DEFAULT 'New'
                  CHECK (status IN ('New','Shortlisted','Interviewing','Hired','Rejected')),
  reviewed_by     INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  review_notes    TEXT,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  deleted_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_applications_active ON job_applications(is_deleted);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications(status);
CREATE SEQUENCE IF NOT EXISTS job_application_ref_seq START 1;

-- Ref format: APP-YYYYMMDD-NNNN
CREATE OR REPLACE FUNCTION next_application_ref()
RETURNS VARCHAR AS $$
  SELECT 'APP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('job_application_ref_seq')::text, 4, '0');
$$ LANGUAGE SQL;
