// Injects the sidebar markup into <div id="sidebarMount"></div>.
// `activePage` should be one of: dashboard, quotes, projects, fleet, invoices, clients, users, settings
function renderSidebar(activePage) {
  const cfg = (typeof getDepartmentConfig === 'function') ? getDepartmentConfig() : { fleetLabel: 'Fleet', accent: '#1B2A5E', icon: 'ti-shield-cog', label: 'Admin' };
  const staff = JSON.parse(localStorage.getItem('nch_staff') || 'null');
  const isAdmin = !staff || staff.role === 'admin';
  const deptSlug = staff && staff.department_slug ? staff.department_slug : 'admin';

  const items = [
    { key: 'dashboard', href: 'index.html',     icon: 'ti-layout-dashboard',      label: 'Dashboard' },
    { key: 'quotes',    href: 'quotes.html',    icon: 'ti-file-text',             label: 'Quotes', badge: 'quotesBadge' },
    { key: 'projects',  href: 'projects.html',  icon: 'ti-building-skyscraper',   label: 'Projects' },
    // Shipments: show for logistics dept or admin
    ...(isAdmin || deptSlug === 'logistics' ? [{ key: 'shipments', href: 'shipments.html', icon: 'ti-package', label: 'Shipments' }] : []),
    // Trips: show for transportation dept or admin
    ...(isAdmin || deptSlug === 'transportation' ? [{ key: 'trips', href: 'trips.html', icon: 'ti-route', label: 'Trips / Schedule' }] : []),
    { key: 'fleet',     href: 'fleet.html',     icon: cfg.icon || 'ti-truck',      label: cfg.fleetLabel || 'Fleet' },
    { key: 'invoices',  href: 'invoices.html',  icon: 'ti-receipt',               label: 'Invoices' },
    { key: 'clients',   href: 'clients.html',   icon: 'ti-users',                 label: 'Clients' },
    { key: 'enquiries', href: 'enquiries.html', icon: 'ti-mail',                  label: 'Enquiries', badge: 'enquiriesBadge' },
    { key: 'applications', href: 'applications.html', icon: 'ti-briefcase', label: 'Job Applications', badge: 'applicationsBadge' },
  ];
  const settingsItems = [
    { key: 'users',    href: 'users.html',    icon: 'ti-user-cog',  label: 'Users & Roles', adminOnly: true },
    { key: 'settings', href: 'settings.html', icon: 'ti-settings',  label: 'Settings' },
  ].filter(i => !i.adminOnly || isAdmin);

  const navHtml = items.map(i => `
    <a href="${i.href}" class="nav-item${i.key === activePage ? ' active' : ''}">
      <i class="ti ${i.icon}"></i> ${i.label}${i.badge ? ` <span class="badge-count" id="${i.badge}" style="display:none;">0</span>` : ''}
    </a>`).join('');

  const settingsHtml = settingsItems.map(i => `
    <a href="${i.href}" class="nav-item${i.key === activePage ? ' active' : ''}"${i.adminOnly ? ' data-admin-only' : ''}>
      <i class="ti ${i.icon}"></i> ${i.label}
    </a>`).join('');

  const mount = document.getElementById('sidebarMount');
  if (!mount) return;
  mount.innerHTML = `
    <aside class="sidebar" id="sidebar" style="--dept-accent:${cfg.accent || '#E85C1A'};">
      <div class="sidebar-logo">
        <img src="../assets/images/logo.png" alt="Nilecrest Holdings" class="sidebar-logo-img">
      </div>
      <div class="sidebar-label">${isAdmin ? 'Main' : cfg.label}</div>
      <nav class="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-label">Settings</div>
      <nav class="sidebar-nav">${settingsHtml}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-avatar" style="background:${cfg.accent || '#E85C1A'};">AD</div>
          <div>
            <div class="sidebar-username">Admin</div>
            <div class="sidebar-role">${isAdmin ? 'Super Admin' : cfg.label + ' Manager'}</div>
          </div>
        </div>
        <a href="#" class="logout-btn" onclick="logout(); return false;"><i class="ti ti-logout"></i></a>
      </div>
    </aside>`;

  renderStaffIdentity();
  loadQuotesBadge();
  loadApplicationsBadge();
  loadEnquiriesBadge();
  initNotifBell();
}

async function loadEnquiriesBadge() {
  try {
    const data = await api('/enquiries');
    const unread = data.rows.filter(e => !e.is_read).length;
    const badge = document.getElementById('enquiriesBadge');
    if (badge) {
      badge.textContent = unread;
      badge.style.display = unread > 0 ? 'inline-block' : 'none';
    }
  } catch {
    // Non-critical -- badge just stays hidden if the call fails
  }
}

