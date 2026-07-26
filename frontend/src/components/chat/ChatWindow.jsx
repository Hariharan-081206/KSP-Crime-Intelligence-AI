import { useEffect, useRef } from 'react'
import { useChat } from '../../context/ChatContext'
import ChatHeader from './ChatHeader'
import UserMessage from './UserMessage'
import BotMessage from './BotMessage'
import TypingIndicator from './TypingIndicator'
import ChatInput from './ChatInput'
import './ChatWindow.css'

export default function ChatWindow() {
  const { messages, isTyping } = useChat()
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="chat-window">
      <ChatHeader />
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((message) =>
          message.role === 'user' ? (
            <UserMessage key={message.id} message={message} />
          ) : (
            <BotMessage key={message.id} message={message} />
          ),
        )}
        {isTyping && (
          <div className="bot-message-row">
            <TypingIndicator />
          </div>
        )}
      </div>
      <ChatInput />
    </div>
  )
}
