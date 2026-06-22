const express = require('express');
const pool = require('../../db');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// ---------- PUBLIC LIST (used by both public projects.html and admin dashboard) ----------
// No auth required -- this is the single shared source of truth.
// GET /api/projects?status=ongoing&department=construction
router.get('/', async (req, res) => {
  const { status = '', department = '' } = req.query;
  const conditions = ['p.is_deleted = FALSE'];
  const params = [];
  if (status) { params.push(status); conditions.push(`p.status = $${params.length}`); }
  if (department) { params.push(department); conditions.push(`d.slug = $${params.length}`); }

  try {
    const result = await pool.query(
      `SELECT p.*, d.name AS department_name, d.slug AS department_slug
       FROM projects p LEFT JOIN departments d ON d.id = p.department_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC`,
      params
    );
    res.json({ rows: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// ---------- COUNT (powers both admin stat card and any public "N projects" display) ----------
router.get('/summary', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*) FROM projects WHERE is_deleted = FALSE GROUP BY status`
    );
    const summary = { ongoing: 0, completed: 0, planned: 0, on_hold: 0 };
    result.rows.forEach(r => { summary[r.status] = Number(r.count); });
    summary.total = summary.ongoing + summary.completed + summary.planned + summary.on_hold;
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ---------- VIEW single project ----------
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, d.name AS department_name FROM projects p
       LEFT JOIN departments d ON d.id = p.department_id WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// ---------- CREATE (staff only) ----------
router.post('/', requireStaff, async (req, res) => {
  const {
    title, department_id, client_id, location, description, status, progress_pct,
    started_at, ended_at, contract_value, budget_spent, phase,
    site_engineer, foreman, permit_number, permit_approved, client_company
  } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO projects
        (title, department_id, client_id, location, description, status, progress_pct,
         started_at, ended_at, created_by, contract_value, budget_spent, phase,
         site_engineer, foreman, permit_number, permit_approved, client_company)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [title, department_id || null, client_id || null, location || null,
       description || null, status || 'ongoing', progress_pct || 0,
       started_at || null, ended_at || null, req.staff.id,
       contract_value || null, budget_spent || 0, phase || 'planning',
       site_engineer || null, foreman || null, permit_number || null,
       permit_approved || false, client_company || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// ---------- EDIT (staff only) -- changes reflect everywhere instantly since there is one table ----------
router.put('/:id', requireStaff, async (req, res) => {
  const {
    title, department_id, location, description, status, progress_pct, started_at, ended_at,
    contract_value, budget_spent, phase, site_engineer, foreman,
    permit_number, permit_approved, client_company
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE projects SET
        title = COALESCE($1, title),
        department_id = COALESCE($2, department_id),
        location = COALESCE($3, location),
        description = COALESCE($4, description),
        status = COALESCE($5, status),
        progress_pct = COALESCE($6, progress_pct),
        started_at = COALESCE($7, started_at),
        ended_at = COALESCE($8, ended_at),
        contract_value = COALESCE($9, contract_value),
        budget_spent = COALESCE($10, budget_spent),
        phase = COALESCE($11, phase),
        site_engineer = COALESCE($12, site_engineer),
        foreman = COALESCE($13, foreman),
        permit_number = COALESCE($14, permit_number),
        permit_approved = COALESCE($15, permit_approved),
        client_company = COALESCE($16, client_company),
        updated_at = NOW()
       WHERE id = $17 AND is_deleted = FALSE RETURNING *`,
      [title, department_id, location, description, status, progress_pct,
       started_at, ended_at, contract_value, budget_spent, phase,
       site_engineer, foreman, permit_number, permit_approved, client_company,
       req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// ---------- SOFT DELETE (reason required) ----------
router.delete('/:id', requireStaff, async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to delete a project' });

  try {
    const result = await pool.query(
      `UPDATE projects SET is_deleted = TRUE, deleted_at = NOW(), deleted_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted (soft delete -- record retained)', project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
