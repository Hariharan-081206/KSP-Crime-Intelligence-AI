import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Pin, FileText, Search, TrendingUp } from 'lucide-react'
import { getDistrictDetail } from '../../api/services/mapService'
import { useSession } from '../../context/SessionContext'
import { useChat } from '../../context/ChatContext'
import { exportRoleReport } from '../../utils/exportReport'
import { ROLES } from '../../utils/roles'
import './DistrictDetailCard.css'

const NOT_AVAILABLE = Symbol('not-available')
const CACHE_LIMIT = 8
const DEBOUNCE_MS = 150

function Skeleton() {
  return (
    <div className="district-card-skeleton" aria-hidden="true">
      <span className="district-card-skeleton-line w-70" />
      <span className="district-card-skeleton-line w-40" />
      <span className="district-card-skeleton-line w-90" />
      <span className="district-card-skeleton-line w-55" />
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="district-card-stat">
      <span className="district-card-stat-value">{value ?? '—'}</span>
      <span className="district-card-stat-label">{label}</span>
    </div>
  )
}

// Session-scoped cache of the last CACHE_LIMIT district responses. useRef (not
// localStorage): Catalyst-side caching handles the durable layer.
export default function DistrictDetailCard({ district, role, pinned = false, onClose }) {
  const navigate = useNavigate()
  const { sessionId } = useSession()
  const { sendMessage } = useChat()
  const cacheRef = useRef(new Map())
  const [state, setState] = useState({ status: 'idle', data: null })

  const districtId = district?.id
  const districtName = district?.name

  useEffect(() => {
    if (districtId == null) return undefined
    const cache = cacheRef.current

    if (cache.has(districtId)) {
      const cached = cache.get(districtId)
      setState(cached === NOT_AVAILABLE ? { status: 'unavailable', data: null } : { status: 'ready', data: cached })
      return undefined
    }

    let alive = true
    setState({ status: 'loading', data: null })

    const put = (val) => {
      if (cache.has(districtId)) cache.delete(districtId)
      cache.set(districtId, val)
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
    }

    // 150ms debounce so sweeping the mouse across districts doesn't spam fetches.
    const timer = setTimeout(() => {
      getDistrictDetail(districtId)
        .then((data) => {
          if (!alive) return
          put(data)
          setState({ status: 'ready', data })
        })
        .catch((err) => {
          if (!alive) return
          if (err?.response?.status === 404) {
            put(NOT_AVAILABLE)
            setState({ status: 'unavailable', data: null })
          } else {
            setState({ status: 'error', data: null })
          }
        })
    }, DEBOUNCE_MS)

    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [districtId])

  if (districtId == null) return null

  const d = state.data ?? {}
  const name = d.districtName ?? districtName
  const isInvestigator = role === ROLES.INVESTIGATOR
  const isAnalyst = role === ROLES.ANALYST
  const isPolicymaker = role === ROLES.POLICYMAKER
  // topCrimeTypes + dominantCluster are investigator/analyst only (not policymaker).
  const showDetail = isInvestigator || isAnalyst

  const handleSummaryExport = () => {
    exportRoleReport({
      role,
      scope: 'district',
      sessionId,
      filters: { districtId, districtName: name },
      title: `District summary — ${name}`,
    })
  }

  const handleShowCases = () => {
    sendMessage(`Show recent cases in ${name} district`)
    navigate('/')
  }

  const handleRunForecast = () => {
    navigate(`/alerts?district=${encodeURIComponent(name)}`)
  }

  return (
    <div className={`district-detail-card ${pinned ? 'pinned' : ''}`} role="dialog" aria-label={`District detail: ${name}`}>
      <div className="district-card-header">
        <div className="district-card-heading">
          <span className="district-card-name">{name}</span>
          {pinned && (
            <span className="district-card-pin">
              <Pin size={11} /> Pinned
            </span>
          )}
        </div>
        {pinned && (
          <button className="district-card-close" onClick={onClose} title="Close" type="button">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="district-card-body">
        {state.status === 'loading' && <Skeleton />}

        {state.status === 'unavailable' && (
          <p className="district-card-note">District data not yet available from backend.</p>
        )}

        {state.status === 'error' && (
          <p className="district-card-note district-card-note-error">Could not load district data.</p>
        )}

        {state.status === 'ready' && (
          <>
            <div className="district-card-stats">
              <Stat label="Incidents" value={d.totalIncidents} />
              <Stat label="Active alerts" value={d.activeAlerts} />
            </div>

            {(d.forecastNext7d ?? null) !== null && (
              <div className="district-card-forecast">
                <TrendingUp size={13} />
                <span>Next 7 days: <strong>{d.forecastNext7d}</strong></span>
              </div>
            )}

            {showDetail && d.dominantCluster && (
              <div className="district-card-cluster">Dominant cluster: <strong>{d.dominantCluster}</strong></div>
            )}

            {showDetail && Array.isArray(d.topCrimeTypes) && d.topCrimeTypes.length > 0 && (
              <div className="district-card-crimes">
                <span className="district-card-subtitle">Top crime types</span>
                <ul>
                  {d.topCrimeTypes.map((c) => (
                    <li key={c.code}>
                      <span>{c.code}</span>
                      <span className="district-card-crime-count">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.lastUpdated && (
              <span className="district-card-updated">Updated {new Date(d.lastUpdated).toLocaleDateString('en-IN')}</span>
            )}
          </>
        )}

        {/* Role-scoped action — rendered even while data loads (name is known). */}
        <div className="district-card-actions">
          {isPolicymaker && (
            <button className="district-card-action" onClick={handleSummaryExport} type="button">
              <FileText size={13} /> View summary report
            </button>
          )}
          {isInvestigator && (
            <button className="district-card-action" onClick={handleShowCases} type="button">
              <Search size={13} /> Show cases in this district
            </button>
          )}
          {isAnalyst && (
            <button className="district-card-action" onClick={handleRunForecast} type="button">
              <TrendingUp size={13} /> Run forecast for this district
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
