import { useParams } from 'react-router-dom'
import PanelHeader from '../components/common/PanelHeader'
import ExportButton from '../components/common/ExportButton'
import CaseSummaryPanel from '../components/case/CaseSummaryPanel'
import InvestigationTimeline from '../components/case/InvestigationTimeline'
import SimilarCasesList from '../components/case/SimilarCasesList'
import LeadSuggestions from '../components/case/LeadSuggestions'
import { useAsync } from '../hooks/useAsync'
import { getCaseSummary, getSimilarCases, getCaseLeads } from '../api/services/caseService'
import './CaseDetailPage.css'

export default function CaseDetailPage() {
  const { caseId } = useParams()
  const { data: caseData, loading, error, reload } = useAsync(() => getCaseSummary(caseId), [caseId])
  // Similar cases & leads are supplementary — failures degrade to empty lists.
  const { data: similar } = useAsync(() => getSimilarCases(caseId).catch(() => []), [caseId])
  const { data: leads } = useAsync(() => getCaseLeads(caseId).catch(() => []), [caseId])

  if (loading) {
    return (
      <div className="case-detail-page">
        <PanelHeader title="Investigator Decision Support" />
        <p className="case-detail-empty">Loading case {caseId}…</p>
      </div>
    )
  }

  if (error || !caseData) {
    return (
      <div className="case-detail-page">
        <PanelHeader title="Case Unavailable" />
        <div className="case-detail-empty">
          <p>Could not load case record {caseId}.</p>
          <button type="button" onClick={reload}>Retry</button>
        </div>
      </div>
    )
  }

  const similarList = Array.isArray(similar) ? similar : similar?.cases ?? []
  const leadsList = Array.isArray(leads) ? leads : leads?.leads ?? []

  return (
    <div className="case-detail-page">
      <PanelHeader title="Investigator Decision Support" actions={<ExportButton scope="case" filters={{ caseId }} />} />
      <div className="case-detail-body">
        <CaseSummaryPanel caseData={caseData} />
        <InvestigationTimeline timeline={caseData.timeline ?? []} />
        <div className="case-detail-grid">
          <SimilarCasesList cases={similarList} />
          <LeadSuggestions leads={leadsList} />
        </div>
      </div>
    </div>
  )
}
