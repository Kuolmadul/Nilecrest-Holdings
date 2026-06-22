# Nilecrest Holdings -- Full-stack Website

Logistics, Transport, and Construction company website for the East African market.
Node.js / Express + PostgreSQL backend, plain HTML/CSS/JS frontend (no frameworks).

## Project structure
```
server.js              Express app entry point
db.js                  PostgreSQL connection pool
.env                   DB credentials, JWT secret (already filled in for local dev)
package.json

api/
  middleware/auth.js   JWT auth -- requireStaff, requireAdmin, canAccessDepartment
  routes/              One file per resource: auth, quotes, projects, fleet,
                        invoices, staff, clients, settings, enquiries

db/
  001_full_schema.sql  Full schema -- departments, staff, clients, projects, fleet,
                        quotes (+ history), invoices, enquiries, site_settings.
                        Seeds 1 admin + 3 department managers.
  002_seed_data.sql    Optional sample data (clients, projects, fleet, quotes)
                        so the dashboard isn't empty on first run.

public/                Everything served to the browser
  index.html, about.html, services.html, projects.html, fleet.html,
  contact.html, quote.html        Public-facing pages
  auth/login.html                 Staff login
  admin/                          Admin dashboard (9 pages: dashboard, quotes,
                                   projects, fleet, invoices, clients, users, settings)
  assets/css, assets/images       Shared styles and brand assets
  assets/js/api.js                Shared fetch wrapper used by every admin page
  assets/js/sidebar.js            Builds the admin sidebar nav consistently
```

## Setting up the database
1. Open pgAdmin 4, connect to your PostgreSQL server on port 5433.
2. Make sure a database named `nilecrest_holdings` exists.
3. Open the Query Tool against that database and run, in order:
   - `db/001_full_schema.sql`
   - `db/002_seed_data.sql` (optional, but recommended for local development)

This creates every table the app needs, including `departments`, `staff`,
`clients`, `projects`, `fleet`, `quotes`, `quote_history`, `fleet_history`,
`invoices`, `enquiries`, and `site_settings`.

## Seeded staff logins
All seeded accounts use the same password: **Admin@1234**
Change this immediately after your first login (Settings > My Account).

| Role    | Email                                        | Department      |
|---------|-----------------------------------------------|------------------|
| Admin   | admin@nilecrestholdings.com                  | All (oversight)  |
| Manager | construction.manager@nilecrestholdings.com   | Construction     |
| Manager | transport.manager@nilecrestholdings.com      | Transportation   |
| Manager | logistics.manager@nilecrestholdings.com      | Logistics        |

## Running the app
```powershell
npm install
npm run dev
```
Then visit `http://localhost:3000`. Staff log in at `http://localhost:3000/auth/login.html`,
which redirects to the admin dashboard on success.

## Before deploying anywhere public
- Change every seeded password.
- Replace `JWT_SECRET` in `.env` with a long random string.
- Double check `.env` is not committed to source control.

## How the data stays in sync
`GET /api/projects` and `GET /api/fleet` summary/list endpoints have no admin-only
gate on reads, so both the admin pages and the public site call the exact same
endpoints against the exact same tables. There is no separate mock data anywhere --
editing a project or vehicle in the admin panel updates what visitors and clients
see immediately, because they're reading from the same row.

## Brand colours
- Navy: `#1B2A5E`
- Orange: `#E85C1A`
