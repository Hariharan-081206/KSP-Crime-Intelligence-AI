import { useState } from 'react'
import { Download } from 'lucide-react'
import RoleGate from './RoleGate'
import { useAuth } from '../../context/AuthContext'
import { useSession } from '../../context/SessionContext'
import { exportRoleReport } from '../../utils/exportReport'
import { exportTemplateFor } from '../../utils/exportTemplates'
import './ExportButton.css'

// Routes the export through the backend's per-role SmartBrowz template
// (/api/export/pdf) rather than a single client-side window.print(). The button
// label reflects the current role's template; `scope`/`filters` let a page
// narrow the exported data (e.g. a case packet or a district summary).
export default function ExportButton({ scope, filters, label, title }) {
  const { role } = useAuth()
  const { sessionId } = useSession()
  const [busy, setBusy] = useState(false)

  const template = exportTemplateFor(role)
  const resolvedLabel = label ?? template.label

  const handleExport = async () => {
    if (busy) return
    setBusy(true)
    try {
      await exportRoleReport({ role, scope, sessionId, filters, title })
    } finally {
      setBusy(false)
    }
  }

  return (
    <RoleGate feature="export">
      <button className="export-btn" onClick={handleExport} disabled={busy} type="button">
        <Download size={14} />
        <span>{busy ? 'Preparing…' : resolvedLabel}</span>
      </button>
    </RoleGate>
  )
}
