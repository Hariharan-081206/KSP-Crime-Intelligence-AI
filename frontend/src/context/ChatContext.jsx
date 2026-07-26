import { createContext, useContext, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useSession } from './SessionContext'
import { useAuth } from './AuthContext'
import { useInvestigation } from './InvestigationContext'
import { postQuery } from '../api/services/queryService'

const ChatContext = createContext(null)

const GREETING = {
  id: 'greeting',
  role: 'bot',
  text: 'Welcome to the SCRB Crime Intelligence Assistant. Ask me about crime trends, hotspot maps, network links, or a specific case.',
  timestamp: Date.now(),
  intent: 'greeting',
}

// Map an (unconfirmed) /api/query response into the bot-message shape the UI
// renders. Defensive: tolerates missing keys so the chat never crashes.
// TODO: tighten once the API Gateway response contract is confirmed.
function toBotMessage(data) {
  const text =
    data?.text ??
    data?.answer ??
    data?.response ??
    'No response text was returned.'
  const intent = data?.classification?.intent ?? data?.intent ?? 'general_query'
  return {
    id: uuidv4(),
    role: 'bot',
    text,
    timestamp: Date.now(),
    intent,
    panel: data?.panel ?? null,
    reasoning: data?.reasoning ?? null,
    caseId: data?.caseId ?? data?.case_id ?? null,
  }
}

export function ChatProvider({ children }) {
  const { sessionId, language } = useSession()
  const { role } = useAuth()
  const { pushFromQueryResponse } = useInvestigation()
  const [messages, setMessages] = useState([GREETING])
  const [isTyping, setIsTyping] = useState(false)
  const [activePanel, setActivePanel] = useState(null) // { type: 'map' | 'network', data }

  const sendMessage = async (text, lang = language) => {
    const userMessage = { id: uuidv4(), role: 'user', text, timestamp: Date.now() }
    setMessages((prev) => [...prev, userMessage])
    setIsTyping(true)

    try {
      const data = await postQuery({ sessionId, query: text, language: lang, role })
      const botMessage = toBotMessage(data)
      setMessages((prev) => [...prev, botMessage])
      if (botMessage.panel) setActivePanel(botMessage.panel)
      // Drive cross-page reactivity: push any resolved case/accused/district
      // slots onto the shared investigation stack (see InvestigationContext).
      pushFromQueryResponse(data)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: 'bot',
          text: 'Sorry — I could not reach the intelligence service. Please try again.',
          timestamp: Date.now(),
          intent: 'error',
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  const value = useMemo(
    () => ({ messages, isTyping, sendMessage, activePanel, setActivePanel }),
    // sendMessage is recreated each render but closes over stable context values
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, isTyping, activePanel],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
