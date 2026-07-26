// File: backend/routes/forecastRoutes.js

import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import validateRequest from '../middlewares/validateRequest.js';
import * as forecastController from '../controllers/forecastController.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

// POST /predict/forecast — spec §8 (router mounted at /predict).
//
// The frontend sends { district, crime_type, window_days }; internal callers may
// still send { region, crimeType, horizon }. Nothing is `required` at this layer
// because either spelling satisfies the contract and this validator cannot
// express "one of these two" — presence and type are enforced in
// forecastController.getForecast, which normalizes the aliases and returns a
// specific 400 naming the §8 field.
//
// `window_days` is declared as a number (the SPA sends `windowDays = 30`), while
// the legacy `horizon` was a string like "30d"; the controller accepts both.
router.post(
  '/forecast',
  authMiddleware,
  roleMiddleware([ROLES.ANALYST]),
  validateRequest({
    body: {
      district: { required: false, type: 'string' },
      crime_type: { required: false, type: 'string' },
      window_days: { required: false, type: 'number' },
      // Backward-compatible aliases.
      region: { required: false, type: 'string' },
      crimeType: { required: false, type: 'string' },
      horizon: { required: false, type: 'string' },
      features: { required: false, type: 'object' }
    }
  }),
  forecastController.getForecast
);

export default router;