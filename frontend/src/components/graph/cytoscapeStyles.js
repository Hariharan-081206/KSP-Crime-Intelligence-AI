// Centrality maps to node color/size; edge weight maps to width.

const CENTRALITY_COLORS = [
  { min: 0.7, color: '#4A1942' },
  { min: 0.5, color: '#8E4B8C' },
  { min: 0.3, color: '#B58BC0' },
  { min: 0, color: '#D9A9D4' },
]

function colorForCentrality(centrality) {
  return CENTRALITY_COLORS.find((c) => centrality >= c.min)?.color ?? CENTRALITY_COLORS.at(-1).color
}

function sizeForCentrality(centrality) {
  return 28 + centrality * 42
}

// `showEscalation` (investigator only) adds a maroon border weighted by each
// node's escalation_risk. For analyst/policymaker the rules are omitted, so
// borders stay neutral even if escalation data leaks into node.data.
export function buildCriminalNetworkStylesheet({ showEscalation = false } = {}) {
  const escalationRules = showEscalation
    ? [
        {
          selector: 'node[escalation = "high"]',
          style: { 'border-color': '#4A1942', 'border-width': 4 },
        },
        {
          selector: 'node[escalation = "medium"]',
          style: { 'border-color': '#8E4B8C', 'border-width': 3 },
        },
      ]
    : []

  return [
    {
      selector: 'node',
      style: {
        'background-color': (ele) => colorForCentrality(ele.data('centrality') ?? 0),
        width: (ele) => sizeForCentrality(ele.data('centrality') ?? 0),
        height: (ele) => sizeForCentrality(ele.data('centrality') ?? 0),
        label: 'data(label)',
        color: '#1A1A1A',
        'font-size': 10,
        'text-valign': 'bottom',
        'text-margin-y': 6,
        'border-width': 2,
        'border-color': '#FFFFFF',
        'transition-property': 'opacity, border-width, border-color',
        'transition-duration': 150,
      },
    },
    {
      selector: 'edge',
      style: {
        width: (ele) => 1 + (ele.data('weight') ?? 1) * 0.6,
        'line-color': '#C9A7D1',
        'target-arrow-color': '#C9A7D1',
        'curve-style': 'bezier',
        opacity: 0.8,
        'transition-property': 'opacity, line-color, width',
        'transition-duration': 150,
      },
    },
    ...escalationRules,
    {
      selector: 'node.faded, edge.faded',
      style: { opacity: 0.12 },
    },
    {
      selector: 'node.highlighted',
      style: {
        'border-width': 3,
        'border-color': '#4A1942',
      },
    },
    {
      selector: 'edge.highlighted',
      style: {
        'line-color': '#4A1942',
        'target-arrow-color': '#4A1942',
        width: (ele) => 2 + (ele.data('weight') ?? 1) * 0.6,
        opacity: 1,
      },
    },
    {
      selector: 'node.selected-node',
      style: {
        'border-width': 4,
        'border-color': '#B58BC0',
      },
    },
  ]
}

// animate: false — cose's rAF-driven animation can outlive a fast route
// change/unmount and throw on the destroyed cytoscape core. The hover/click
// interactions (transition-duration in the stylesheet) still feel dynamic
// without that risk.
export const COSE_LAYOUT = {
  name: 'cose',
  animate: false,
  padding: 30,
  nodeRepulsion: 9000,
  idealEdgeLength: 100,
  gravity: 0.35,
}
