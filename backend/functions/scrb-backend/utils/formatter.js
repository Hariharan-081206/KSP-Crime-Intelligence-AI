// File: backend/utils/formatter.js

/**
 * formatter
 * ---------------------------------------------------------------------------
 * Standardizes API response envelopes and a few common data transforms so
 * every controller returns a consistent shape to the frontend.
 */

export const successResponse = (res, { statusCode = 200, message = 'Success', data = null, meta = {} }) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...meta
  });
};

export const errorResponse = (res, { statusCode = 500, message = 'Internal server error', error = null }) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(error && process.env.NODE_ENV !== 'production' && { error: error.message || error })
  });
};

/**
 * Normalizes a ZCQL flattened row array into plain objects (already flattened
 * upstream in datastoreService, but kept here in case a route needs to
 * re-flatten a raw ZCQL result directly).
 */
export const flattenZcqlRows = (rawResult, tableName) => {
  if (!Array.isArray(rawResult)) return [];
  return rawResult.map((row) => row[tableName]);
};

/**
 * Basic ISO-8601 date validator/normalizer used across report & forecast
 * date-range inputs.
 */
export const normalizeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0]; // YYYY-MM-DD
};

/**
 * Simple pagination helper for list endpoints.
 */
export const paginate = (array, page = 1, pageSize = 25) => {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    items: array.slice(start, end),
    page,
    pageSize,
    totalItems: array.length,
    totalPages: Math.ceil(array.length / pageSize)
  };
};

export const success = (res, data, message = 'Success', statusCode = 200, meta = {}) => {
  return successResponse(res, { statusCode, message, data, meta });
};

export const error = (res, message = 'Error', statusCode = 500, error = null) => {
  return errorResponse(res, { statusCode, message, error });
};

export default {
  successResponse,
  errorResponse,
  success,
  error,
  flattenZcqlRows,
  normalizeDate,
  paginate
};