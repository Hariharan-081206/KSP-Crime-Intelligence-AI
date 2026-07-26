import { useAuth } from '../../context/AuthContext'
import { roleCan } from '../../utils/roles'

// Renders children only if the current role has the given permission.
// Pass `fallback` to render something else instead (e.g. a disabled state).
export default function RoleGate({ feature, children, fallback = null }) {
  const { role } = useAuth()
  if (!roleCan(role, feature)) return fallback
  return children
}
