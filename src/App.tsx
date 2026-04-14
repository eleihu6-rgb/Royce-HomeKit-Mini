import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import LegacyPage from './components/LegacyPage'
import { useTheme } from './hooks/useTheme'
import { type PageId } from './types/nav'

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // globe.js is an IIFE that needs the canvas to exist in DOM first
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'js/globe.js'
    document.head.appendChild(script)
    return () => { script.remove() }
  }, [])

  return (
    <>
      <div className="ambient-bg">
        <div className="ambient-orb ambient-orb-1"></div>
        <div className="ambient-orb ambient-orb-2"></div>
        <div className="ambient-orb ambient-orb-3"></div>
      </div>
      <div className="noise-overlay"></div>

      <Sidebar
        currentPage={currentPage}
        collapsed={sidebarCollapsed}
        onNavigate={setCurrentPage}
        onToggle={() => setSidebarCollapsed(c => !c)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className={`main${sidebarCollapsed ? ' nav-collapsed' : ''}`}>
        <Topbar currentPage={currentPage} />
        <LegacyPage pageId={currentPage} />

        {/* Globe background — canvas must be in DOM before globe.js runs */}
        <div className="globe-bg-container">
          <canvas id="globe-canvas"></canvas>
          <div className="globe-vignette"></div>
        </div>
      </main>
    </>
  )
}
