// File: functions/scrb-backend/routes/alertsRoutes.js
//
// GET /alerts/active   (spec §8 — renamed from GET /alerts)
//
// ---------------------------------------------------------------------------
// WHY THIS WAS REWRITTEN
//
// It queried a table called `Alerts` with columns ALERT_TYPE / ZONE / SEVERITY /
// MESSAGE / STATUS, carrying its own comment admitting "this is a placeholder
// shape". Nothing in the project — not the Node backend, not any Python
// function — ever writes a table by that name, so the route was structurally
// incapable of returning a row. It would answer 200 with `[]` forever, which
// reads as "no alerts right now" rather than "this feature is not wired up".
//
// The real producer is `forecastAlertJob`, whose source was recovered from the
// console via `catalyst iac:export` (it had never been committed). It writes
// **earlywarnings** — and the SPA's own alertsService docstring already said
// "Fetch active early-warning alerts from the EarlyWarnings table", so that was
// always the intent.
//
// Verified schema, from forecastAlertJob/datastore.py insert_early_warning():
//   districtid, crimesubheadid, predictedcount, historicalbaseline,
//   risklevel, recommendation, generatedat, shaptopfactors
// ---------------------------------------------------------------------------

import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import * as datastoreService from '../services/datastoreService.js';
import * as cacheService from '../services/cacheService.js';
import { ALL_ROLES } from '../utils/constants.js';
import logger from '../utils/logger.js';

const router = Router();

const ALERTS_TABLE = 'earlywarnings';
const MAX_ALERTS = 100;
const CACHE_TTL_SECONDS = 60;

/**
 * risklevel -> the SPA's severity vocabulary.
 *
 * AlertCard styles exactly three values (`severity-high|medium|low`) and looks
 * the label up in `SEVERITY_LABEL = { high, medium, low }`. forecastAlertJob
 * emits a fourth, CRITICAL, so passing risklevel through lowercased would yield
 * `severity-critical` — no matching CSS and an undefined label, i.e. an
 * unstyled card with a blank severity tag.
 *
 * CRITICAL therefore maps to `high`, and the untruncated level is preserved
 * separately as `riskLevel` so the distinction is not lost.
 */
