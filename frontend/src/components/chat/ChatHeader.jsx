import { Layers } from 'lucide-react'
import { useSession } from '../../context/SessionContext'
import { useInvestigation } from '../../context/InvestigationContext'
import ExportButton from '../common/ExportButton'
import './ChatHeader.css'

export default function ChatHeader() {
  const { sessionId, language, setLanguage } = useSession()
  const { investigationStack, clearStack } = useInvestigation()

  return (
    <div className="chat-header">
      <span className="chat-header-session">Session ID: {sessionId.toUpperCase()}</span>
      <div className="chat-header-actions">
        {investigationStack.length > 0 && (
          <button
            type="button"
            className="chat-header-clear"
            onClick={clearStack}
            title="Clear investigation stack"
          >
            <Layers size={13} />
            Clear stack ({investigationStack.length})
          </button>
        )}
        <div className="lang-toggle" role="group" aria-label="Response language">
          <button
            className={`lang-toggle-pill ${language === 'en' ? 'active' : ''}`}
            onClick={() => setLanguage('en')}
            type="button"
          >
            EN
          </button>
          <button
            className={`lang-toggle-pill ${language === 'kn' ? 'active' : ''}`}
            onClick={() => setLanguage('kn')}
            type="button"
          >
            ಕನ್ನಡ
          </button>
        </div>
        <ExportButton scope="session" filters={{ sessionId }} />
      </div>
    </div>
  )
}
