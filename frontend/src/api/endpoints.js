// Centralized API path registry. All paths are relative to apiClient.baseURL
// (VITE_API_BASE_URL or `/api`). Reconcile against the live API Gateway config
// before finalizing — these are derived from the Stage 2 doc Section 8.
//
// NOTE: the Financial Trail function (/api/financial/*) is intentionally omitted
// — that feature was removed from the frontend.
export const ENDPOINTS = {
  authRole: '/auth/role',
  query: '/query',
  voiceStt: '/voice/stt',
  voiceTts: '/voice/tts',
  graphNetwork: '/graph/network',
  insightsDemographic: '/insights/demographic',
  mapHotspots: '/map/hotspots',
  // TODO-BACKEND: district-detail handler not yet confirmed in scrb-backend's
  // mapRoutes.js. Expected: GET /api/map/district/:districtId. Card degrades to
  // a graceful "not yet available" state on 404 until the route lands.
  mapDistrict: (districtId) => `/map/district/${encodeURIComponent(districtId)}`,
  profileBehavioral: '/profile/behavioral',
  predictForecast: '/predict/forecast',
  predictExplain: '/predict/explain',
  alertsActive: '/alerts/active',
  conversation: (sessionId) => `/conversation/${encodeURIComponent(sessionId)}`,
  exportPdf: '/export/pdf',
  caseSummary: (caseId) => `/case/${encodeURIComponent(caseId)}/summary`,
  caseSimilar: (caseId) => `/case/${encodeURIComponent(caseId)}/similar`,
  caseLeads: (caseId) => `/case/${encodeURIComponent(caseId)}/leads`,
  // TODO-BACKEND (P0, NEW — §5 of the pre-deploy pass): raw DB record for a FIR.
  // No route exists in scrb-backend yet. Expected: GET /api/case/:caseId/record
  // → { case_master, accused[], victim[], arrest_surrender[],
  //     chargesheet_details[], complainant, acts_sections[] }.
  caseRecord: (caseId) => `/case/${encodeURIComponent(caseId)}/record`,

  // TODO: confirm against API Gateway — Stage 2 §8 lists no GET audit-log
  // endpoint. Used read-only by the audit view; degrades to an empty state.
  auditLog: '/audit/log',

  // TODO-BACKEND (P1 — §5/§7.9): analyst threshold edits. No route in
  // scrb-backend yet. Expected: POST /api/audit/threshold
  // body { crime_type, value, unit } → { ok: true }. The editor POSTs here and
  // degrades to a local-only "saved" state on failure.
  auditThreshold: '/audit/threshold',
}

// Base URLs in the app include an `/api` prefix by default. When the frontend
// talks to the Catalyst API Gateway the base already ends in `/api`, so paths
// here are prefix-less and joined onto baseURL.
