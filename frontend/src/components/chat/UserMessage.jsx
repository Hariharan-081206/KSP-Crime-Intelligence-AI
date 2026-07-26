import './UserMessage.css'

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export default function UserMessage({ message }) {
  return (
    <div className="user-message-row">
      <div className="user-message-card">
        <div className="user-message-header">
          <span className="user-message-sender">You</span>
          <span className="user-message-time">{formatTime(message.timestamp)}</span>
        </div>
        <p className="user-message-text">{message.text}</p>
      </div>
    </div>
  )
}
