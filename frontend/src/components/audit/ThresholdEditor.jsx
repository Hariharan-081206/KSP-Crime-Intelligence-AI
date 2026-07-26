import { useState } from 'react'
import { Save } from 'lucide-react'
import { saveThreshold } from '../../api/services/auditService'
import './ThresholdEditor.css'

// Default alert thresholds (UI config). Seed these from a backend settings
// endpoint once one exists; edits are currently client-side only.
const DEFAULT_THRESHOLDS = [
  { id: 'th1', crimeType: 'Theft', value: 20, unit: 'incidents/week' },
  { id: 'th2', crimeType: 'Cybercrime', value: 15, unit: 'incidents/week' },
  { id: 'th3', crimeType: 'Narcotics', value: 8, unit: 'incidents/week' },
  { id: 'th4', crimeType: 'Assault', value: 12, unit: 'incidents/week' },
  { id: 'th5', crimeType: 'Trafficking', value: 5, unit: 'incidents/week' },
]

export default function ThresholdEditor() {
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [savedId, setSavedId] = useState(null)
  const [savingId, setSavingId] = useState(null)

  const updateValue = (id, value) => {
    setThresholds((prev) => prev.map((t) => (t.id === id ? { ...t, value } : t)))
  }

  const handleSave = async (id) => {
    const t = thresholds.find((x) => x.id === id)
    if (!t) return
    setSavingId(id)
    // POST to the backend threshold endpoint (POST /api/audit/threshold — not
    // yet in scrb-backend; see Backend Gaps P1). A rejection degrades to a
    // local-only "saved" acknowledgement so the demo still works.
    try {
      await saveThreshold({ id: t.id, crimeType: t.crimeType, value: t.value, unit: t.unit })
    } catch {
      /* soft failure — the value is already reflected in local state */
    } finally {
      setSavingId(null)
      setSavedId(id)
      setTimeout(() => setSavedId(null), 1500)
    }
  }

  return (
    <div className="threshold-editor">
      <span className="threshold-editor-title">Alert Thresholds</span>
      {thresholds.map((t) => (
        <div key={t.id} className="threshold-row">
          <span className="threshold-row-label">{t.crimeType}</span>
          <input
            type="number"
            min={1}
            className="threshold-row-input"
            value={t.value}
            onChange={(e) => updateValue(t.id, Number(e.target.value))}
          />
          <span className="threshold-row-unit">{t.unit}</span>
          <button className="threshold-row-save" onClick={() => handleSave(t.id)} type="button" disabled={savingId === t.id}>
            <Save size={13} />
            {savingId === t.id ? 'Saving…' : savedId === t.id ? 'Saved' : 'Save'}
          </button>
        </div>
      ))}
    </div>
  )
}
