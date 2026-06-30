const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');
const { upload, uploadBuffer } = require('../upload');
const { publicSubmissionLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// ---------- PUBLIC: submit a job application from the Careers page ----------
// Accepts an optional single CV/cover letter file under the field name "cv".
router.post('/public', publicSubmissionLimiter, upload.single('cv'), async (req, res) => {
  const { full_name, email, phone, department, position_title, cover_message } = req.body;

  if (!full_name || !email || !position_title) {
    return res.status(400).json({ error: 'Name, email, and position are required' });
  }

  try {
    let departmentId = null;
    if (department) {
      const deptResult = await pool.query('SELECT id FROM departments WHERE slug = $1', [department]);
      departmentId = deptResult.rows[0]?.id || null;
    }

    let cvFilePath = null;
    if (req.file) {
      cvFilePath = await uploadBuffer(req.file, 'job-applications');
    }

    const refResult = await pool.query('SELECT next_application_ref() AS ref');
    const ref = refResult.rows[0].ref;

    const result = await pool.query(
      `INSERT INTO job_applications (ref_number, full_name, email, phone, department_id, position_title, cover_message, cv_file_path, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'New') RETURNING ref_number`,
      [ref, full_name, email, phone || null, departmentId, position_title, cover_message || null, cvFilePath]
    );

    res.status(201).json({ ref_number: result.rows[0].ref_number, message: 'Application submitted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to submit application' });
  }
});

// ---------- STAFF: list applications, with optional status filter ----------
// GET /api/job-applications?status=New&page=1&limit=10
router.get('/', requireStaff, async (req, res) => {
  const { status = '', page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const conditions = ['is_deleted = FALSE'];
  const params = [];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  try {
    const countResult = await pool.query(`SELECT COUNT(*) FROM job_applications ${whereClause}`, params);
    params.push(limit, offset);
    const rowsResult = await pool.query(
      `SELECT ja.*, d.name AS department_name
       FROM job_applications ja LEFT JOIN departments d ON d.id = ja.department_id
       ${whereClause} ORDER BY ja.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total: Number(countResult.rows[0].count), rows: rowsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ---------- STAFF: summary counts (for stat pills) ----------
router.get('/summary', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) FROM job_applications WHERE is_deleted = FALSE GROUP BY status`
    );
    const summary = { New: 0, Shortlisted: 0, Interviewing: 0, Hired: 0, Rejected: 0 };
    result.rows.forEach(r => { summary[r.status] = Number(r.count); });
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ---------- STAFF: view single application ----------
router.get('/:id', requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ja.*, d.name AS department_name, s.name AS reviewed_by_name
       FROM job_applications ja
       LEFT JOIN departments d ON d.id = ja.department_id
       LEFT JOIN staff s ON s.id = ja.reviewed_by
       WHERE ja.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Application not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// ---------- STAFF: update status / review notes ----------
router.put('/:id', requireStaff, async (req, res) => {
  const { status, review_notes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE job_applications SET
        status = COALESCE($1, status),
        review_notes = COALESCE($2, review_notes),
        reviewed_by = $3,
        updated_at = NOW()
       WHERE id = $4 AND is_deleted = FALSE RETURNING *`,
      [status, review_notes, req.staff.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Application not found' });
    const application = result.rows[0];

    // Auto-create a driver record when a Transportation-department hire is
    // marked Hired, so they immediately show up in the driver dropdown when
    // scheduling trips -- no separate manual data entry required. Scoped to
    // Transportation only, since not every hire across the company is a
    // driver (e.g. site engineers, warehouse staff).
    if (status === 'Hired') {
      const deptCheck = await pool.query(
        `SELECT d.slug FROM departments d WHERE d.id = $1`,
        [application.department_id]
      );
      if (deptCheck.rows[0]?.slug === 'transportation') {
        await pool.query(
          `INSERT INTO drivers (full_name, phone, email, job_application_id, status)
           VALUES ($1,$2,$3,$4,'active')
           ON CONFLICT (job_application_id) DO NOTHING`,
          [application.full_name, application.phone, application.email, application.id]
        );
      }
    }

    res.json(application);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// ---------- STAFF: soft delete (with required reason) ----------
router.delete('/:id', requireStaff, async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to delete an application' });

  try {
    const result = await pool.query(
      `UPDATE job_applications SET is_deleted = TRUE, deleted_at = NOW(), deleted_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Application not found' });
    res.json({ message: 'Application deleted (soft delete -- record retained)', application: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

module.exports = router;
