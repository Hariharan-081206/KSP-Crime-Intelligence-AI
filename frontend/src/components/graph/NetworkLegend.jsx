import './NetworkLegend.css'

export default function NetworkLegend() {
  return (
    <div className="network-legend">
      <div className="network-legend-group">
        <span className="network-legend-title">Node size / shade</span>
        <span className="network-legend-desc">Larger, darker nodes = higher network centrality</span>
      </div>
      <div className="network-legend-group">
        <span className="network-legend-title">Edges</span>
        <span className="network-legend-desc">Line thickness = strength of association</span>
      </div>
      <div className="network-legend-hint">Click a node for details · hover to trace connections</div>
    </div>
  )
}
