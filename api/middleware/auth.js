const jwt = require('jsonwebtoken');
require('dotenv').config();

function requireStaff(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'staff') return res.status(403).json({ error: 'Staff access required' });
    req.staff = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireStaff(req, res, () => {
    if (req.staff.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// Managers may only act within their own department; admin has no restriction.
function canAccessDepartment(staff, departmentId) {
  if (staff.role === 'admin') return true;
  return staff.department_id === departmentId;
}

module.exports = { requireStaff, requireAdmin, canAccessDepartment };
