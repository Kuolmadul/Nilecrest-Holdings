const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const { generalLimiter } = require('./api/middleware/rateLimit');

const app = express();

// Helmet sets a batch of protective HTTP headers (X-Frame-Options, HSTS,
// disables MIME sniffing, etc). CSP is left off by default since this app
// serves plain HTML/CSS/JS plus third-party CDN assets (fonts, icon font,
// Tabler icons) -- a strict CSP here would need careful tuning per page to
// avoid breaking those. Revisit if you want to lock that down further.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS_ORIGINS in .env is a comma-separated allowlist, e.g.:
//   CORS_ORIGINS=https://nilecrestholdings.com,https://www.nilecrestholdings.com
// Same-origin requests (your own frontend calling your own API on the same
// domain) don't need CORS at all -- this only matters if something on a
// different origin needs to call the API directly. Leave unset locally and
// everything on localhost still works.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // No origin header = same-origin request, curl, Postman, or the M-Pesa
    // callback from Safaricom's servers -- always allow.
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json());

// Broad rate limit across the whole API as a safety net against scripted
// abuse/scraping. Specific endpoints (login, M-Pesa) layer on tighter limits.
app.use('/api', generalLimiter);

// Serve frontend (HTML, CSS, JS) -- all site files live in /public
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth',      require('./api/routes/auth'));
app.use('/api/quotes',    require('./api/routes/quotes'));
app.use('/api/projects',  require('./api/routes/projects'));
app.use('/api/fleet',     require('./api/routes/fleet'));
app.use('/api/invoices',  require('./api/routes/invoices'));
app.use('/api/staff',     require('./api/routes/staff'));
app.use('/api/clients',   require('./api/routes/clients'));
app.use('/api/settings',  require('./api/routes/settings'));
app.use('/api/enquiries', require('./api/routes/enquiries'));
app.use('/api/shipments', require('./api/routes/shipments'));
app.use('/api/trips',     require('./api/routes/trips'));
app.use('/api/fuel',      require('./api/routes/fuel'));
app.use('/api/mpesa',     require('./api/routes/mpesa'));
app.use('/api/job-applications', require('./api/routes/job-applications'));

// Export the app so Vercel can run it as a serverless function.
module.exports = app;

// Only start a persistent listener when run directly (local dev / npm run dev).
// On Vercel, this file is required, not executed directly, so app.listen() is skipped.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Nilecrest server running on http://localhost:${PORT}`);
  });
}
