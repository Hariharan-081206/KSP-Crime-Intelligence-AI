/**
 * ragService.js
 *
 * Talks to the QuickML **Knowledge Base RAG endpoint** (QuickML → Knowledge Base
 * → View API), which answers natural-language questions from the uploaded SCRB
 * PDFs.
 *
 * Contract (as provisioned):
 *   POST  $RAG_ANSWER_URL          e.g. .../quickml/v1/project/<id>/rag/answer
 *   { "query": "What are the common crime categories in Bengaluru?" }
 *   -> { "answer": "Based on the uploaded crime records..." }
 *
 * ---------------------------------------------------------------------------
 * WHAT CHANGED AND WHY
 *
 * This file previously invented a contract that does not exist:
 *   POST `${RAG_ENDPOINT}/v1/rag/query`  with Bearer auth and a body of
 *   { vector_store_id, model, task, query, context, instructions,
 *     response_format }, expecting { output, retrieved_context } back.
 *
 * Nothing serves that. Four incompatibilities, each fatal on its own: the path
 * was appended to an endpoint that is already complete; auth was `Bearer`
 * instead of the QuickML endpoint-key header; `vector_store_id`/`model`/`task`
 * are not accepted; and the response has no `output` wrapper.
 *
 * The bigger structural point: **the RAG endpoint does not do intent
 * extraction.** It takes a question and returns prose. But queryController's
 * pipeline calls extractIntent() FIRST and feeds the result to
 * queryBuilderService → datastoreService, i.e. intent extraction drives the
 * whole Data Store query. Asking the KB endpoint to classify intent would mean
 * a second round-trip whose output shape we cannot rely on.
 *
 * So extractIntent() is now LOCAL and deterministic — no network call, no cost,
 * no shape risk. It is a keyword/pattern classifier over the intents
 * queryBuilderService already understands. Less clever than an LLM, but honest
 * about it, instant, and it cannot fail in production.
 * ---------------------------------------------------------------------------
 */

import logger from '../utils/logger.js';
import { buildAuthHeaders } from './catalystAuth.js';

const RAG_ANSWER_URL = process.env.RAG_ANSWER_URL;

/**
 * The QuickML endpoint key.
 *
 * RESOLVED (was: "which credential this deployment needs could not be verified
 * without a live call"). It has now been verified against the live project: the
 * endpoint key is NOT sufficient and on its own is not even read — a request
 * with no key at all gets the identical `400 INVALID_TICKET`. These endpoints
 * authenticate with a Zoho OAuth token, which services/catalystAuth.js obtains
 * from the function's own Catalyst credential. The key is still sent, because
 * the SDK sends it too for the sibling `/endpoints/predict` path.
 *
 * RAG_OAUTH_TOKEN remains supported as a manual override for local probing, but
 * must NOT be relied on in the deployed function: Zoho access tokens expire in
 * about an hour, so a static env var works once and then fails silently until
 * someone notices the chat is down.
 */
const RAG_ENDPOINT_KEY = process.env.RAG_ENDPOINT_KEY;
const RAG_OAUTH_TOKEN = process.env.RAG_OAUTH_TOKEN;
const CATALYST_ORG_ID = process.env.CATALYST_ORG_ID;
const CATALYST_ENVIRONMENT = process.env.CATALYST_ENVIRONMENT || 'Development';

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Cap on the factual preamble prepended to a question when Data Store rows were
 * retrieved. Enough to ground the answer in live records; small enough that a
 * large result set cannot blow up the request.
 */
const MAX_CONTEXT_CHARS = 4000;

if (!RAG_ANSWER_URL) {
  logger.warn(
    '[ragService] RAG_ANSWER_URL is not set. POST /query will fail until it is configured.'
  );
}

async function buildHeaders(catalystApp) {
  const headers = { 'Content-Type': 'application/json' };
  if (RAG_ENDPOINT_KEY) headers['X-QUICKML-ENDPOINT-KEY'] = RAG_ENDPOINT_KEY;
  if (CATALYST_ORG_ID) headers['CATALYST-ORG'] = CATALYST_ORG_ID;
  if (CATALYST_ENVIRONMENT) headers.Environment = CATALYST_ENVIRONMENT;

  // An explicitly configured token wins, so a developer can probe the endpoint
  // outside a request context. Otherwise take the function's own credential —
  // the only option that keeps working past the token's ~1h lifetime.
  if (RAG_OAUTH_TOKEN) {
    headers.Authorization = `Zoho-oauthtoken ${RAG_OAUTH_TOKEN}`;
    return headers;
  }

  return { ...headers, ...(await buildAuthHeaders(catalystApp, 'ragService')) };
}

/**
 * POST a question to the knowledge base.
 * @returns {Promise<string|null>} the answer text, or null if none was returned.
 */
