import { createContext, useContext, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [sessionId] = useState(() => uuidv4())
  const [language, setLanguage] = useState('en') // 'en' | 'kn'

  const value = useMemo(
    () => ({ sessionId, language, setLanguage }),
    [sessionId, language],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
