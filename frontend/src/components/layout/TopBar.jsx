import { Menu, Shield } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS, ROLE_COLOR_VAR } from '../../utils/roles'
import './TopBar.css'

export default function TopBar({ onToggleSidebar }) {
  const { role, name } = useAuth()

  return (
    <header className="topbar">
      <button className="topbar-hamburger" onClick={onToggleSidebar} title="Toggle navigation" type="button">
        <Menu size={18} />
      </button>
      <div className="topbar-brand">
        <span className="topbar-brand-icon">
          <Shield size={18} />
        </span>
        <div className="topbar-brand-text">
          <span className="topbar-title">Criminal Investigation Department</span>
          <span className="topbar-subtitle">Government of Karnataka</span>
        </div>
        <span className="topbar-brand-icon">
          <Shield size={18} />
        </span>
      </div>
      {role && (
        <div className="topbar-role">
          <span className="topbar-role-dot" style={{ background: ROLE_COLOR_VAR[role] }} />
          <span className="topbar-role-name">{name}</span>
          <span className="topbar-role-label">{ROLE_LABELS[role]}</span>
        </div>
      )}
    </header>
  )
}
