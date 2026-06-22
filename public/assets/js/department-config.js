// Central config for department-specific theming, labels, and fleet fields.
// Used by sidebar.js, fleet.html, and index.html (dashboard) so every page
// adapts to the logged-in staff member's department without duplicating pages.

const DEPARTMENT_CONFIG = {
  construction: {
    label: 'Construction',
    accent: '#E85C1A',
    icon: 'ti-building-skyscraper',
    fleetLabel: 'Equipment',
    fleetFields: [
      { key: 'attachment_type', label: 'Attachment Type', type: 'text', placeholder: 'e.g. Bucket, Breaker' },
      { key: 'fuel_hours', label: 'Fuel Hours', type: 'number', placeholder: 'e.g. 1450' },
      { key: 'last_service', label: 'Last Service Date', type: 'date' },
      { key: 'site_location', label: 'Site Location', type: 'text', placeholder: 'e.g. Nakuru Road Project' },
    ],
    dashboardStats: [
      { key: 'active_sites', label: 'Active Sites' },
      { key: 'equipment_active', label: 'Equipment Active' },
      { key: 'equipment_maintenance', label: 'In Maintenance' },
    ],
  },
  transportation: {
    label: 'Transport',
    accent: '#1B6FE8',
    icon: 'ti-bus',
    fleetLabel: 'Vehicles',
    fleetFields: [
      { key: 'seating_capacity', label: 'Seating Capacity', type: 'number', placeholder: 'e.g. 20' },
      { key: 'route', label: 'Assigned Route', type: 'text', placeholder: 'e.g. CBD Shuttle' },
      { key: 'driver_license_class', label: 'Driver License Class', type: 'text', placeholder: 'e.g. BCE' },
      { key: 'insurance_expiry', label: 'Insurance Expiry', type: 'date' },
    ],
    dashboardStats: [
      { key: 'vehicles_on_route', label: 'Vehicles on Route' },
      { key: 'passenger_trips', label: 'Trips Today' },
      { key: 'vehicles_maintenance', label: 'In Maintenance' },
    ],
  },
  logistics: {
    label: 'Logistics',
    accent: '#1E9E5A',
    icon: 'ti-truck',
    fleetLabel: 'Trucks',
    fleetFields: [
      { key: 'cargo_capacity_tons', label: 'Cargo Capacity (tons)', type: 'number', placeholder: 'e.g. 15' },
      { key: 'trailer_type', label: 'Trailer Type', type: 'text', placeholder: 'e.g. Flatbed, Tanker' },
      { key: 'gps_tracking_id', label: 'GPS Tracking ID', type: 'text', placeholder: 'e.g. GPS-2291' },
      { key: 'current_route', label: 'Current Route', type: 'text', placeholder: 'e.g. Nairobi-Kampala' },
    ],
    dashboardStats: [
      { key: 'active_deliveries', label: 'Active Deliveries' },
      { key: 'fleet_utilization', label: 'Fleet Utilization %' },
      { key: 'trucks_maintenance', label: 'In Maintenance' },
    ],
  },
  // Admin has no department_id -- treated as "see everything, generic theme".
  admin: {
    label: 'Admin',
    accent: '#1B2A5E',
    icon: 'ti-shield-cog',
    fleetLabel: 'Fleet',
    fleetFields: [
      { key: 'attachment_type', label: 'Attachment Type (Construction)', type: 'text' },
      { key: 'seating_capacity', label: 'Seating Capacity (Transport)', type: 'number' },
      { key: 'cargo_capacity_tons', label: 'Cargo Capacity Tons (Logistics)', type: 'number' },
    ],
    dashboardStats: [
      { key: 'total_active', label: 'Active Fleet' },
      { key: 'total_maintenance', label: 'In Maintenance' },
      { key: 'total_projects', label: 'Active Projects' },
    ],
  },
};

// Returns the config for the currently logged-in staff member's department.
// Falls back to 'admin' config if no department (e.g. super admin) or unrecognized slug.
function getDepartmentConfig() {
  const staff = JSON.parse(localStorage.getItem('nch_staff') || 'null');
  const slug = staff && staff.role !== 'admin' ? staff.department_slug : 'admin';
  return DEPARTMENT_CONFIG[slug] || DEPARTMENT_CONFIG.admin;
}

// Applies the department accent color as a CSS variable on <html>,
// so existing CSS can reference var(--dept-accent) for theming.
function applyDepartmentTheme() {
  const cfg = getDepartmentConfig();
  document.documentElement.style.setProperty('--dept-accent', cfg.accent);
}
