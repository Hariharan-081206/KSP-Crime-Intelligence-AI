import './SimilarCasesList.css'

export default function SimilarCasesList({ cases }) {
  return (
    <div className="similar-cases">
      <span className="similar-cases-title">Similar Cases</span>
      <div className="similar-cases-list">
        {cases.map((c) => (
          <div key={c.id} className={`similar-case-card severity-${c.severity}`}>
            <div className="similar-case-top">
              <span className="similar-case-id">{c.id}</span>
              <span className="similar-case-similarity">{Math.round(c.similarity * 100)}% match</span>
            </div>
            <span className="similar-case-title">{c.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
