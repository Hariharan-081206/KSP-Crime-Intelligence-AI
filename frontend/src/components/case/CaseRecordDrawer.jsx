import { useState } from 'react'
import { X, RefreshCw, Copy, Database, ChevronDown, ChevronRight } from 'lucide-react'
import { useInvestigation } from '../../context/InvestigationContext'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { getCaseRecord } from '../../api/services/caseRecordService'
import { maskForRole } from '../../utils/maskForRole'
import './CaseRecordDrawer.css'

// Field names whose values are PII and must be masked per role.
// TODO(security): client-side masking is a demo convenience only. Production
// masking MUST happen server-side before the record ever reaches the browser.
const PII_FIELDS = new Set([
  'AccusedName', 'VictimName', 'name', 'ComplainantName',
])
const ID_SEED_FIELDS = new Set(['AccusedMasterID', 'VictimMasterID', 'ComplainantID'])

// Ordered relation sections mirroring the spec's DB relations (§5).
const SECTIONS = [
  { key: 'case_master', title: 'CaseMaster', kind: 'object' },
  { key: 'accused', title: 'Accused', kind: 'array' },
  { key: 'victim', title: 'Victim', kind: 'array' },
  { key: 'arrest_surrender', title: 'ArrestSurrender', kind: 'array' },
  { key: 'chargesheet_details', title: 'ChargesheetDetails', kind: 'array' },
  { key: 'complainant', title: 'ComplainantDetails', kind: 'object' },
  { key: 'acts_sections', title: 'Act / Section', kind: 'array' },
]

function maskCell(field, value, role) {
  if (value == null) return '—'
  if (PII_FIELDS.has(field)) return maskForRole(value, role)
  return String(value)
}

function ObjectTable({ obj, role }) {
  const entries = Object.entries(obj).filter(([k]) => !k.startsWith('_'))
  if (entries.length === 0) return <p className="crd-empty">No data.</p>
  return (
    <table className="crd-table">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td className="crd-mono">{maskCell(k, v, role)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ArrayTable({ rows, role }) {
  if (!Array.isArray(rows) || rows.length === 0) return <p className="crd-empty">No rows.</p>
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => !c.startsWith('_'))
  return (
    <div className="crd-table-scroll">
      <table className="crd-table crd-table-grid">
        <thead>
          <tr>{cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const seed = ID_SEED_FIELDS.has(c) ? r[c] : undefined
                const val = PII_FIELDS.has(c) ? maskForRole(r[c], role, { idSeed: seed }) : (r[c] == null ? '—' : String(r[c]))
                return <td key={c} className="crd-mono">{val}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({ title, kind, data, role }) {
  const [open, setOpen] = useState(true)
  const count = kind === 'array' ? (Array.isArray(data) ? data.length : 0) : (data ? 1 : 0)
  return (
    <div className="crd-section">
      <button type="button" className="crd-section-head" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="crd-section-title">{title}</span>
        <span className="crd-section-count">{count}</span>
      </button>
      {open && (
        <div className="crd-section-body">
          {kind === 'array'
            ? <ArrayTable rows={data} role={role} />
            : (data ? <ObjectTable obj={data} role={role} /> : <p className="crd-empty">No data.</p>)}
        </div>
      )}
    </div>
  )
}

export default function CaseRecordDrawer() {
  const { drawerOpen, closeDrawer, activeCaseId, hasContext } = useInvestigation()
  const { role } = useAuth()
  const [copied, setCopied] = useState(false)

  // Only fetch while the drawer is open (it stays mounted in AppShell) to avoid
  // background requests for every case the chat resolves.
  const { data, loading, error, reload } = useAsync(
    () => (drawerOpen && activeCaseId ? getCaseRecord(activeCaseId) : Promise.resolve(null)),
    [activeCaseId, drawerOpen],
  )

  if (!drawerOpen) return null

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <>
      <div className="crd-scrim" onClick={closeDrawer} aria-hidden="true" />
      <aside className="crd-drawer" role="dialog" aria-label={`Case record ${activeCaseId || ''}`}>
        <header className="crd-head">
          <div className="crd-head-title">
            <Database size={16} />
            <span>Case Record{activeCaseId ? ` — ${activeCaseId}` : ''}</span>
          </div>
          <div className="crd-head-actions">
            <button type="button" onClick={reload} title="Refresh" disabled={!activeCaseId}><RefreshCw size={15} /></button>
            <button type="button" onClick={copyJson} title="Copy JSON" disabled={!data}><Copy size={15} /></button>
            <button type="button" onClick={closeDrawer} title="Close"><X size={16} /></button>
          </div>
        </header>

        {copied && <div className="crd-toast">Copied JSON to clipboard</div>}

        <div className="crd-body">
          {!activeCaseId && (
            <div className="crd-state">
              <p><strong>No active case.</strong></p>
              <p>Ask about a case in chat to load its record.</p>
              {!hasContext && <p className="crd-hint">e.g. “Show me case CR/2024/04471”.</p>}
            </div>
          )}
          {activeCaseId && loading && <div className="crd-state">Loading record for {activeCaseId}…</div>}
          {activeCaseId && !loading && error && (
            <div className="crd-state crd-state-error">
              <p>Could not load the case record.</p>
              <p className="crd-hint">GET /api/case/{activeCaseId}/record is not yet available from the backend.</p>
              <button type="button" onClick={reload}>Retry</button>
            </div>
          )}
          {activeCaseId && !loading && !error && data && (
            <>
              {data._demo && <div className="crd-demo-badge">Demo data (VITE_DEMO_MODE)</div>}
              {SECTIONS.map((s) => (
                <Section key={s.key} title={s.title} kind={s.kind} data={data[s.key]} role={role} />
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  )
}
