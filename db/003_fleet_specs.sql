-- ============================================================
-- Adds a flexible JSONB "specs" column to fleet so each department
-- (construction / transport / logistics) can store its own relevant
-- fields without needing separate tables or rigid schema changes.
--
-- Run in pgAdmin Query Tool on nilecrest_holdings AFTER 001 and 002:
--   psql -U postgres -d nilecrest_holdings -f 003_fleet_specs.sql
-- ============================================================

ALTER TABLE fleet ADD COLUMN IF NOT EXISTS specs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Example shapes (not enforced, just for reference):
-- Construction equipment: {"attachment_type": "Bucket", "fuel_hours": 1450, "last_service": "2026-05-01", "site_location": "Nakuru Road Project"}
-- Transport vehicle:      {"seating_capacity": 20, "route": "CBD Shuttle", "driver_license_class": "BCE", "insurance_expiry": "2026-12-01"}
-- Logistics truck:        {"cargo_capacity_tons": 15, "trailer_type": "Flatbed", "gps_tracking_id": "GPS-2291", "current_route": "Nairobi-Kampala"}
