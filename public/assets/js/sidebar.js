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
