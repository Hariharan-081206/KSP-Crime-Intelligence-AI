/**
 * controllers/behaviouralProfileController.js
 *
 * HTTP layer for the SCRB Behavioural Profiling Module.
 * All business logic lives in services/behaviouralProfileService.js —
 * this controller only validates/shapes I/O and maps errors to HTTP.
 *
 * Endpoints:
 *   GET  /profile/behavioral?accused_id= -> single profile by accused id (§8)
 *   GET  /profile/behavioral/:accusedId  -> same, path-param form
 *   POST /profile/query                  -> natural language investigator question
 *   POST /profile/generate               -> structured multi-field lookup
 */

import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/formatter.js';
import { HTTP_STATUS } from '../utils/constants.js';
import {
  generateProfiles,
  buildProfile,
} from '../services/behaviouralProfileService.js';

const OK = HTTP_STATUS?.OK || 200;
const BAD_REQUEST = HTTP_STATUS?.BAD_REQUEST || 400;
const NOT_FOUND = HTTP_STATUS?.NOT_FOUND || 404;
const INTERNAL_ERROR = HTTP_STATUS?.INTERNAL_ERROR || 500;

function getActor(req) {
  return {
    actorId: req.user?.id || req.headers['x-user-id'] || 'anonymous',
  };
}

/**
 * GET /profile/behavioral?accused_id=…   (spec §8)
 * GET /profile/behavioral/:accusedId     (path-param form)
 * Returns a single, fully assembled behavioural profile for a known accused.
 *
 * The frontend sends the id as the snake_case query param `accused_id`
 * (profileService.js); the path-param and camelCase forms are accepted too so
 * the pre-rename callers keep working.
 */
export async function getProfileByAccusedId(req, res) {
  const accusedId =
    req.params?.accusedId ?? req.query?.accused_id ?? req.query?.accusedId;

  if (!accusedId) {
    return errorResponse(res, {
      statusCode: BAD_REQUEST,
      message: 'An accused id is required — pass ?accused_id=<id>.'
    });
  }

  try {
    const profile = await buildProfile(accusedId, {});
    return successResponse(res, {
      statusCode: OK,
      message: 'Behavioural profile generated successfully',
      data: {
        answer: profile.summary,
        profiles: [profile],
      },
    });
  } catch (error) {
    logger.error('getProfileByAccusedId failed', { accusedId, error: error.message });

    if (/not found/i.test(error.message)) {
      return errorResponse(res, { statusCode: NOT_FOUND, message: error.message });
    }

    return errorResponse(res, {
      statusCode: INTERNAL_ERROR,
      message: 'Failed to generate behavioural profile',
      error,
    });
  }
}

/**
 * POST /profile/query
 * Body: { question: string }
 * Natural-language investigator question, routed through QuickML intent
 * detection inside the service layer.
 */
export async function queryProfiles(req, res) {
  const { question } = req.body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    return errorResponse(res, {
      statusCode: BAD_REQUEST,
      message: 'A non-empty "question" field is required',
    });
  }

  try {
    const result = await generateProfiles({ question }, getActor(req));
    return successResponse(res, {
      statusCode: OK,
      message: 'Query processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('queryProfiles failed', { question, error: error.message });
    return errorResponse(res, {
      statusCode: INTERNAL_ERROR,
      message: 'Failed to process investigator query',
      error,
    });
  }
}

/**
 * POST /profile/generate
 * Body: any combination of structured fields supported by
 * behaviouralProfileService.resolveInputEntities:
 *   { caseId, crimeNumber, accusedName, district, crimeHead, crimeType,
 *     financialTransaction, bankAccount, question }
 *
 * At least one identifying field must be present.
 */
export async function generateProfilesHandler(req, res) {
  const input = req.body || {};

  const supportedKeys = [
    'caseId',
    'crimeNumber',
    'accusedName',
    'district',
    'crimeHead',
    'crimeType',
    'financialTransaction',
    'bankAccount',
    'question',
    'accusedId',
  ];

  const hasAnyValidField = supportedKeys.some((key) => input[key] !== undefined && input[key] !== null && String(input[key]).trim() !== '');

  if (!hasAnyValidField) {
    return errorResponse(res, {
      statusCode: BAD_REQUEST,
      message: `At least one of the following fields is required: ${supportedKeys.join(', ')}`,
    });
  }

  try {
    const result = await generateProfiles(input, getActor(req));
    return successResponse(res, {
      statusCode: OK,
      message: 'Behavioural profiles generated successfully',
      data: result,
    });
  } catch (error) {
    logger.error('generateProfilesHandler failed', { input, error: error.message });
    return errorResponse(res, {
      statusCode: INTERNAL_ERROR,
      message: 'Failed to generate behavioural profiles',
      error,
    });
  }
}

export default {
  getProfileByAccusedId,
  queryProfiles,
  generateProfilesHandler,
};
