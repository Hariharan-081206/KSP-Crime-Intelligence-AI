import { X, User, MapPin } from 'lucide-react'
import './NodeInfoPanel.css'

const TYPE_ICON = { accused: User, location: MapPin }
const TYPE_LABEL = { accused: 'Accused', location: 'Location' }

export default function NodeInfoPanel({ node, onClose }) {
  if (!node) return null
  const Icon = TYPE_ICON[node.type] || User

  return (
    <div className="node-info-panel">
      <button className="node-info-close" onClick={onClose} title="Close" type="button">
        <X size={14} />
      </button>
      <div className="node-info-header">
        <div className="node-info-icon">
          <Icon size={16} />
        </div>
        <div>
          <span className="node-info-name">{node.label}</span>
          <span className="node-info-type">{TYPE_LABEL[node.type] || node.type}</span>
        </div>
      </div>
      <p className="node-info-desc">{node.description || 'No additional details available.'}</p>
      <div className="node-info-stat">
        <span>Centrality score</span>
        <div className="node-info-stat-track">
          <div className="node-info-stat-fill" style={{ width: `${Math.round((node.centrality ?? 0) * 100)}%` }} />
        </div>
        <span className="node-info-stat-value">{Math.round((node.centrality ?? 0) * 100)}%</span>
      </div>
    </div>
  )
}
