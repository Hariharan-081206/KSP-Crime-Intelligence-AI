import { useState } from 'react'
import { Mic, Send } from 'lucide-react'
import { useChat } from '../../context/ChatContext'
import { useSession } from '../../context/SessionContext'
import { useVoice } from '../../hooks/useVoice'
import './ChatInput.css'

export default function ChatInput() {
  const [text, setText] = useState('')
  const { sendMessage } = useChat()
  const { language } = useSession()
  const { isRecording, startRecording, stopRecording } = useVoice((transcript) => {
    if (transcript) setText((prev) => (prev ? `${prev} ${transcript}` : transcript))
  })

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    sendMessage(trimmed, language)
    setText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const toggleRecording = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  return (
    <div className="chat-input-bar">
      <button
        className={`chat-input-mic ${isRecording ? 'recording' : ''}`}
        onClick={toggleRecording}
        title={isRecording ? 'Stop recording' : 'Start voice input'}
        type="button"
      >
        <Mic size={18} />
      </button>
      <textarea
        className="chat-input-textarea"
        placeholder={language === 'kn' ? 'ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಟೈಪ್ ಮಾಡಿ...' : 'Ask about crime trends, cases, or networks...'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />
      <button className="chat-input-send" onClick={handleSend} title="Send" type="button">
        <Send size={16} />
      </button>
    </div>
  )
}