// ---------- NOTIFICATION BELL ----------
// Finds the .topbar-notif bell icon (present on every admin page's topbar)
// and wires it into a live dropdown of unread enquiries -- contact form
// submissions and bank transfer payment notices. Works without editing
// every individual admin page, since it attaches itself to whatever bell
// markup it finds after the sidebar/topbar render.
function initNotifBell() {
  const bell = document.querySelector('.topbar-notif');
  if (!bell || bell.dataset.notifWired) return;
  bell.dataset.notifWired = 'true';
  bell.style.position = 'relative';
  bell.style.cursor = 'pointer';

  const dropdown = document.createElement('div');
  dropdown.id = 'notifDropdown';
  dropdown.style.cssText = `
    display:none; position:absolute; top:calc(100% + 10px); right:0; width:340px;
    max-height:420px; overflow-y:auto; background:#fff; border:0.5px solid #e2e6f0;
    border-radius:10px; box-shadow:0 12px 32px rgba(0,0,0,0.14); z-index:300;
  `;
  bell.appendChild(dropdown);

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) loadNotifDropdown();
  });
  document.addEventListener('click', () => { dropdown.style.display = 'none'; });
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  loadNotifBadge();
}

async function loadNotifBadge() {
  try {
    const data = await api('/enquiries');
    const unread = data.rows.filter(e => !e.is_read).length;
    const dot = document.querySelector('.topbar-notif .notif-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  } catch {
    // Non-critical
  }
}

async function loadNotifDropdown() {
  const dropdown = document.getElementById('notifDropdown');
  if (!dropdown) return;
  dropdown.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:12.5px;">Loading...</div>`;
  try {
    const data = await api('/enquiries');
    const unread = data.rows.filter(e => !e.is_read).slice(0, 8);
    const isBankNotice = (e) => (e.subject || '').toLowerCase().includes('bank transfer notification');

    dropdown.innerHTML = `
      <div style="padding:14px 16px;border-bottom:0.5px solid #e2e6f0;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;font-weight:600;color:#1B2A5E;">Notifications</span>
        ${unread.length ? `<span style="font-size:11px;color:var(--text-3);">${unread.length} unread</span>` : ''}
      </div>
      ${!unread.length ? `<div style="padding:28px 16px;text-align:center;color:var(--text-3);font-size:12.5px;"><i class="ti ti-bell-off" style="font-size:20px;display:block;margin-bottom:6px;"></i>You're all caught up</div>` : unread.map(e => `
        <a href="${currentPathPrefix()}enquiries.html" style="display:block;padding:11px 16px;border-bottom:0.5px solid #f0f2f8;text-decoration:none;color:inherit;">
          <div style="display:flex;align-items:flex-start;gap:8px;">
            <i class="ti ${isBankNotice(e) ? 'ti-building-bank' : 'ti-mail'}" style="color:#C1440E;font-size:15px;margin-top:1px;"></i>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;font-weight:600;color:#1e293b;">${isBankNotice(e) ? 'Bank transfer notice' : 'New enquiry'} from ${escapeHtmlSafe(e.name)}</div>
              <div style="font-size:11.5px;color:var(--text-3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtmlSafe(e.message || '')}</div>
              <div style="font-size:10.5px;color:var(--text-3);margin-top:3px;">${timeAgo(e.created_at)}</div>
            </div>
          </div>
        </a>`).join('')}
      <a href="${currentPathPrefix()}enquiries.html" style="display:block;padding:10px 16px;text-align:center;font-size:12px;font-weight:500;color:#1B2A5E;text-decoration:none;border-top:0.5px solid #e2e6f0;">View all enquiries</a>
    `;
  } catch {
    dropdown.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;font-size:12.5px;">Failed to load notifications</div>`;
  }
}

// Re-fetches the badge/dropdown -- called after marking an enquiry as read
// from the Enquiries page itself, so the bell updates without a refresh.
function refreshNotifDropdown() {
  loadNotifBadge();
  const dropdown = document.getElementById('notifDropdown');
  if (dropdown && dropdown.style.display === 'block') loadNotifDropdown();
}

// admin/index.html links are same-folder (quotes.html); this exists in case
// any page that includes sidebar.js is nested deeper in the future.
function currentPathPrefix() {
  return '';
}

function escapeHtmlSafe(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function loadQuotesBadge() {
  try {
    const summary = await api('/quotes/summary');
    const badge = document.getElementById('quotesBadge');
    if (badge && summary) {
      const pending = summary.Pending || 0;
      badge.textContent = pending;
      badge.style.display = pending > 0 ? 'inline-block' : 'none';
    }
  } catch {
    // Non-critical -- badge just stays hidden if the call fails
  }
}

async function loadApplicationsBadge() {
  try {
    const summary = await api('/job-applications/summary');
    const badge = document.getElementById('applicationsBadge');
    if (badge && summary) {
      const newCount = summary.New || 0;
      badge.textContent = newCount;
      badge.style.display = newCount > 0 ? 'inline-block' : 'none';
    }
  } catch {
    // Non-critical -- badge just stays hidden if the call fails
  }
}
