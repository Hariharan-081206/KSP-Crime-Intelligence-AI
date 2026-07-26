import { NavLink } from 'react-router-dom'
import {
  Home,
  Database,
  BarChart2,
  Share2,
  List,
  Shield,
  Bookmark,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useInvestigation } from '../../context/InvestigationContext'
import { roleCan, ROLES } from '../../utils/roles'
import './Sidebar.css'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Chat Home', feature: null, end: true },
  { to: '/map', icon: BarChart2, label: 'Crime Map', feature: 'map' },
  { to: '/network', icon: Share2, label: 'Network Graph', feature: 'network' },
  { to: '/alerts', icon: List, label: 'Alerts', feature: 'alerts' },
  { to: '/profile', icon: Shield, label: 'Behavioral Profile', feature: 'profile' },
  { to: '/case/KA-BLR-2024-04471', icon: Bookmark, label: 'Saved Case', feature: 'case-detail' },
]

export default function Sidebar({ collapsed }) {
  const { role } = useAuth()
  const { investigationStack, drawerOpen, toggleDrawer } = useInvestigation()

  const stackCount = investigationStack.length
  // Investigators can always open the (empty-state) drawer; other roles only
  // once there is context, but they still SEE the icon so its purpose is clear.
  const dbDisabled = stackCount === 0 && role !== ROLES.INVESTIGATOR

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          title="Chat Home"
        >
          <Home size={19} />
        </NavLink>

        {/* Case Record drawer (§5) — not a route, a right-side drawer. */}
        <button
          type="button"
          aria-label="Case record"
          className={`sidebar-item sidebar-db ${drawerOpen ? 'active' : ''} ${dbDisabled ? 'disabled' : ''}`}
          title={dbDisabled ? 'Ask about a case in chat to load its record' : 'Case record'}
          onClick={dbDisabled ? undefined : toggleDrawer}
          disabled={dbDisabled}
        >
          <Database size={19} />
          {stackCount > 0 && <span className="badge">{stackCount}</span>}
        </button>

        {NAV_ITEMS.slice(1).map(({ to, icon: Icon, label, feature, end }) => {
          const allowed = !feature || roleCan(role, feature)
          if (!allowed) {
            return (
              <div key={label} className="sidebar-item disabled" title="Not available for your role">
                <Icon size={19} />
              </div>
            )
          }
          return (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              title={label}
            >
              <Icon size={19} />
            </NavLink>
          )
        })}
      </div>
      <div className="sidebar-bottom">
        <NavLink to="/audit" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`} title="Settings & Audit Log">
          <Settings size={19} />
        </NavLink>
        <div className="sidebar-item" title="Help">
          <HelpCircle size={19} />
        </div>
      </div>
    </nav>
  )
}
