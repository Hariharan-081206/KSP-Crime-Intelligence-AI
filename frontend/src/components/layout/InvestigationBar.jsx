import { useNavigate } from 'react-router-dom'
import { Layers, X, Database } from 'lucide-react'
import { useInvestigation } from '../../context/InvestigationContext'
import { useAuth } from '../../context/AuthContext'
import { roleCan } from '../../utils/roles'
import './InvestigationBar.css'

// Cumulative cross-page context strip (see PRE_DEPLOY_REPORT.md §4). Rendered in
// AppShell above every feature page. Each chip is a frame the chat resolved;
// the newest is highlighted, older frames are dimmed but stay visible
// ("accumulate and stack"). Clicking a chip navigates to the most relevant view.
export default function InvestigationBar() {
  const { investigationStack, activeCaseId, clearStack, openDrawer } = useInvestigation()
  const { role } = useAuth()
  const navigate = useNavigate()

  if (investigationStack.length === 0) return null

  const canCase = roleCan(role, 'case-detail')
  const lastIdx = investigationStack.length - 1

  const chipLabel = (f) => f.caseId || f.accusedId || f.district || 'context'

  const go = (f) => {
    if (f.caseId && canCase) navigate(`/case/${encodeURIComponent(f.caseId)}`)
    else if (f.district && roleCan(role, 'map')) navigate('/map')
    else if (f.accusedId && roleCan(role, 'profile')) navigate('/profile')
  }

  return (
    <div className="investigation-bar" role="region" aria-label="Active investigation context">
      <div className="investigation-bar-lead">
        <Layers size={14} />
        <span>Investigation</span>
      </div>

      <div className="investigation-bar-chips">
        {investigationStack.map((f, i) => (
          <button
            key={`${chipLabel(f)}-${f.addedAt}`}
            type="button"
            className={`inv-chip ${i === lastIdx ? 'inv-chip-active' : 'inv-chip-dim'}`}
            onClick={() => go(f)}
            title={[f.caseId, f.accusedId, f.district].filter(Boolean).join(' · ')}
          >
            <span className="inv-chip-id">{chipLabel(f)}</span>
            {f.district && <span className="inv-chip-sub">{f.district}</span>}
          </button>
        ))}
      </div>

      <div className="investigation-bar-actions">
        {activeCaseId && (
          <button type="button" className="inv-bar-btn" onClick={openDrawer} title="Open case record">
            <Database size={14} />
            <span>Record</span>
          </button>
        )}
        <button type="button" className="inv-bar-btn inv-bar-clear" onClick={clearStack} title="Clear investigation stack">
          <X size={14} />
          <span>Clear</span>
        </button>
      </div>
    </div>
  )
}
