/**
 * routes/behaviouralProfileRoutes.js
 *
 * Mount point: app.use('/profile', behaviouralProfileRoutes)
 *
 *   GET  /profile/behavioral?accused_id=…   (spec §8 — the frontend's call)
 *   GET  /profile/behavioral/:accusedId     (path-param form, retained)
 *   POST /profile/query
 *   POST /profile/generate
 */

import express from 'express';
import validateRequest from '../middlewares/validateRequest.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import { ALL_ROLES } from '../utils/constants.js';
import {
  getProfileByAccusedId,
  queryProfiles,
  generateProfilesHandler,
} from '../controllers/behaviouralProfileController.js';

const router = express.Router();

// RBAC (spec §5): behavioural profiles are readable by all three roles; PII
// masking is applied per-role in the response layer (server-side, not just UI).
router.use(authMiddleware, roleMiddleware(ALL_ROLES));

/**
 * Validation schemas passed to the shared validateRequest middleware.
 * Adjust field names here if your validateRequest.js expects a different
 * schema shape (e.g. Joi/Yup vs a plain descriptor object) — the routes
 * below are the only place that needs to change.
 */
const querySchema = {
  body: {
    question: { type: 'string', required: true, minLength: 1 },
  },
};

const generateSchema = {
  body: {
    caseId: { type: 'string', required: false },
    crimeNumber: { type: 'string', required: false },
    accusedId: { type: 'string', required: false },
    accusedName: { type: 'string', required: false },
    district: { type: 'string', required: false },
    crimeHead: { type: 'string', required: false },
    crimeType: { type: 'string', required: false },
    financialTransaction: { type: 'string', required: false },
    bankAccount: { type: 'string', required: false },
    question: { type: 'string', required: false },
  },
};

const profileParamsSchema = {
  params: {
    accusedId: { type: 'string', required: true, minLength: 1 },
  },
};

// The frontend scopes the profile with a query param (`?accused_id=`) and also
// calls it bare — see frontend/src/api/services/profileService.js. `accused_id`
// is therefore optional here and the controller resolves either form.
const profileQuerySchema = {
  query: {
    accused_id: { type: 'string', required: false },
  },
};

// GET /profile/behavioral?accused_id=…  — spec §8, the path the SPA calls.
router.get('/behavioral', validateRequest(profileQuerySchema), getProfileByAccusedId);

// GET /profile/behavioral/:accusedId — equivalent path-param form, retained so
// the previous `/behaviour/profile/:accusedId` capability is not lost.
router.get('/behavioral/:accusedId', validateRequest(profileParamsSchema), getProfileByAccusedId);

router.post('/query', validateRequest(querySchema), queryProfiles);
router.post('/generate', validateRequest(generateSchema), generateProfilesHandler);

export default router;
