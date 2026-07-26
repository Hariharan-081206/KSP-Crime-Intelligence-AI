// ============================================================================
// File: backend/controllers/mapController.js
// ============================================================================

import * as mapService from "../services/mapService.js";

import {
    successResponse,
    errorResponse
} from "../utils/formatter.js";

import logger from "../utils/logger.js";

import { HTTP_STATUS } from "../utils/constants.js";

// ============================================================================
// Get All Crime Locations
// GET /map/crimes
// ============================================================================

export const getCrimeLocations = async (req, res) => {

    try {

        const catalystApp = req.catalystApp;

        const locations = await mapService.getCrimeLocations(
            catalystApp
        );

        return successResponse(res, {

            message: "Crime locations fetched successfully.",

            data: locations

        });

    }

    catch (err) {

        logger.error(

            "mapController.getCrimeLocations",

            err

        );

        return errorResponse(res, {

            statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,

            message: "Unable to fetch crime locations.",

            error: err

        });

    }

};

// ============================================================================
// Get One Case Location
// GET /map/case/:id
// ============================================================================

export const getCaseLocation = async (req, res) => {

    try {

        const catalystApp = req.catalystApp;

        const { id } = req.params;

        const location =

            await mapService.getCaseLocation(

                catalystApp,

                id

            );

        if (!location) {

            return errorResponse(res, {

                statusCode: HTTP_STATUS.NOT_FOUND,

                message: "Case not found."

            });

        }

        return successResponse(res, {

            message: "Case location fetched successfully.",

            data: location

        });

    }

    catch (err) {

        logger.error(

            "mapController.getCaseLocation",

            err

        );

        return errorResponse(res, {

            statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,

            message: "Unable to fetch case location.",

            error: err

        });

    }

};

// ============================================================================
// Get Crimes of One District
// GET /map/district/:districtId
// ============================================================================

export const getDistrictCrimes = async (req, res) => {

    try {

        const catalystApp = req.catalystApp;

        const { districtId } = req.params;

        const crimes =

            await mapService.getDistrictCrimes(

                catalystApp,

                districtId

            );

        return successResponse(res, {

            message: "District crimes fetched successfully.",

            data: crimes

        });

    }

    catch (err) {

        logger.error(

            "mapController.getDistrictCrimes",

            err

        );

        return errorResponse(res, {

            statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,

            message: "Unable to fetch district crimes.",

            error: err

        });

    }

};

// ============================================================================
// Get Crime Hotspots
// GET /map/hotspots
// ============================================================================

export const getCrimeHotspots = async (req, res) => {

    try {

        const catalystApp = req.catalystApp;

        const hotspots =

            await mapService.getCrimeHotspots(

                catalystApp

            );

        return successResponse(res, {

            message: "Crime hotspots fetched successfully.",

            data: hotspots

        });

    }

    catch (err) {

        logger.error(

            "mapController.getCrimeHotspots",

            err

        );

        return errorResponse(res, {

            statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,

            message: "Unable to fetch hotspots.",

            error: err

        });

    }

};

// ============================================================================
// Get Police Stations
// GET /map/stations
// ============================================================================

export const getPoliceStations = async (req, res) => {

    try {

        const catalystApp = req.catalystApp;

        const stations =

            await mapService.getPoliceStations(

                catalystApp

            );

        return successResponse(res, {

            message: "Police station statistics fetched successfully.",

            data: stations

        });

    }

    catch (err) {

        logger.error(

            "mapController.getPoliceStations",

            err

        );

        return errorResponse(res, {

            statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,

            message: "Unable to fetch police stations.",

            error: err

        });

    }

};

// ============================================================================
// Get HeatMap Data
// GET /map/heatmap
// ============================================================================

export const getHeatMapData = async (req, res) => {

    try {

        const catalystApp = req.catalystApp;

        const heatmap =

            await mapService.getHeatMapData(

                catalystApp

            );

        return successResponse(res, {

            message: "Heatmap data fetched successfully.",

            data: heatmap

        });

    }

    catch (err) {

        logger.error(

            "mapController.getHeatMapData",

            err

        );

        return errorResponse(res, {

            statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,

            message: "Unable to fetch heatmap.",

            error: err

        });

    }

};

// ============================================================================
// Dashboard Summary
// GET /map/dashboard
// ============================================================================

export const getDashboardSummary = async (req, res) => {

    try {

        const catalystApp = req.catalystApp;

        const summary =

            await mapService.getDashboardMapSummary(

                catalystApp

            );

        return successResponse(res, {

            message: "Dashboard summary fetched successfully.",

            data: summary

        });

    }

    catch (err) {

        logger.error(

            "mapController.getDashboardSummary",

            err

        );

        return errorResponse(res, {

            statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,

            message: "Unable to fetch dashboard summary.",

            error: err

        });

    }

};

// ============================================================================
// Default Export
// ============================================================================

export default {

    getCrimeLocations,

    getCaseLocation,

    getDistrictCrimes,

    getCrimeHotspots,

    getPoliceStations,

    getHeatMapData,

    getDashboardSummary

};