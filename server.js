const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nilecrest server running on http://localhost:${PORT}`);
});
