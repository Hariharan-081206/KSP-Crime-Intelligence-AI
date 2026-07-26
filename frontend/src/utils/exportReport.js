import { exportPdf } from '../api/services/exportService'
import { exportTemplateFor } from './exportTemplates'

// Shared export driver used by ExportButton and the map district card.
// Requests a backend-generated, per-role PDF from /api/export/pdf and downloads
// it. Falls back to window.print() ONLY on failure, with a console warning that
// the client fallback is not spec-compliant (it can't produce the per-role
// SmartBrowz template — see spec §7.12).
export async function exportRoleReport({ role, scope, sessionId, filters, title } = {}) {
  const template = exportTemplateFor(role)
  try {
    const blob = await exportPdf({
      role,
      scope: scope ?? template.key,
      sessionId,
      filters,
      title,
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scrb-${template.key}-report.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return true
  } catch (err) {
    console.warn(
      '[export] Backend PDF export failed; falling back to window.print(). ' +
        'This client fallback is NOT spec-compliant — it cannot produce the ' +
        'per-role SmartBrowz template (spec §7.12).',
      err,
    )
    window.print()
    return false
  }
}
