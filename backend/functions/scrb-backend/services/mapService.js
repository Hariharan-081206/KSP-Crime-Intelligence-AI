// ============================================================================
// File: backend/services/mapService.js
// PART 1
// ============================================================================
//
// EXPANDED-RECORD ALIASES
// -----------------------
// relationshipService.expandRecord names each expanded relation
// `foreignKey.replace(/id$/i, '')`, so the alias follows the FOREIGN KEY on the
// source table, not the name of the table it points at. For `casemaster`
// (config/relationships.js) that gives:
//
//   policestationid -> .policestation   (table `unit`)
//   policepersonid  -> .policeperson    (table `employee`)
//   crimemajorheadid-> .crimemajorhead  (table `crimehead`)
//   crimeminorheadid-> .crimeminorhead  (table `crimesubhead`)
//   casestatusid    -> .casestatus      (table `casestatusmaster`)
//   courtid         -> .court
//
// This file previously read `.unit`, `.crimehead` and `.casestatusmaster` —
// the TABLE names. `casemaster` has no `unitid` column at all, so every one of
// those reads was undefined on every row. The visible symptom was
// getCrimeHotspots bucketing all 300 cases under "Unknown" and the SPA drawing
// a single hotspot for the whole state.
//
// Nested aliases follow the same rule from the target table's own config:
// `unit.districtid -> .district`, `district.stateid -> .state`, hence
// `record.policestation.district.state`.
// ============================================================================

import logger from "../utils/logger.js";
import relationshipService from "./relationshipService.js";
import * as datastoreService from "./datastoreService.js";

// ============================================================================
// Utility
// ============================================================================

const sanitize = (value) => {

    if (value === undefined || value === null)
        return "";

    return String(value).replace(/'/g, "''");

};

// ============================================================================
// Execute ZCQL
// ============================================================================

const execute = async (catalystApp, query) => {

    try {

        return await datastoreService.executeQuery(

            catalystApp,

            query

        );

    }

    catch (err) {

        logger.error(

            "mapService.execute",

            err

        );

        throw err;

    }

};

// ============================================================================
// Get all crime locations
// ============================================================================

export const getCrimeLocations = async (

    catalystApp

) => {

    const query = `

        SELECT *

        FROM casemaster

        WHERE latitude IS NOT NULL

        AND longitude IS NOT NULL

        LIMIT 300

    `;

    const result = await execute(

        catalystApp,

        query

    );

    const rows = result.map(

        row => row.casemaster

    );

    const expanded = await relationshipService.expandMany(

        catalystApp,

        "casemaster",

        rows

    );

    return expanded.map(

        record => ({

            caseId:

                record.casemasterid,

            crimeNo:

                record.crimeno,

            caseNo:

                record.caseno,

            latitude:

                record.latitude,

            longitude:

                record.longitude,

            policeStation:

                record.policestation?.unitname ||

                record.policestationid ||

                null,

            district:

                record.policestation?.district?.districtname ||

                null,

            state:

                record.policestation?.district?.state?.statename ||

                null,

            crimeHead:

                record.crimemajorhead?.crimeheadname ||

                null,

            status:

                record.casestatus?.statusname ||

                null

        })

    );

};

// ============================================================================
// Get one Case Location
// ============================================================================

export const getCaseLocation = async (

    catalystApp,

    caseId

) => {

    const query = `

        SELECT *

        FROM casemaster

        WHERE casemasterid='${sanitize(caseId)}'

        LIMIT 1

    `;

    const result = await execute(

        catalystApp,

        query

    );

    if (

        !result ||

        result.length === 0

    ) {

        return null;

    }

    const record =

        await relationshipService.expandRecord(

            catalystApp,

            "casemaster",

            result[0].casemaster

        );

    return {

        caseId:

            record.casemasterid,

        crimeNo:

            record.crimeno,

        caseNo:

            record.caseno,

        latitude:

            record.latitude,

        longitude:

            record.longitude,

        briefFacts:

            record.brieffacts,

        policeStation:

            record.policestation?.unitname ||

            record.policestationid ||

            null,

        district:

            record.policestation?.district?.districtname ||

            null,

        state:

            record.policestation?.district?.state?.statename ||

            null

    };

};

// ============================================================================
// Get crimes in one district
// ============================================================================

export const getDistrictCrimes = async (

    catalystApp,

    districtId

) => {

    const query = `

        SELECT *

        FROM casemaster

        LIMIT 300

    `;

    const result = await execute(

        catalystApp,

        query

    );

    const rows = result.map(

        row => row.casemaster

    );

    const expanded = await relationshipService.expandMany(

        catalystApp,

        "casemaster",

        rows

    );

    return expanded.filter(

        record =>

            String(

                record.policestation?.districtid

            ) ===

            String(districtId)

    );

};
// ============================================================================
// Crime Hotspots
// ============================================================================

export const getCrimeHotspots = async (catalystApp) => {

    const query = `
        SELECT *
        FROM casemaster
        WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
        LIMIT 300
    `;

    const result = await execute(catalystApp, query);

    const rows = result.map(row => row.casemaster);

    const expanded = await relationshipService.expandMany(
        catalystApp,
        "casemaster",
        rows
    );

    const hotspotMap = {};

    expanded.forEach(record => {

        const district =
            record.policestation?.district?.districtname || "Unknown";

        if (!hotspotMap[district]) {

            hotspotMap[district] = {

                district,

                crimeCount: 0,

                latitude: record.latitude,

                longitude: record.longitude

            };

        }

        hotspotMap[district].crimeCount++;

    });

    return Object.values(hotspotMap);

};

// ============================================================================
// Police Station Statistics
// ============================================================================

export const getPoliceStations = async (catalystApp) => {

    const query = `
        SELECT *
        FROM casemaster
        LIMIT 300
    `;

    const result = await execute(catalystApp, query);

    const rows = result.map(row => row.casemaster);

    const expanded = await relationshipService.expandMany(
        catalystApp,
        "casemaster",
        rows
    );

    const stationMap = {};

    expanded.forEach(record => {

        const stationId =
            record.policestationid || "UNKNOWN";

        const stationName =
            record.policestation?.unitname || stationId;

        if (!stationMap[stationId]) {

            stationMap[stationId] = {

                stationId,

                stationName,

                district:
                    record.policestation?.district?.districtname || null,

                state:
                    record.policestation?.district?.state?.statename || null,

                crimeCount: 0

            };

        }

        stationMap[stationId].crimeCount++;

    });

    return Object.values(stationMap);

};

// ============================================================================
// HeatMap Data
// ============================================================================

export const getHeatMapData = async (catalystApp) => {

    const query = `
        SELECT *
        FROM casemaster
        WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
        LIMIT 300
    `;

    const result = await execute(catalystApp, query);

    const rows = result.map(row => row.casemaster);

    return rows.map(record => ({

        lat: record.latitude,

        lng: record.longitude,

        weight: 1,

        caseId: record.casemasterid,

        crimeNo: record.crimeno

    }));

};

// ============================================================================
// Dashboard Summary
// ============================================================================

export const getDashboardMapSummary = async (catalystApp) => {

    const crimes = await getCrimeLocations(catalystApp);

    const hotspots = await getCrimeHotspots(catalystApp);

    const stations = await getPoliceStations(catalystApp);

    return {

        totalCrimeLocations: crimes.length,

        totalHotspots: hotspots.length,

        totalPoliceStations: stations.length,

        hotspots,

        stations

    };

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

    getDashboardMapSummary

};