async function askKnowledgeBase(query, catalystApp = null) {
  if (!RAG_ANSWER_URL) {
    const err = new Error('Chat is not configured: set RAG_ANSWER_URL.');
    err.statusCode = 503;
    throw err;
  }

  const headers = await buildHeaders(catalystApp);

  // Enough to tell the three failure modes apart from the function log alone,
  // without ever writing a credential to it:
  //   no auth header      -> catalystAuth could not obtain a credential
  //   Zoho-oauthtoken     -> admin access token, the expected path
  //   Zoho-ticket/Cookie  -> a different credential type; scheme mismatch is
  //                          then a live possibility rather than a guess
  const scheme = headers.Authorization
    ? String(headers.Authorization).split(' ')[0]
    : headers.Cookie ? 'Cookie' : '(none)';
  const credLen = headers.Authorization
    ? String(headers.Authorization).split(' ').slice(1).join(' ').length
    : 0;
  logger.info('[ragService] calling RAG endpoint', {
    host: (() => { try { return new URL(RAG_ANSWER_URL).host; } catch { return '(unparseable)'; } })(),
    path: (() => { try { return new URL(RAG_ANSWER_URL).pathname; } catch { return '(unparseable)'; } })(),
    authScheme: scheme,
    credentialChars: credLen,
    endpointKeySent: Boolean(headers['X-QUICKML-ENDPOINT-KEY']),
    projectKeySent: Boolean(headers['x-zc-project-key']),
  });

  const response = await fetch(RAG_ANSWER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    // Name the likely cause in the log instead of leaving the next reader to
    // rediscover what each Zoho code means.
    if (/INVALID_OAUTHTOKEN/.test(detail)) {
      logger.error(
        '[ragService] the credential was rejected. A token WAS sent, so this is ' +
        'scope or permission, not a missing credential: confirm the function\'s ' +
        'application identity is allowed to call QuickML in this project.'
      );
    } else if (/INVALID_TICKET/.test(detail)) {
      logger.error(
        '[ragService] no usable credential reached the endpoint — the request ' +
        'went out unauthenticated. Check services/catalystAuth.js.'
      );
    }

    const err = new Error(
      `RAG endpoint returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`
    );
    err.statusCode = response.status;
    throw err;
  }

  logger.info('[ragService] RAG endpoint answered', { status: response.status });

  const body = await response.json().catch(() => null);

  // Documented shape is { answer }. Accept the obvious neighbours too rather
  // than 500 on a wrapper we did not anticipate.
  const answer =
    body?.answer ??
    body?.result?.answer ??
    body?.result ??
    body?.output ??
    body?.text ??
    null;

  if (typeof answer === 'string') return answer;
  if (answer != null) return JSON.stringify(answer);

  logger.warn('[ragService] no answer field in the RAG response', {
    keys: body && typeof body === 'object' ? Object.keys(body) : typeof body,
  });
  return null;
}

// ---------------------------------------------------------------------------
// Local intent classification
//
// Intents match what queryBuilderService/querymap already dispatch on. Ordered:
// the first matching rule wins, so put the specific ones first.
// ---------------------------------------------------------------------------

/**
 * Order is load-bearing: the first match wins, so more specific intents come
 * first. Two ordering lessons from the test suite:
 *
 *  - `aggregate_stats` must outrank `hotspot_lookup`. "How many thefts in zone 5"
 *    is a counting question that happens to name a place; a bare location mention
 *    is an ENTITY signal, not an intent signal. `zone \d+` and `area` were
 *    removed from the hotspot rules for exactly that reason.
 *  - `forecast` must outrank `aggregate_stats`, because "how many thefts next
 *    month" is a forecast — the time reference is the stronger signal.
 */
const INTENT_RULES = [
  { intent: 'network_lookup', patterns: [/\bnetwork\b/i, /\baccomplice/i, /\bco[- ]?accused\b/i, /\bgang\b/i, /\blinked to\b/i, /\bassociat/i] },
  { intent: 'profile_lookup', patterns: [/\bprofile\b/i, /\bbehaviou?r/i, /\bmodus operandi\b/i, /\brepeat offender/i, /\bhistory of\b/i] },
  { intent: 'forecast', patterns: [/\bforecast/i, /\bpredict/i, /\bnext\s+(?:week|month|year|\d+\s*days?)\b/i, /\btrend\b/i, /\bexpected\b/i, /\bupcoming\b/i] },
  { intent: 'aggregate_stats', patterns: [/\bhow many\b/i, /\bcount\b/i, /\btotal\b/i, /\bcompare\b/i, /\bstatistic/i, /\brate\b/i, /\baverage\b/i, /\bbreakdown\b/i, /\bdistribution\b/i] },
  { intent: 'hotspot_lookup', patterns: [/\bhotspot/i, /\bcluster/i, /\bmap\b/i, /\bwhere\b.*\bmost\b/i, /\b(?:which|what)\s+areas?\b/i, /\bareas?\b.*\bmost\b/i] },
  { intent: 'report_generate', patterns: [/\breport\b/i, /\bsummar/i, /\bexport\b/i, /\bbrief/i] },
  { intent: 'search_records', patterns: [/\bcase\b/i, /\bfir\b/i, /\bcrime number\b/i, /\bshow me\b/i, /\bfind\b/i, /\blist\b/i, /\bdetails? (?:of|for)\b/i] },
];

