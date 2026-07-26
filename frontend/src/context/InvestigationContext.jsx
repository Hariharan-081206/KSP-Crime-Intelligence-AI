import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSession } from './SessionContext'
import { parseInvestigationSlots } from '../utils/parseInvestigationSlots'

// ---------------------------------------------------------------------------
// Investigation context — the chat is the driver, this is the shared bus every
// other page subscribes to (see PRE_DEPLOY_REPORT.md §4).
//
// The stack is CUMULATIVE ("accumulate and stack", not "replace and forget"):
// each resolved query pushes a new frame; older frames stay visible-but-dimmed
// in the UI. Persisted to sessionStorage keyed by session_id so navigation
// between pages within a live session keeps context. NOTE: a full page refresh
// does NOT restore it — auth is session-only (AuthContext), so a reload logs the
// user out and mints a fresh session_id by design; the orphaned key is ignored.
// Cleared on logout and on "Clear stack".
// ---------------------------------------------------------------------------

const InvestigationContext = createContext(null)

const storageKey = (sessionId) => `scrb:investigation:${sessionId}`

const EMPTY = {
  activeCaseId: null,
  activeAccusedId: null,
  activeDistrict: null,
  investigationStack: [],
  lastQueryIntent: null,
}

function loadFromStorage(sessionId) {
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId))
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    return { ...EMPTY, ...parsed, lastResponsePayload: undefined }
  } catch {
    return EMPTY
  }
}

// Most-recent non-null value for a field, scanning newest → oldest.
function latest(stack, field) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i][field]) return stack[i][field]
  }
  return null
}

export function InvestigationProvider({ children }) {
  const { sessionId } = useSession()
  const [state, setState] = useState(() => loadFromStorage(sessionId))
  // Transient (not persisted): the full last response payload for panels/debug.
  const [lastResponsePayload, setLastResponsePayload] = useState(null)
  // DB record drawer (§5) open state lives here since it keys off activeCaseId.
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Persist the durable slice whenever it changes.
  useEffect(() => {
    try {
      const { activeCaseId, activeAccusedId, activeDistrict, investigationStack, lastQueryIntent } = state
      sessionStorage.setItem(
        storageKey(sessionId),
        JSON.stringify({ activeCaseId, activeAccusedId, activeDistrict, investigationStack, lastQueryIntent }),
      )
    } catch {
      /* sessionStorage unavailable (private mode) — degrade to in-memory only */
    }
  }, [state, sessionId])

  const pushFromQueryResponse = useCallback((payload) => {
    setLastResponsePayload(payload ?? null)
    const { caseId, accusedId, district, intent } = parseInvestigationSlots(payload)
    // Nothing structured to stack — keep intent, leave the stack untouched.
    if (!caseId && !accusedId && !district) {
      setState((prev) => ({ ...prev, lastQueryIntent: intent ?? prev.lastQueryIntent }))
      return
    }
    setState((prev) => {
      const prevTop = prev.investigationStack[prev.investigationStack.length - 1]
      // Collapse an immediate duplicate (same case + accused + district) into
      // the existing frame instead of stacking a redundant one.
      const isDup =
        prevTop &&
        prevTop.caseId === caseId &&
        prevTop.accusedId === accusedId &&
        prevTop.district === district
      const stack = isDup
        ? prev.investigationStack
        : [...prev.investigationStack, { caseId, accusedId, district, addedAt: Date.now(), source: 'query' }]
      return {
        activeCaseId: caseId ?? latest(stack, 'caseId'),
        activeAccusedId: accusedId ?? latest(stack, 'accusedId'),
        activeDistrict: district ?? latest(stack, 'district'),
        investigationStack: stack,
        lastQueryIntent: intent ?? prev.lastQueryIntent,
      }
    })
  }, [])

  // Manual push (e.g. clicking a graph node) — same accumulate semantics.
  const pushManual = useCallback(({ caseId = null, accusedId = null, district = null }) => {
    if (!caseId && !accusedId && !district) return
    setState((prev) => {
      const stack = [...prev.investigationStack, { caseId, accusedId, district, addedAt: Date.now(), source: 'manual' }]
      return {
        ...prev,
        activeCaseId: caseId ?? prev.activeCaseId,
        activeAccusedId: accusedId ?? prev.activeAccusedId,
        activeDistrict: district ?? prev.activeDistrict,
        investigationStack: stack,
      }
    })
  }, [])

  const clearStack = useCallback(() => {
    setState(EMPTY)
    setLastResponsePayload(null)
    setDrawerOpen(false)
    try {
      sessionStorage.removeItem(storageKey(sessionId))
    } catch { /* ignore */ }
  }, [sessionId])

  // Clear on logout — AuthContext dispatches this window event.
  useEffect(() => {
    const onLogout = () => clearStack()
    window.addEventListener('scrb:logout', onLogout)
    return () => window.removeEventListener('scrb:logout', onLogout)
  }, [clearStack])

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), [])

  // Union of every district touched this session (for map/alerts filtering).
  const districts = useMemo(
    () => [...new Set(state.investigationStack.map((f) => f.district).filter(Boolean))],
    [state.investigationStack],
  )
  // Ordered unique accused ids (for the profile tab strip).
  const accusedIds = useMemo(
    () => [...new Set(state.investigationStack.map((f) => f.accusedId).filter(Boolean))],
    [state.investigationStack],
  )

  const value = useMemo(
    () => ({
      ...state,
      lastResponsePayload,
      districts,
      accusedIds,
      hasContext: state.investigationStack.length > 0,
      pushFromQueryResponse,
      pushManual,
      clearStack,
      // §5 drawer
      drawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    }),
    [state, lastResponsePayload, districts, accusedIds, drawerOpen, pushFromQueryResponse, pushManual, clearStack, openDrawer, closeDrawer, toggleDrawer],
  )

  return <InvestigationContext.Provider value={value}>{children}</InvestigationContext.Provider>
}

export function useInvestigation() {
  const ctx = useContext(InvestigationContext)
  if (!ctx) throw new Error('useInvestigation must be used within InvestigationProvider')
  return ctx
}
