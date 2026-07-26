// Extract structured investigation slots (case id / accused id / district /
// intent) from an /api/query response so the whole app can react to what the
// chat just resolved.
//
// Response contract assumption (Stage 2 §8 does NOT yet guarantee `slots` — see
// PRE_DEPLOY_REPORT.md "Backend gaps", P0):
//   { answer, intent, slots: { case_id, accused_id, district }, ... }
// When `slots` is absent we degrade to a best-effort regex parse of the answer
// text so the investigation stack still populates in a demo.

// Karnataka FIR / case identifiers seen in the synthetic data take a few shapes:
//   CR/2023/00421   ·   KA-BLR-2024-04471   ·   FIR 0123/2024
const CASE_ID_PATTERNS = [
  /\bCR\/\d{4}\/\d{3,6}\b/i,
  /\bKA-[A-Z]{2,4}-\d{4}-\d{3,6}\b/i,
  /\bFIR[\s-]?\d{3,6}\/\d{4}\b/i,
]

const ACCUSED_ID_PATTERN = /\bA[_-]?\d{3,6}\b/ // e.g. A_1783, A-1783

function firstMatch(text, patterns) {
  if (!text) return null
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return m[0]
  }
  return null
}

/**
 * @param {object} payload raw /api/query response body
 * @returns {{ caseId: string|null, accusedId: string|null, district: string|null, intent: string|null }}
 */
export function parseInvestigationSlots(payload) {
  if (!payload || typeof payload !== 'object') {
    return { caseId: null, accusedId: null, district: null, intent: null }
  }

  const slots = payload.slots ?? payload.classification?.slots ?? {}
  const answerText = payload.answer ?? payload.text ?? payload.response ?? ''

  const caseId =
    slots.case_id ??
    slots.caseId ??
    payload.case_id ??
    payload.caseId ??
    firstMatch(answerText, CASE_ID_PATTERNS)

  const accusedId =
    slots.accused_id ??
    slots.accusedId ??
    payload.accused_id ??
    payload.accusedId ??
    firstMatch(answerText, [ACCUSED_ID_PATTERN])

  const district =
    slots.district ??
    slots.district_name ??
    payload.district ??
    null

  const intent =
    payload.intent ??
    payload.classification?.intent ??
    slots.intent ??
    null

  return {
    caseId: caseId || null,
    accusedId: accusedId || null,
    district: district || null,
    intent: intent || null,
  }
}
