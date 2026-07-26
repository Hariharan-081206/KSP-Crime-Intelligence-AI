import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Volume2, GitBranch, FileSearch } from 'lucide-react'
import IntentBadge from './IntentBadge'
import ReasoningTrace from '../reasoning/ReasoningTrace'
import RoleGate from '../common/RoleGate'
import { useAuth } from '../../context/AuthContext'
import { useSession } from '../../context/SessionContext'
import { roleCan } from '../../utils/roles'
import { textToSpeech } from '../../api/services/voiceService'
import './BotMessage.css'

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export default function BotMessage({ message }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [showReasoning, setShowReasoning] = useState(false)
  const { role } = useAuth()
  const { language } = useSession()
  const navigate = useNavigate()
  const audioRef = useRef(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
      }
    }
  }, [])

  const togglePlayback = async () => {
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    try {
      const blob = await textToSpeech({ text: message.text, language })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setIsPlaying(false)
      await audio.play()
    } catch {
      // TTS unavailable — reset control without crashing.
      setIsPlaying(false)
    }
  }

  return (
    <div className="bot-message-row">
      <div className="bot-message-card">
        <div className="bot-message-header">
          <span className="bot-message-sender">SCRB Assistant</span>
          <span className="bot-message-time">{formatTime(message.timestamp)}</span>
          <div className="bot-message-header-right">
            <IntentBadge intent={message.intent} />
            <button
              className={`bot-message-icon-btn ${isPlaying ? 'active' : ''}`}
              onClick={togglePlayback}
              title={isPlaying ? 'Playing response audio' : 'Play response audio'}
              type="button"
            >
              <Volume2 size={14} />
            </button>
          </div>
        </div>
        <p className="bot-message-text">{message.text}</p>

        {message.caseId && (
          <RoleGate feature="case-detail">
            <button className="bot-message-case-link" onClick={() => navigate(`/case/${message.caseId}`)} type="button">
              <FileSearch size={13} />
              View Case {message.caseId}
            </button>
          </RoleGate>
        )}

        {roleCan(role, 'reasoning') && message.reasoning && (
          <button className="bot-message-reasoning-toggle" onClick={() => setShowReasoning((v) => !v)} type="button">
            <GitBranch size={13} />
            {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
          </button>
        )}
        {showReasoning && <ReasoningTrace steps={message.reasoning} />}
      </div>
    </div>
  )
}
