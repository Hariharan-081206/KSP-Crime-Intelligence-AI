import './PanelHeader.css'

// Generic panel title bar. `tabs` (optional) renders a set of pill tabs
// instead of a plain title.
export default function PanelHeader({ title, tabs, activeTab, onTabChange, actions }) {
  return (
    <div className="panel-header">
      {tabs ? (
        <div className="panel-header-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`panel-header-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => onTabChange?.(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : (
        <h2 className="panel-header-title">{title}</h2>
      )}
      {actions && <div className="panel-header-actions">{actions}</div>}
    </div>
  )
}
