import { lazy, Suspense } from 'react'
import ChatWindow from '../components/chat/ChatWindow'
import './ChatPage.css'

// RightPanel renders the compact CrimeMap (Leaflet) + NetworkGraph (Cytoscape)
// previews. Lazy-loading it here keeps those heavy libs out of the entry chunk
// so the chat home paints without waiting on them; the previews stream in.
const RightPanel = lazy(() => import('../components/chat/RightPanel'))

export default function ChatPage() {
  return (
    <div className="chat-page">
      <ChatWindow />
      <Suspense fallback={<div className="right-panel-loading" />}>
        <RightPanel />
      </Suspense>
    </div>
  )
}