/** Entity patterns — deliberately conservative; a wrong entity is worse than none. */
function extractEntities(question) {
  const entities = {};

  const caseId = question.match(/\b(?:case|fir|crime)\s*(?:id|no\.?|number)?\s*#?\s*([A-Z0-9][A-Z0-9-]{2,})\b/i);
  if (caseId) entities.caseId = caseId[1];

  const zone = question.match(/\bzone\s*(\d+)\b/i);
  if (zone) entities.zone = zone[1];

  const year = question.match(/\b(19|20)\d{2}\b/);
  if (year) entities.year = year[0];

  const days = question.match(/\bnext\s+(\d+)\s*days?\b/i);
  if (days) entities.windowDays = parseInt(days[1], 10);

  // `s?` matters: "How many thefts…" is the common phrasing and the singular-only
  // pattern silently missed it, so the crime type never reached the query builder.
  const crimeType = question.match(
    /\b(theft|murder|assault|robbery|burglar(?:y|ies)|fraud|kidnapping|rape|dacoity|cheating|extortion|arson|homicide)s?\b/i
  );
  if (crimeType) {
    const raw = crimeType[1].toLowerCase();
    entities.crimeType = raw === 'burglaries' ? 'burglary' : raw;
  }

  return entities;
}

/**
 * Classify a question locally. No network call.
 *
 * @returns {Promise<{intent: string, entities: object, confidence: number, rawContext: array}>}
 *   `confidence` reflects how the intent was decided, not model certainty:
 *   0.6 for a keyword match, 0.3 for the `search_records` fallback. Callers that
 *   surface confidence should not read more into it than that.
 */
export async function extractIntent(question, context = {}) {
  if (!question || typeof question !== 'string' || !question.trim()) {
    throw new Error('ragService.extractIntent: "question" must be a non-empty string');
  }

  const entities = { ...extractEntities(question), ...(context.filters || {}) };

  for (const { intent, patterns } of INTENT_RULES) {
    if (patterns.some((p) => p.test(question))) {
      return { intent, entities, confidence: 0.6, rawContext: [] };
    }
  }

  // Unrecognised questions still need to go somewhere the query builder handles.
  return { intent: 'search_records', entities, confidence: 0.3, rawContext: [] };
}

/**
 * Compact, human-readable digest of retrieved rows, for grounding the answer.
 *
 * The endpoint accepts only `{ query }`, so live Data Store results can reach the
 * model only inside the question text. Kept short and clearly delimited; the
 * full rows still travel to the client separately in the response's `results`.
 */
function summarizeStructuredData(structuredData) {
  if (!structuredData) return null;
  const rows = Array.isArray(structuredData) ? structuredData : [structuredData];
  if (rows.length === 0) return null;

  const lines = [];
  let used = 0;

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const line = Object.entries(row)
      .filter(([, v]) => v != null && typeof v !== 'object')
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (!line) continue;
    if (used + line.length > MAX_CONTEXT_CHARS) {
      lines.push(`… and ${rows.length - lines.length} more record(s) not shown.`);
      break;
    }
    lines.push(`- ${line}`);
    used += line.length;
  }

  return lines.length > 0 ? `${rows.length} matching record(s):\n${lines.join('\n')}` : null;
}

/**
 * Produce the natural-language answer.
 *
 * @param {string} question
 * @param {object|array} structuredData rows already retrieved from Data Store
 * @returns {Promise<{answer: string|null, citations: array, grounded: boolean}>}
 *   `citations` is always [] — this endpoint does not return source references.
 *   Kept in the shape because queryController and the SPA both destructure it.
 */
export async function generateAnswer(question, structuredData, context = {}) {
  if (!question || typeof question !== 'string' || !question.trim()) {
    throw new Error('ragService.generateAnswer: "question" must be a non-empty string');
  }

  try {
    const digest = summarizeStructuredData(structuredData);

    const query = digest
      ? `${question}\n\n--- Records retrieved from the SCRB database ---\n${digest}\n--- End of records ---\n\n` +
        'Answer using the records above together with the case documents. ' +
        'Do not invent details. If the records do not support an answer, say so.'
      : question;

    // `context.catalystApp` when the caller threads it; otherwise catalystAuth
    // falls back to the request-scoped app bound by the init middleware.
    const answer = await askKnowledgeBase(query, context?.catalystApp ?? null);

    return { answer, citations: [], grounded: Boolean(digest) };
  } catch (err) {
    logger.error('[ragService.generateAnswer] failed', { error: err.message, question });
    throw err;
  }
}

export default { extractIntent, generateAnswer };
