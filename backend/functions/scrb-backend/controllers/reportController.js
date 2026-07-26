// File: backend/controllers/reportController.js

import * as datastoreService from '../services/datastoreService.js';
import * as auditService from '../services/auditService.js';
import { successResponse, errorResponse } from '../utils/formatter.js';
import { normalizeDate } from '../utils/formatter.js';
import logger from '../utils/logger.js';
import { HTTP_STATUS, TABLES, AUDIT_STAGES } from '../utils/constants.js';

/**
 * GET /report/summary?zone=3&dateFrom=2026-01-01&dateTo=2026-06-30
 * Aggregate crime-count-by-type report for a zone/date range.
 * ASSUMPTION: this is the "aggregate/strategic view" a Policymaker needs —
 * confirm exact grouping/fields against Section 8's reporting requirements.
 * Restricted to Policymaker at the route level.
 */
export const generateSummaryReport = async (req, res) => {
  const { zone, dateFrom, dateTo } = req.query;

  if (!zone) {
    return errorResponse(res, { statusCode: HTTP_STATUS.BAD_REQUEST, message: '"zone" query parameter is required.' });
  }

  const normalizedFrom = normalizeDate(dateFrom) || '1900-01-01';
  const normalizedTo = normalizeDate(dateTo) || new Date().toISOString().split('T')[0];

  try {
    const query = `SELECT CRIME_TYPE, ZONE, REPORTED_DATE FROM ${TABLES.CRIME_RECORDS} ` +
      `WHERE ZONE = '${zone.replace(/'/g, "''")}' ` +
      `AND REPORTED_DATE >= '${normalizedFrom}' AND REPORTED_DATE <= '${normalizedTo}' LIMIT 5000`;

    const rawRows = await datastoreService.runRawZcql(req.catalystApp, query);
    const rows = rawRows.map((row) => row[TABLES.CRIME_RECORDS]);

    const summary = rows.reduce((acc, row) => {
      const type = row.CRIME_TYPE || 'UNKNOWN';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return successResponse(res, {
      message: 'Summary report generated successfully.',
      data: {
        zone,
        dateFrom: normalizedFrom,
        dateTo: normalizedTo,
        totalIncidents: rows.length,
        breakdownByType: summary
      }
    });
  } catch (err) {
    logger.error('reportController.generateSummaryReport', 'Failed', err);
    return errorResponse(res, { message: 'Failed to generate summary report.', error: err });
  }
};

/**
 * GET /report/:threadId
 * Returns the record set behind a conversation thread, formatted for export.
 * Logs the export as a sensitive action.
 */
export const getReportData = async (req, res) => {
  const { threadId } = req.params;

  try {
    const thread = await auditService.getThreadHistory(req.catalystApp, threadId);

    if (!thread || thread.length === 0) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: `No thread found with id: ${threadId} to report on.`
      });
    }

    await auditService.logConversation(req.catalystApp, {
      threadId,
      user: req.user,
      question: `[REPORT/EXPORT REQUEST] Thread ${threadId}`,
      stage: AUDIT_STAGES.EXPORTED
    });

    return successResponse(res, {
      message: 'Report data retrieved successfully.',
      data: {
        threadId,
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.email,
        records: thread
      }
    });
  } catch (err) {
    logger.error('reportController.getReportData', 'Failed', err);
    return errorResponse(res, { message: 'Failed to retrieve report data.', error: err });
  }
};

export default { generateSummaryReport, getReportData };