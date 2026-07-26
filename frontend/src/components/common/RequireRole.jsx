import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { roleCan } from '../../utils/roles'

// Route-level guard: redirects disallowed roles back to the chat home.
export default function RequireRole({ feature, children }) {
  const { role } = useAuth()
  if (!roleCan(role, feature)) return <Navigate to="/" replace />
  return children
}
