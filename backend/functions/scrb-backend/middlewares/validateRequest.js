// File: backend/middleware/validateRequest.js

import { errorResponse } from '../utils/formatter.js';
import { HTTP_STATUS } from '../utils/constants.js';

/**
 * validateRequest
 * ---------------------------------------------------------------------------
 * Lightweight schema-based request validator — no external dependency
 * (Joi/Zod) added yet, since none is currently in package.json. Swap this
 * out for Joi/Zod if you'd rather standardize on a validation library;
 * the middleware signature below would stay identical.
 *
 * Schema format:
 *   {
 *     body: {
 *       question: { required: true, type: 'string', maxLength: 1000 },
 *       zone:     { required: false, type: 'string' }
 *     },
 *     query: { ... },
 *     params: { ... }
 *   }
 */
const validateRequest = (schema = {}) => {
  return (req, res, next) => {
    const errors = [];

    ['body', 'query', 'params'].forEach((location) => {
      const rules = schema[location];
      if (!rules) return;

      const data = req[location] || {};

      Object.entries(rules).forEach(([field, rule]) => {
        const value = data[field];

        if (rule.required && (value === undefined || value === null || value === '')) {
          errors.push(`"${field}" is required in ${location}.`);
          return;
        }

        if (value === undefined || value === null) return; // optional & absent, skip further checks

        if (rule.type && typeof value !== rule.type) {
          errors.push(`"${field}" in ${location} must be of type ${rule.type}.`);
        }

        if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
          errors.push(`"${field}" in ${location} exceeds maximum length of ${rule.maxLength}.`);
        }

        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`"${field}" in ${location} must be one of: ${rule.enum.join(', ')}.`);
        }
      });
    });

    if (errors.length > 0) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.BAD_REQUEST,
        message: `Validation failed: ${errors.join(' ')}`
      });
    }

    next();
  };
};

export default validateRequest;