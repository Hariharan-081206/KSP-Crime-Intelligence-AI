import './IntentBadge.css'

const INTENT_LABELS = {
  greeting: 'Greeting',
  'crime-trend': 'Crime Trend',
  'network-analysis': 'Network Analysis',
  'case-lookup': 'Case Lookup',
  'general-query': 'General Query',
}

export default function IntentBadge({ intent }) {
  if (!intent) return null
  return <span className="intent-badge">{INTENT_LABELS[intent] || intent}</span>
}