const SEVERITY_BY_RISK = {
  CRITICAL: 'high',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

function toSeverity(riskLevel) {
  if (typeof riskLevel !== 'string') return 'low';
  return SEVERITY_BY_RISK[riskLevel.trim().toUpperCase()] ?? 'low';
}

function toNumber(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Resolve districtid -> districtname in ONE query for the whole page of alerts.
 *
 * `earlywarnings` stores only the numeric id, but the alert card renders a
 * district label. Looking each one up individually would be N queries per
 * request for a polled endpoint. Returns a Map; a failure here degrades the
 * label rather than failing the request.
 */
async function resolveDistrictNames(catalystApp, districtIds) {
  const unique = [...new Set(districtIds.filter((id) => id != null))];
  if (unique.length === 0) return new Map();

  try {
    const inList = unique.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(', ');
    const rows = await datastoreService.executeQuery(
      catalystApp,
      `SELECT districtid, districtname FROM district WHERE districtid IN (${inList})`
    );

    const map = new Map();
    for (const row of rows ?? []) {
      const d = row?.district ?? row;
      if (d?.districtid != null) map.set(String(d.districtid), d.districtname ?? null);
    }
    return map;
  } catch (err) {
    logger.warn('[alertsRoutes] district name lookup failed; falling back to ids', {
      error: err.message,
    });
    return new Map();
  }
}

/** Same idea for crimesubheadid -> the crime type label. */
async function resolveCrimeTypes(catalystApp, subheadIds) {
  const unique = [...new Set(subheadIds.filter((id) => id != null && String(id) !== '0'))];
  if (unique.length === 0) return new Map();

  try {
    const inList = unique.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(', ');
    const rows = await datastoreService.executeQuery(
      catalystApp,
      `SELECT * FROM crimesubhead WHERE crimesubheadid IN (${inList})`
    );

    const map = new Map();
    for (const row of rows ?? []) {
      const c = row?.crimesubhead ?? row;
      if (c?.crimesubheadid == null) continue;
      // Column name for the label is not pinned down in this repo; take the
      // first plausible one rather than assuming.
      const label =
        c.crimesubheadname ?? c.subheadname ?? c.name ?? c.description ?? null;
      map.set(String(c.crimesubheadid), label);
    }
    return map;
  } catch (err) {
    logger.warn('[alertsRoutes] crime subhead lookup failed', { error: err.message });
    return new Map();
  }
}

/**
 * earlywarnings row -> the shape AlertCard reads:
 *   { id, title, description, district, crimeType, severity, detectedAt }
 */
function toAlert(row, districtNames, crimeTypes) {
  const districtId = row.districtid ?? null;
  const subheadId = row.crimesubheadid ?? null;

  const districtName =
    districtNames.get(String(districtId)) ??
    (districtId != null ? `District ${districtId}` : 'Unknown district');

  const crimeType = crimeTypes.get(String(subheadId)) ?? 'All crime types';

  const predicted = toNumber(row.predictedcount);
  const baseline = toNumber(row.historicalbaseline);
  const riskLevel = typeof row.risklevel === 'string' ? row.risklevel.toUpperCase() : null;

  const title =
    predicted != null
      ? `${Math.round(predicted)} incidents predicted in ${districtName}`
      : `Early warning for ${districtName}`;

  // The recommendation is the operational instruction; the baseline comparison is
  // what makes it interpretable, so include it when both numbers are present.
  const parts = [];
  if (row.recommendation) parts.push(String(row.recommendation));
  if (predicted != null && baseline != null && baseline > 0) {
    const delta = ((predicted - baseline) / baseline) * 100;
    const direction = delta >= 0 ? 'above' : 'below';
    parts.push(
      `Forecast is ${Math.abs(delta).toFixed(0)}% ${direction} the historical average of ${baseline.toFixed(1)}.`
    );
  }

  return {
    id: row.ROWID ?? row.rowid ?? null,
    title,
    description: parts.join(' ') || 'No recommendation recorded.',
    district: districtName,
    districtId,
    crimeType,
    severity: toSeverity(riskLevel),
    // Retained because CRITICAL collapses into `high` for styling; without this
    // the most serious alerts would be indistinguishable from ordinary ones.
    riskLevel,
    predictedCount: predicted,
    historicalBaseline: baseline,
    detectedAt: row.generatedat ?? row.CREATEDTIME ?? null,
    factors: row.shaptopfactors ?? null,
  };
}

/**
 * GET /alerts/active
 *
 * Optional `?district=<districtid>` filter. (`?zone=` is accepted as a legacy
 * alias — the previous route filtered on a ZONE column, which does not exist on
 * `earlywarnings`; it is treated as a district id so old callers do not break
 * silently.)
 *
 * All three roles may read the feed. Briefly cached, since it is polled.
 */
router.get(
  '/active',
  authMiddleware,
  roleMiddleware(ALL_ROLES),
  async (req, res) => {
    const district = req.query.district ?? req.query.districtId ?? req.query.zone ?? null;

    try {
      const cacheKey = cacheService.buildCacheKey('ALERTS_FEED', {
        district: district || 'ALL',
      });
      const cached = await cacheService.get(req.catalystApp, cacheKey);
      if (cached) {
        return res.status(200).json({ success: true, data: cached, cached: true });
      }

      // Newest first — an alert feed that is not time-ordered is close to useless.
      const where = district
        ? `WHERE districtid = '${String(district).replace(/'/g, "''")}'`
        : '';
      const rows = await datastoreService.executeQuery(
        req.catalystApp,
        `SELECT * FROM ${ALERTS_TABLE} ${where} ORDER BY generatedat DESC LIMIT ${MAX_ALERTS}`
      );

      const flat = (rows ?? []).map((r) => r?.[ALERTS_TABLE] ?? r).filter(Boolean);

      const [districtNames, crimeTypes] = await Promise.all([
        resolveDistrictNames(req.catalystApp, flat.map((r) => r.districtid)),
        resolveCrimeTypes(req.catalystApp, flat.map((r) => r.crimesubheadid)),
      ]);

      const alerts = flat.map((r) => toAlert(r, districtNames, crimeTypes));

      await cacheService.set(req.catalystApp, cacheKey, alerts, CACHE_TTL_SECONDS);

      return res.status(200).json({ success: true, data: alerts, cached: false });
    } catch (err) {
      logger.error('[alertsRoutes] GET /active failed', { error: err.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve alerts.',
        error: err.message,
      });
    }
  }
);

export default router;
