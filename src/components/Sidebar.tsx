import { type PageId, NAV_LABELS } from '../types/nav'
import { type Theme } from '../hooks/useTheme'

interface Props {
  currentPage: PageId
  collapsed: boolean
  onNavigate: (page: PageId) => void
  onToggle: () => void
  theme: Theme
  onToggleTheme: () => void
}

const SunSVG = () => (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="4"/>
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/>
  </svg>
)

const MoonSVG = () => (
  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 12A7 7 0 0 1 8 3a7 7 0 1 0 9 9z"/>
  </svg>
)

interface NavItemProps {
  pageId: PageId
  label: string
  icon: React.ReactNode
  badge?: React.ReactNode
  currentPage: PageId
  onNavigate: (page: PageId) => void
}

function NavItem({ pageId, label, icon, badge, currentPage, onNavigate }: NavItemProps) {
  return (
    <div
      className={`nav-item${currentPage === pageId ? ' active' : ''}`}
      onClick={() => onNavigate(pageId)}
    >
      <div className="nav-item-inner">
        <div className="nav-icon">{icon}</div>
        <div className="nav-label">{label}</div>
        {badge}
      </div>
    </div>
  )
}

const NewBadge = () => <div className="nav-badge new">NEW</div>

export default function Sidebar({ currentPage, collapsed, onNavigate, onToggle, theme, onToggleTheme }: Props) {
  return (
    <>
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-badge">
            <div className="logo-icon">✈</div>
            <div className="logo-text">
              <div className="logo-name">ROIs Crew</div>
              <div className="logo-tagline">Ver: B3/F7</div>
            </div>
          </div>
        </div>

        <div className="sidebar-status">
          <div className="status-dot"></div>
          <div className="status-text">SYS ONLINE · ALL MODULES ACTIVE</div>
        </div>

        <div className="sidebar-section-label">Navigation</div>

        <NavItem
          pageId="dashboard" label={NAV_LABELS['dashboard']} currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="4" rx="1.5"/><rect x="2" y="11" width="7" height="4" rx="1.5"/><rect x="11" y="8" width="7" height="7" rx="1.5"/></svg>}
        />

        <div className="sidebar-section-label">Roster Tools</div>

        <NavItem
          pageId="bids" label={NAV_LABELS['bids']} currentPage={currentPage} onNavigate={onNavigate}
          badge={<NewBadge />}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 2a8 8 0 0 1 0 16"/></svg>}
        />

        <NavItem
          pageId="converter" label={NAV_LABELS['converter']} currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h12M16 7l-3-3M16 7l-3 3"/><path d="M16 13H4M4 13l3-3M4 13l3 3"/></svg>}
        />

        <NavItem
          pageId="loadsql" label={NAV_LABELS['loadsql']} currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="10" cy="5" rx="7" ry="3"/><path d="M3 5v4c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M3 9v4c0 1.7 3.1 3 7 3s7-1.3 7-3V9"/></svg>}
        />

        <NavItem
          pageId="nbids" label={NAV_LABELS['nbids']} currentPage={currentPage} onNavigate={onNavigate}
          badge={<NewBadge />}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h12v2H4zM4 9h8v2H4zM4 14h10v2H4z"/><path d="M14 11l4 4-4 4"/></svg>}
        />

        <NavItem
          pageId="crew-bids-summary" label={NAV_LABELS['crew-bids-summary']} currentPage={currentPage} onNavigate={onNavigate}
          badge={<NewBadge />}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M2 7h16M6 3v4M14 3v4M6 11h2M10 11h2M14 11h2M6 14h2M10 14h2"/></svg>}
        />

        <NavItem
          pageId="dashboard" label="Roster Manager" currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="14" height="16" rx="2"/><path d="M7 6h6M7 10h6M7 14h4"/></svg>}
        />

        <NavItem
          pageId="dashboard" label="Crew Scheduling" currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 5v5l3 3"/></svg>}
        />

        <div className="sidebar-section-label">Analytics</div>

        <NavItem
          pageId="dashboard" label="Flight Analytics" currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17V9l4-4 4 3 6-6"/><path d="M14 2h4v4"/></svg>}
        />

        <NavItem
          pageId="dashboard" label="Compliance Reports" currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z"/></svg>}
        />

        <div className="sidebar-section-label">Setting</div>

        <div className="nav-item" onClick={onToggleTheme}>
          <div className="nav-item-inner">
            <div className="nav-icon">{theme === 'light' ? <MoonSVG /> : <SunSVG />}</div>
            <div className="nav-label">Theme</div>
            <div className="nav-badge" style={{background:'var(--accent-warning)',color:'#0a0a0f',fontSize:'9px',border:'none'}}>
              {theme === 'light' ? 'LIGHT' : 'DARK'}
            </div>
          </div>
        </div>

        <div className="sidebar-section-label">About</div>

        <NavItem
          pageId="about" label={NAV_LABELS['about']} currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="7" r="4"/><path d="M3 18c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>}
        />

        <NavItem
          pageId="client" label={NAV_LABELS['client']} currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><path d="M2 10h16"/><ellipse cx="10" cy="10" rx="4" ry="8"/></svg>}
        />

        <NavItem
          pageId="model" label={NAV_LABELS['model']} currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="16" height="12" rx="2"/><circle cx="10" cy="10" r="3"/><path d="M14 7h1"/></svg>}
        />

        <NavItem
          pageId="roadmap" label={NAV_LABELS['roadmap']} currentPage={currentPage} onNavigate={onNavigate}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4l4 2v12l-4-2V4z"/><path d="M7 6l6-2v12l-6 2V6z"/><path d="M13 4l4-2v12l-4 2V4z"/></svg>}
        />

        <NavItem
          pageId="dutyswap" label={NAV_LABELS['dutyswap']} currentPage={currentPage} onNavigate={onNavigate}
          badge={<NewBadge />}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h10M5 8l-3 4h16l-3-4M8 12v4M12 12v4M6 16h8"/></svg>}
        />

        <NavItem
          pageId="dutyswap2" label={NAV_LABELS['dutyswap2']} currentPage={currentPage} onNavigate={onNavigate}
          badge={<NewBadge />}
          icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h12M4 13h12M7 4l-3 3 3 3M13 10l3 3-3 3"/></svg>}
        />

        <div className="sidebar-footer">
          <div className="sidebar-footer-info">
            <span style={{color:'var(--accent-warning)',textShadow:'0 0 10px rgba(251,191,36,0.3)'}}>VERSION 7</span> · BUILD 20260305<br/>
            ROIs CREW © 2026<br/>
            YVR · 737 · CA SERIES
          </div>
        </div>
      </aside>

      <button
        className={`sidebar-toggle top${collapsed ? ' nav-collapsed' : ''}`}
        id="sidebarToggleTop"
        onClick={onToggle}
        title="Toggle navigation"
      >
        {collapsed ? '››' : '‹‹'}
      </button>
      <button
        className={`sidebar-toggle bottom${collapsed ? ' nav-collapsed' : ''}`}
        id="sidebarToggleBot"
        onClick={onToggle}
        title="Toggle navigation"
      >
        {collapsed ? '››' : '‹‹'}
      </button>
    </>
  )
}
