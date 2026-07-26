import { useState, useEffect } from 'react'
import PanelHeader from '../components/common/PanelHeader'
import ExportButton from '../components/common/ExportButton'
import BehavioralProfile from '../components/profile/BehavioralProfile'
import { useAsync } from '../hooks/useAsync'
import { getBehavioralProfile } from '../api/services/profileService'
import { useInvestigation } from '../context/InvestigationContext'
import './ProfilePage.css'

export default function ProfilePage() {
  const { accusedIds, activeAccusedId } = useInvestigation()
  // Tab strip of every accused pulled into the session, defaulting to the most
  // recent (§4). Falls back to the un-scoped profile when the stack is empty.
  const [selected, setSelected] = useState(activeAccusedId)

  useEffect(() => {
    if (activeAccusedId) setSelected(activeAccusedId)
  }, [activeAccusedId])

  // Un-scoped calls are pointless: GET /profile/behavioral answers 400 ("An
  // accused id is required") without one, which surfaced as a red "could not
  // load" error on a page the user had done nothing wrong on. No accused in the
  // session is an empty state, not a failure — so don't make the request.
  const { data, loading, error, reload } = useAsync(
    () => (selected ? getBehavioralProfile({ accusedId: selected }) : Promise.resolve(null)),
    [selected],
  )

  return (
    <div className="profile-page">
      <PanelHeader title="Behavioral Profile" actions={<ExportButton scope="profile" />} />
      {accusedIds.length > 0 && (
        <div className="profile-tabs" role="tablist" aria-label="Accused in this investigation">
          {accusedIds.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected === id}
              className={`profile-tab ${selected === id ? 'active' : ''}`}
              onClick={() => setSelected(id)}
            >
              {id}
            </button>
          ))}
        </div>
      )}
      <div className="profile-page-body">
        {!selected && (
          <p className="profile-page-state">
            No accused selected. Open a case or ask about a suspect in chat, and the profile for
            each accused pulled into the session appears here.
          </p>
        )}
        {selected && loading && <p className="profile-page-state">Loading profile…</p>}
        {!loading && error && (
          <div className="profile-page-state profile-page-state-error">
            <p>Could not load the behavioral profile.</p>
            <button type="button" onClick={reload}>Retry</button>
          </div>
        )}
        {selected && !loading && !error && !data && (
          <p className="profile-page-state">No profile data available.</p>
        )}
        {!loading && !error && data && <BehavioralProfile profile={data} />}
      </div>
    </div>
  )
}
