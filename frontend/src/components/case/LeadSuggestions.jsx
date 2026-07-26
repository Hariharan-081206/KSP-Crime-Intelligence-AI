import { Lightbulb } from 'lucide-react'
import './LeadSuggestions.css'

export default function LeadSuggestions({ leads }) {
  return (
    <div className="lead-suggestions">
      <div className="lead-suggestions-title">
        <Lightbulb size={15} color="var(--color-maroon)" />
        <span>Investigative Lead Suggestions</span>
      </div>
      <ul className="lead-suggestions-list">
        {leads.map((lead) => (
          <li key={lead}>{lead}</li>
        ))}
      </ul>
    </div>
  )
}
