/**
 * forecastController.js
 *
 * HTTP layer for forecasting.
 * Route -> this controller -> forecastService -> QuickML forecast REST endpoint.
 */

import * as forecastService from '../services/forecastService.js';
import * as auditService from '../services/auditService.js';
import logger from '../utils/logger.js';

/**
 * POST /predict/forecast   (spec §8)
 *
 * Request — the frontend (predictService.runForecast) sends snake_case:
 *   { district, crime_type, window_days }
 * The pre-Step-5 handler required { region, crimeType, horizon }, so a real SPA
 * call failed validation with 400 before ever reaching QuickML. All spellings are
 * accepted now; `district`/`crime_type`/`window_days` are the contract and the
 * rest are backward-compatible aliases for internal callers.
 *
 * Response — the frontend renders one figure (`predictedCount`) plus its own
 * labels, so that is the headline. `predictions` carries the per-date series.
 *
 * ---------------------------------------------------------------------------
 * `filtersApplied: false` is not a placeholder — it is the truth.
 *
 * The deployed model takes ONE input, `casemaster__crimeregistereddate`. It has
 * no district feature and no crime-type feature. So `district` and `crime_type`
 * are accepted, audited, and echoed back for labelling, but they DO NOT change
 * the number. The forecast is total registered-crime volume statewide over the
 * window, not for the chosen district.
 *
 * That is surfaced rather than hidden because the SPA's card reads
 * "<N> predicted <crimeType> incidents in <district>" — which overstates what
 * the model knows. Making the response say so is the honest minimum until either
 * the model is retrained with district/crime-type features or the UI is reworded.
 * ---------------------------------------------------------------------------
 */
export async function getForecast(req, res) {
  const body = req.body || {};

  // Normalize inbound names: §8 first, then the legacy aliases.
  const district = body.district ?? body.region;
  const crimeType = body.crime_type ?? body.crimeType;
  const windowDaysRaw = body.window_days ?? body.windowDays ?? body.horizon;

  // `horizon` was a string like "30d"; window_days is a number. Accept either.
  const windowDays = forecastService.parseHorizonDays(windowDaysRaw);

  try {
    if (!district) {
      return res.status(400).json({
        success: false,
        error: '"district" is required.',
      });
    }
    if (!windowDays) {
      return res.status(400).json({
        success: false,
        error: '"window_days" is required and must be a positive number of days.',
      });
    }

    const result = await forecastService.forecastCrime(req, {
      region: district,
      crimeType,
      horizon: windowDays,
    });

    // Best-effort: an audit write must never sink a successful forecast.
    try {
      await auditService.logConversation(req.catalystApp, {
        user: req.user || null,
        question: `[FORECAST REQUEST] district=${district}, crimeType=${crimeType}, windowDays=${windowDays}`,
        answer: `predictedCount=${result?.predictedCount ?? 'null'} risk=${result?.riskLevel ?? 'null'}`,
        stage: 'FORECAST',
      });
    } catch (auditErr) {
      logger.warn('[forecastController] audit write failed', { error: auditErr.message });
    }

    return res.status(200).json({
      success: true,
      data: {
        district,
        crimeType: crimeType ?? null,
        windowDays: result?.windowDays ?? windowDays,
        // null (never 0) when the model returned nothing usable — on a crime
        // dashboard a confident zero and "unknown" must not look identical.
        predictedCount: result?.predictedCount ?? null,
        riskLevel: result?.riskLevel ?? null,
        predictions: result?.predictions ?? null,
        // The model ignored district/crime_type. Say so in the payload.
        filtersApplied: result?.filtersApplied ?? false,
        modelInputs: result?.modelInputs ?? null,
        sampled: result?.sampled ?? false,
        generatedAt: result?.generatedAt ?? null,
      },
    });
  } catch (err) {
    // The service tags "not configured" as 503 and a bad window as 400; only a
    // genuinely unexpected failure should read as 500.
    const statusCode = err?.statusCode === 503 || err?.statusCode === 400 ? err.statusCode : 500;
    logger.error('[forecastController.getForecast] failed', {
      error: err.message,
      statusCode,
    });
    return res.status(statusCode).json({
      success: false,
      error: statusCode === 500 ? 'Failed to generate forecast.' : err.message,
    });
  }
}

export default {
  getForecast,
};
