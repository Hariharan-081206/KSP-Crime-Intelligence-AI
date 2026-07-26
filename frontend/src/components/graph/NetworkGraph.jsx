import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import CytoscapeComponent from 'react-cytoscapejs'
import { useAuth } from '../../context/AuthContext'
import { maskForRole } from '../../utils/maskForRole'
import { ROLES } from '../../utils/roles'
import { buildCriminalNetworkStylesheet, COSE_LAYOUT } from './cytoscapeStyles'
import NodeInfoPanel from './NodeInfoPanel'
import './NetworkGraph.css'

export default function NetworkGraph({ data, compact = false }) {
  const { role } = useAuth()
  const [selectedNode, setSelectedNode] = useState(null)
  const cyRef = useRef(null)

  // Escalation-risk borders are investigator-only (spec Section 5). For other
  // roles we never place escalation into node data, so it can't be surfaced.
  const showEscalation = role === ROLES.INVESTIGATOR

  const elements = useMemo(() => {
    const nodes = (data?.nodes ?? []).map((node) => ({
      data: {
        id: node.id,
        // TODO(security): client-side masking only — production masking belongs server-side.
        label: node.type === 'accused' ? maskForRole(node.name, role, { idSeed: node.id }) : node.name,
        centrality: node.centrality,
        type: node.type,
        description: node.description,
        escalation: showEscalation ? (node.escalation_risk ?? node.escalationRisk ?? null) : null,
      },
    }))
    const edges = (data?.edges ?? []).map((edge, idx) => ({
      data: {
        id: `e${idx}`,
        source: edge.source,
        target: edge.target,
        weight: edge.weight,
        type: edge.type,
      },
    }))
    return [...nodes, ...edges]
  }, [data, role, showEscalation])

  const stylesheet = buildCriminalNetworkStylesheet({ showEscalation })

  const bindEvents = useCallback(
    (cy) => {
      if (!cy || cy === cyRef.current) return
      cyRef.current = cy

      cy.on('tap', 'node', (evt) => {
        if (compact) return
        const node = evt.target
        cy.elements().removeClass('selected-node')
        node.addClass('selected-node')
        setSelectedNode(node.data())
      })

      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          cy.elements().removeClass('selected-node')
          setSelectedNode(null)
        }
      })

      cy.on('mouseover', 'node', (evt) => {
        const node = evt.target
        const neighborhood = node.closedNeighborhood()
        cy.elements().difference(neighborhood).addClass('faded')
        neighborhood.addClass('highlighted')
      })

      cy.on('mouseout', 'node', () => {
        cy.elements().removeClass('faded').removeClass('highlighted')
      })
    },
    [compact],
  )

  // Cytoscape's cose layout keeps animating after unmount unless stopped —
  // otherwise its rAF tick fires cy.notify() on an already-destroyed core.
  useEffect(() => {
    return () => {
      if (cyRef.current && !cyRef.current.destroyed()) {
        cyRef.current.stop()
      }
      cyRef.current = null
    }
  }, [])

  return (
    <div className={`network-graph ${compact ? 'compact' : ''}`}>
      <CytoscapeComponent
        elements={elements}
        stylesheet={stylesheet}
        layout={COSE_LAYOUT}
        style={{ width: '100%', height: '100%' }}
        cy={bindEvents}
      />
      {!compact && <NodeInfoPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
    </div>
  )
}
