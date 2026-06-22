// Shared API client for Nilecrest admin pages.
// Include this before any page-specific script: <script src="../assets/js/api.js"></script>

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('nch_staff_token');
}

function getStaff() {
  const raw = localStorage.getItem('nch_staff');
  return raw ? JSON.parse(raw) : null;
}

function requireLogin() {
  if (!getToken()) {
    window.location.href = '../auth/login.html';
  }
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('nch_staff_token');
    localStorage.removeItem('nch_staff');
    window.location.href = '../auth/login.html';
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function logout() {
  localStorage.removeItem('nch_staff_token');
  localStorage.removeItem('nch_staff');
  window.location.href = '../auth/login.html';
}

// Renders the logged-in staff name/role/department into the sidebar footer
function renderStaffIdentity() {
  const staff = getStaff();
  if (!staff) return;
  const nameEl = document.querySelector('.sidebar-username');
  const roleEl = document.querySelector('.sidebar-role');
  const avatarEl = document.querySelector('.sidebar-avatar');
  if (nameEl) nameEl.textContent = staff.name;
  if (roleEl) roleEl.textContent = staff.role === 'admin' ? 'Super Admin' : `${staff.department || ''} Manager`;
  if (avatarEl) avatarEl.textContent = staff.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

  // Hide admin-only nav items (Users & Roles, Settings write access) for managers
  if (staff.role !== 'admin') {
    document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
  }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMoney(n) {
  if (n === null || n === undefined) return 'KSh 0';
  return 'KSh ' + Number(n).toLocaleString('en-KE');
}
