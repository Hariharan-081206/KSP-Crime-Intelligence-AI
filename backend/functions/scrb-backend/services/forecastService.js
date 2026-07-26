/**
 * forecastService.js
 *
 * Calls the deployed Catalyst QuickML **forecast endpoint** over REST.
 *
 * NOT the SDK. This previously did
 *   catalystApp.quickML().model(QUICKML_FORECAST_MODEL_ID).predict({region, crime_type, horizon})
 * which does not match what is actually provisioned. The real endpoint is a
 * plain HTTP POST authenticated by a single header, and its input is a DATE —
 * there is no addressable "model id" and no region/crime-type feature. Reference
 * implementation: the (now removed) predictforecast Python function,
 * recoverable at `git show 6723510:functions/predictforecast/main.py`.
 *
 * Contract (verified against that working caller):
 *   POST  $QUICKML_FORECAST_ENDPOINT_URL
 *   X-QUICKML-ENDPOINT-KEY: <key>          <- the only auth header required
 *   { "data": { "casemaster__crimeregistereddate": "YYYY-MM-DD" } }
 *   -> { "result": { "YYYY-MM-DD": <number> } }
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT — what this model can and cannot answer
 *
 * The model was trained on `casemaster.crimeregistereddate` alone. It takes one
 * date and returns the predicted registration count FOR THAT DATE. It has no
 * district input and no crime-type input.
 *
 * The SPA's forecast panel asks for `{district, crime_type, window_days}` and
 * renders "<N> predicted <crimeType> incidents in <district>, next <N> days".
 * Two mismatches follow, and both are reported honestly in the response rather
 * than papered over:
 *
 *   1. `district` and `crime_type` CANNOT influence the prediction. They are
 *      echoed back so the UI can label itself, and `filtersApplied: false` says
 *      plainly that they were not used.
 *   2. A single call answers "how many on day X", not "how many over N days".
 *      The Python reference predicted one date 30 days out and stored it as the
 *      forecast, which silently conflates a daily rate with a monthly total.
 *      Instead we predict across the window and SUM, which is the quantity the
 *      UI actually claims to display.
 * ---------------------------------------------------------------------------
 */

import logger from '../utils/logger.js';
import { resolveApp } from './catalystContext.js';

/**
 * Retained for reference and for the startup warning only — the request itself
 * no longer uses it.
 *
 * The SDK's `app.quickML().predict()` builds this exact path itself
 * (`/quickml/v1/project/<projectId>/endpoints/predict`, see
 * zcatalyst-sdk-node/lib/quick-ml/quick-ml.js) and sends the same
 * `X-QUICKML-ENDPOINT-KEY` header. The difference — the reason this file used to
 * fail with `400 INVALID_TICKET` on every call — is that the SDK routes through
 * AuthorizedHttpClient, which attaches the function's Zoho OAuth credential.
 * A bare `fetch()` has no credential to attach. See services/catalystAuth.js for
 * the evidence.
 */
const ENDPOINT_URL = process.env.QUICKML_FORECAST_ENDPOINT_URL;
const ENDPOINT_KEY = process.env.QUICKML_FORECAST_ENDPOINT_KEY;

// The feature name the trained pipeline expects. Overridable because it is
// derived from the training table/column and would change if the model is
// retrained against a different source column.
const DATE_FEATURE =
  process.env.QUICKML_FORECAST_DATE_FEATURE || 'casemaster__crimeregistereddate';

/**
 * Upper bound on prediction calls per request. A 30-day window costs 30 calls,
 * which is fine in parallel; a 365-day window is not, so longer windows are
 * evenly SAMPLED and scaled up. Keeps a pathological `window_days` from turning
 * one API request into hundreds of outbound calls.
 */
const MAX_FORECAST_SAMPLES = 31;

if (!ENDPOINT_KEY) {
  logger.warn(
    '[forecastService] QUICKML_FORECAST_ENDPOINT_KEY is not set. ' +
      'forecastCrime() will fail until it is configured.'
  );
}

