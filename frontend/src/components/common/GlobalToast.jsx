import { useEffect, useState } from 'react'
import './GlobalToast.css'

// App-wide, dependency-free toast for backend errors surfaced by apiClient's
// response interceptor (`scrb:api-error`). Purely presentational; auto-dismiss.
export default function GlobalToast() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const onError = (e) => {
      const id = Date.now() + Math.random()
      const message = e?.detail?.message || 'Something went wrong.'
      setToasts((prev) => [...prev, { id, message }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 5000)
    }
    window.addEventListener('scrb:api-error', onError)
    return () => window.removeEventListener('scrb:api-error', onError)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="global-toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="global-toast">{t.message}</div>
      ))}
    </div>
  )
}
