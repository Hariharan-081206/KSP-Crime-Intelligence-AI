import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import InvestigationBar from './InvestigationBar'
import ErrorBoundary from '../common/ErrorBoundary'
import CaseRecordDrawer from '../case/CaseRecordDrawer'
import './AppShell.css'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()

  return (
    <div className="app-root">
      <TopBar onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <div className="app-shell">
        <Sidebar collapsed={!sidebarOpen} />
        <div className="app-content">
          <InvestigationBar />
          {/* Route-level boundary: one broken view keeps the top bar and sidebar
              alive so the user can navigate out of it. Keyed by path so moving to
              another route clears the error without a reload. The outer boundary
              in App.jsx still catches anything above this. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
      <CaseRecordDrawer />
    </div>
  )
}
