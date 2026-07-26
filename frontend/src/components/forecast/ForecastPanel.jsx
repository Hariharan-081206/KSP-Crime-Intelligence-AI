import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import AnimatedNumber from '../common/AnimatedNumber'
import { runForecast, explainForecast } from '../../api/services/predictService'
import './ForecastPanel.css'

// Static selector options (UI config, not backend data). Adjust to match the
// districts/crime types the prediction service supports.
const DISTRICTS = [
  'Bengaluru Urban', 'Mysuru', 'Belagavi', 'Kalaburagi', 'Dakshina Kannada',
  'Ballari', 'Tumakuru', 'Dharwad', 'Shivamogga', 'Raichur',
]
const CRIME_TYPES = ['Theft', 'Cybercrime', 'Narcotics', 'Assault', 'Trafficking']

export default function ForecastPanel() {
  // Prefill from ?district= (set by the map's "Run forecast for this district"
  // action) when it matches a supported district; otherwise default.
  const [searchParams] = useSearchParams()
  const prefill = searchParams.get('district')
  const [district, setDistrict] = useState(DISTRICTS.includes(prefill) ? prefill : DISTRICTS[0])
  const [crimeType, setCrimeType] = useState(CRIME_TYPES[0])
  const [forecast, setForecast] = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState(null)

  const handleRun = async () => {
    setIsRunning(true)
    setError(null)
    try {
      const [pred, explain] = await Promise.all([
        runForecast({ district, crimeType }),
        explainForecast({ district, crimeType }).catch(() => null),
      ])
      setForecast({
        district: pred?.district ?? district,
        crimeType: pred?.crimeType ?? pred?.crime_type ?? crimeType,
        windowDays: pred?.windowDays ?? pred?.window_days ?? 30,
        predictedCount: pred?.predictedCount ?? pred?.predicted_count ?? 0,
        factors: explain?.factors ?? pred?.factors ?? [],
      })
    } catch {
      setForecast(null)
      setError('Forecast service is unavailable. Please try again.')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="forecast-panel">
      <div className="forecast-panel-header">
        <TrendingUp size={16} color="var(--color-maroon)" />
        <span>Early-Warning Forecast</span>
      </div>
      <div className="forecast-panel-controls">
        <select value={district} onChange={(e) => setDistrict(e.target.value)}>
          {DISTRICTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={crimeType} onChange={(e) => setCrimeType(e.target.value)}>
          {CRIME_TYPES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button className="forecast-run-btn" onClick={handleRun} disabled={isRunning} type="button">
          {isRunning ? 'Running...' : 'Run Forecast'}
        </button>
      </div>

      {error && <p className="forecast-error">{error}</p>}

      {forecast && (
        <div className="forecast-result">
          <div className="forecast-result-headline">
            <span className="forecast-result-count"><AnimatedNumber value={forecast.predictedCount} /></span>
            <span className="forecast-result-sub">
              predicted {String(forecast.crimeType).toLowerCase()} incidents in {forecast.district}, next {forecast.windowDays} days
            </span>
          </div>
          {forecast.factors.length > 0 && (
            <div className="forecast-factors">
              <span className="forecast-factors-title">Top contributing factors</span>
              {forecast.factors.map((f) => (
                <div key={f.label} className="forecast-factor-row">
                  <span className="forecast-factor-label">{f.label}</span>
                  <div className="forecast-factor-bar-track">
                    <div className="forecast-factor-bar-fill" style={{ width: `${f.weight * 100}%` }} />
                  </div>
                  <span className="forecast-factor-weight">{Math.round(f.weight * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