// A URL pointing anywhere other than the SDK's own path is now silently ignored
// rather than honoured, so say so once at startup instead of leaving someone to
// wonder why their override had no effect.
if (ENDPOINT_URL && !/\/endpoints\/predict\/?$/.test(ENDPOINT_URL)) {
  logger.warn(
    '[forecastService] QUICKML_FORECAST_ENDPOINT_URL does not end in /endpoints/predict. ' +
      'Predictions now go through the Catalyst SDK, which derives that path itself — ' +
      'this variable is no longer used to route the request.'
  );
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Parses "30d" / "30" / 30 into a day count. Returns null when unusable, so the
 * caller can reject rather than silently forecast the wrong window.
 */
export function parseHorizonDays(horizon) {
  if (typeof horizon === 'number' && Number.isFinite(horizon)) {
    return horizon > 0 ? Math.floor(horizon) : null;
  }
  if (typeof horizon !== 'string') return null;
  const match = /^\s*(\d+)\s*d?\s*$/i.exec(horizon);
  if (!match) return null;
  const days = parseInt(match[1], 10);
  return days > 0 ? days : null;
}

/**
 * The dates to ask the model about, and how much each sample represents.
 *
 * For windows within the cap this is every day (weight 1). Beyond it, evenly
 * spaced samples each standing in for `windowDays / sampleCount` days.
 */
function buildSampleDates(windowDays, startDate = new Date()) {
  const sampleCount = Math.min(windowDays, MAX_FORECAST_SAMPLES);
  const step = windowDays / sampleCount;
  const dates = [];

  for (let i = 0; i < sampleCount; i += 1) {
    // Offsets 1..windowDays — "the next N days" starts tomorrow, not today.
    const offset = Math.round(i * step) + 1;
    const d = new Date(startDate.getTime());
    d.setUTCDate(d.getUTCDate() + offset);
    dates.push(toISODate(d));
  }

  return { dates, weightPerSample: windowDays / sampleCount };
}

/**
 * One prediction call.
 * @returns {Promise<number|null>} the predicted count, or null if unparseable.
 */
async function predictForDate(isoDate, catalystApp) {
  // Through the SDK, not fetch(): `predict()` posts `{ data: <inputData> }` to
  // the same path with the same endpoint-key header, and adds the Zoho
  // credential that the endpoint actually authenticates on.
  const body = await catalystApp.quickML().predict(ENDPOINT_KEY, {
    [DATE_FEATURE]: isoDate,
  });

  // Documented shape is { result: { "<date>": n } }. Key off the date we asked
  // for, but fall back to the first numeric value rather than assuming the
  // endpoint echoes the date identically (timezone/format drift would break it).
  // Values are coerced because the SDK types `result` as Array<string> — a model
  // that returns "12.0" must not read as "no prediction".
  const asNumber = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const result = body?.result;
  if (result && typeof result === 'object') {
    const exact = asNumber(result[isoDate]);
    if (exact !== null) return exact;
    for (const v of Object.values(result)) {
      const n = asNumber(v);
      if (n !== null) return n;
    }
  }
  const direct = asNumber(body?.prediction) ?? asNumber(body);
  if (direct !== null) return direct;

  logger.warn('[forecastService] could not read a number from the endpoint response', {
    isoDate,
    keys: body && typeof body === 'object' ? Object.keys(body) : typeof body,
  });
  return null;
}

/** Matches the thresholds used by the original predictforecast function. */
export function riskLevelFor(predictedCount) {
  if (typeof predictedCount !== 'number' || !Number.isFinite(predictedCount)) return null;
  if (predictedCount >= 40) return 'CRITICAL';
  if (predictedCount >= 20) return 'HIGH';
  if (predictedCount >= 10) return 'MEDIUM';
  return 'LOW';
}

/**
 * Forecast registered-crime volume over a forward window.
 *
 * @param {object} req the Express request; only `req.catalystApp` is read, to
 *   authenticate the outbound prediction calls. Falls back to the
 *   request-scoped app, so existing call sites need no change.
 * @param {object} params
 * @param {string} [params.region]     echoed only — the model has no region input
 * @param {string} [params.crimeType]  echoed only — the model has no crime-type input
 * @param {string|number} params.horizon  e.g. "30d" or 30
 * @returns {Promise<{
 *   predictedCount: number|null,
 *   predictions: Array<{date: string, predictedCount: number|null, weight: number}>,
 *   windowDays: number,
 *   riskLevel: string|null,
 *   filtersApplied: false,
 *   modelInputs: string[],
 *   sampled: boolean,
 *   generatedAt: string
 * }>}
 */
export async function forecastCrime(req, params = {}) {
  const { region, crimeType, horizon } = params;

  if (!ENDPOINT_KEY) {
    const err = new Error(
      'Forecasting is not configured: set QUICKML_FORECAST_ENDPOINT_KEY.'
    );
    err.statusCode = 503;
    throw err;
  }

  // Needed now that predictions go through the SDK, which authenticates as the
  // function. `req.catalystApp` is set by the init middleware in index.js;
  // resolveApp falls back to the request-scoped app when a caller omits it.
  const catalystApp = resolveApp(req?.catalystApp ?? null, 'forecastService');

  const windowDays = parseHorizonDays(horizon);
  if (!windowDays) {
    const err = new Error(
      `forecastService.forecastCrime: could not read a positive day count from horizon ${JSON.stringify(horizon)}`
    );
    err.statusCode = 400;
    throw err;
  }

  try {
    const { dates, weightPerSample } = buildSampleDates(windowDays);

    // Parallel: each call is an independent inference and the window is capped.
    const counts = await Promise.all(dates.map((d) => predictForDate(d, catalystApp)));

    const predictions = dates.map((date, i) => ({
      date,
      predictedCount: counts[i],
      weight: weightPerSample,
    }));

    const usable = counts.filter((c) => typeof c === 'number' && Number.isFinite(c));

    // null, not 0, when nothing came back — a confident zero and "we don't know"
    // must not look the same on a crime dashboard.
    const predictedCount =
      usable.length === 0
        ? null
        : Math.round(usable.reduce((sum, c) => sum + c, 0) * weightPerSample);

    if (usable.length > 0 && usable.length < counts.length) {
      logger.warn('[forecastService] some samples returned no number; total is extrapolated', {
        requested: counts.length,
        usable: usable.length,
      });
    }

    return {
      predictedCount,
      predictions,
      windowDays,
      riskLevel: riskLevelFor(predictedCount),
      // Stated explicitly: the model cannot filter on these.
      filtersApplied: false,
      modelInputs: [DATE_FEATURE],
      sampled: dates.length < windowDays,
      echoedFilters: { region: region ?? null, crimeType: crimeType ?? null },
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error('[forecastService.forecastCrime] failed', {
      error: err.message,
      region,
      crimeType,
      horizon,
    });
    throw err;
  }
}

export default { forecastCrime, parseHorizonDays, riskLevelFor };
