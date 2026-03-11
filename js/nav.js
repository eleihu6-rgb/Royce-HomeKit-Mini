// ===================================================================
// SIDEBAR TOGGLE
// ===================================================================
function toggleSidebar() {
  const sidebar  = document.querySelector('.sidebar');
  const main     = document.querySelector('.main');
  const toggles  = document.querySelectorAll('.sidebar-toggle');
  const collapsed = sidebar.classList.toggle('collapsed');
  main.classList.toggle('nav-collapsed', collapsed);
  toggles.forEach(t => {
    t.classList.toggle('nav-collapsed', collapsed);
    t.textContent = collapsed ? '››' : '‹‹';
  });
}

// ===================================================================
// CLOCK
// ===================================================================
function updateClock() {
  const now = new Date();
  const utc = now.toUTCString().split(' ')[4];
  document.getElementById('clock').textContent = utc + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

document.getElementById('init-time').textContent = new Date().toUTCString().split(' ')[4];

// ===================================================================
// NAV
// ===================================================================
const breadcrumbs = {
  bids:      'BIDS TYPE ANALYSIS',
  converter: 'PDF → EXCEL CONVERTER',
  dashboard: 'DASHBOARD',
  about:     'ABOUT US',
  client:    'ABOUT CLIENT',
  model:     'ABOUT MODEL',
  roadmap:   'ABOUT ROADMAP'
};

// ===================================================================
// LAZY PAGE LOADER
// ===================================================================
async function loadPageIfNeeded(id) {
  // Converter is always inline — skip
  if (id === 'converter') return;
  const el = document.getElementById('page-' + id);
  if (!el || el.dataset.loaded) return;
  const res = await fetch('pages/' + id + '.html');
  if (!res.ok) return;
  el.innerHTML = await res.text();
  el.dataset.loaded = '1';
}

async function showPage(id) {
  await loadPageIfNeeded(id);

  document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.getElementById('breadcrumb-current').textContent = breadcrumbs[id] || id.toUpperCase();

  // Set active nav
  const navItems = document.querySelectorAll('.nav-item');
  const labels = {bids:'Bids Type Analysis', converter:'PDF → Excel Converter', dashboard:'Dashboard', about:'Us', client:'Client', model:'Model', roadmap:'Roadmap'};
  navItems.forEach(item => {
    const label = item.querySelector('.nav-label');
    if (label && label.textContent.trim() === labels[id]) {
      item.classList.add('active');
    }
  });

  // Lazy-init handlers after page inject
  if (id === 'bids')   setTimeout(initBidsPage,  50);
  if (id === 'about')  setTimeout(initAboutMap,  50);
  if (id === 'client') setTimeout(initClientMap, 50);
  if (id === 'model')   setTimeout(initModelPage,   50);
  if (id === 'roadmap') setTimeout(initRoadmapPage, 50);
}

// ===================================================================
// THEME TOGGLE
// ===================================================================
function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const newTheme = isLight ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('rois-theme', newTheme);
  updateThemeUI(newTheme);
}

const _sunSVG = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>';
const _moonSVG = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 12A7 7 0 0 1 8 3a7 7 0 1 0 9 9z"/></svg>';

function updateThemeUI(theme) {
  const icon  = document.getElementById('theme-icon');
  const badge = document.getElementById('theme-badge');
  if (icon)  icon.innerHTML    = theme === 'light' ? _moonSVG : _sunSVG;
  if (badge) badge.textContent = theme === 'light' ? 'LIGHT' : 'DARK';
}

// Auto-apply saved theme on load
(function() {
  const saved = localStorage.getItem('rois-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    // Defer UI update until DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => updateThemeUI(saved));
    } else {
      updateThemeUI(saved);
    }
  }
})();
