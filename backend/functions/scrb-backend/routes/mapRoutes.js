// ============================================================================
// File: backend/routes/mapRoutes.js
// ============================================================================

import express from "express";

import * as mapController from "../controllers/mapController.js";

import validateRequest from "../middlewares/validateRequest.js";

import authMiddleware from "../middlewares/authMiddleware.js";

import roleMiddleware from "../middlewares/roleMiddleware.js";

import { ALL_ROLES } from "../utils/constants.js";

const router = express.Router();

// RBAC (spec §5): map data is readable by all three roles. Enforced at the
// infrastructure level, not just the UI — authMiddleware resolves the Catalyst
// session (which carries the role assigned in the Catalyst console) and
// roleMiddleware checks it against this route's allow-list.
router.use(authMiddleware, roleMiddleware(ALL_ROLES));

// ============================================================================
// Crime Locations
// GET /map/crimes
// ============================================================================

router.get(
    "/crimes",
    validateRequest(),
    mapController.getCrimeLocations
);

// ============================================================================
// Single Case Location
// GET /map/case/:id
// ============================================================================

router.get(
    "/case/:id",
    validateRequest(),
    mapController.getCaseLocation
);

// ============================================================================
// Crimes by District
// GET /map/district/:districtId
// ============================================================================

router.get(
    "/district/:districtId",
    validateRequest(),
    mapController.getDistrictCrimes
);

// ============================================================================
// Crime Hotspots
// GET /map/hotspots
// ============================================================================

router.get(
    "/hotspots",
    validateRequest(),
    mapController.getCrimeHotspots
);

// ============================================================================
// Police Stations
// GET /map/stations
// ============================================================================

router.get(
    "/stations",
    validateRequest(),
    mapController.getPoliceStations
);

// ============================================================================
// HeatMap Data
// GET /map/heatmap
// ============================================================================

router.get(
    "/heatmap",
    validateRequest(),
    mapController.getHeatMapData
);

// ============================================================================
// Dashboard Summary
// GET /map/dashboard
// ============================================================================

router.get(
    "/dashboard",
    validateRequest(),
    mapController.getDashboardSummary
);

// ============================================================================
// Export Router
// ============================================================================

export default router;