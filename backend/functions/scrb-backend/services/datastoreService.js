// // File: backend/services/datastoreService.js

// import { TABLES, PII_FIELDS } from '../utils/constants.js';
// import logger from '../utils/logger.js';

// const TABLE_MAP = {
//   CRIME_COUNT_BY_ZONE: {
//     table: TABLES.CRIME_RECORDS,
//     build: (entities) => {
//       const zone = sanitize(entities.zone);
//       const dateFrom = sanitize(entities.dateFrom);
//       const dateTo = sanitize(entities.dateTo);
//       let query = `SELECT ROWID, CRIME_TYPE, ZONE, REPORTED_DATE FROM ${TABLES.CRIME_RECORDS} WHERE ZONE = '${zone}'`;
//       if (dateFrom) query += ` AND REPORTED_DATE >= '${dateFrom}'`;
//       if (dateTo) query += ` AND REPORTED_DATE <= '${dateTo}'`;
//       query += ' LIMIT 2000';
//       return query;
//     }
//   },
//   CRIME_LIST_BY_TYPE: {
//     table: TABLES.CRIME_RECORDS,
//     build: (entities) => {
//       const crimeType = sanitize(entities.crimeType);
//       return `SELECT ROWID, CRIME_TYPE, ZONE, STATUS, REPORTED_DATE FROM ${TABLES.CRIME_RECORDS} WHERE CRIME_TYPE = '${crimeType}' LIMIT 2000`;
//     }
//   },
//   TREND_ANALYSIS: {
//     table: TABLES.CRIME_RECORDS,
//     build: (entities) => {
//       const zone = sanitize(entities.zone);
//       const months = parseInt(entities.months, 10) || 6;
//       return `SELECT CRIME_TYPE, ZONE, REPORTED_DATE FROM ${TABLES.CRIME_RECORDS} WHERE ZONE = '${zone}' ORDER BY REPORTED_DATE DESC LIMIT ${months * 500}`;
//     }
//   },
//   CASE_LOOKUP: {
//     table: TABLES.CASE_FILES,
//     build: (entities) => {
//       const caseId = sanitize(entities.caseId);
//       return `SELECT * FROM ${TABLES.CASE_FILES} WHERE CASE_ID = '${caseId}' LIMIT 1`;
//     }
//   }
// };

// function sanitize(value) {
//   if (value === undefined || value === null) return '';
//   return String(value).replace(/'/g, "''");
// }

// function redactForRole(records, role) {
//   if (role === 'Investigator') return records;

//   return records.map((record) => {
//     const clone = { ...record };
//     PII_FIELDS.forEach((field) => {
//       if (field in clone) clone[field] = '[REDACTED]';
//     });
//     return clone;
//   });
// }

// export const fetchByIntent = async (catalystApp, { intent, entities = {}, role, requestingUserZuid }) => {
//   try {
//     const mapping = TABLE_MAP[intent];

//     if (!mapping) {
//       const err = new Error(`No Data Store mapping configured for intent: ${intent}`);
//       err.statusCode = 422;
//       throw err;
//     }

//     const query = mapping.build(entities);
//     const zcql = catalystApp.zcql();
//     const rawResult = await zcql.executeZCQLQuery(query);
//     const records = rawResult.map((row) => row[mapping.table]);
//     const redactedRecords = redactForRole(records, role);

//     return {
//       records: redactedRecords,
//       rowCount: redactedRecords.length,
//       queryUsed: query
//     };
//   } catch (err) {
//     logger.error('datastoreService.fetchByIntent', 'Failed', err);
//     throw err;
//   }
// };

// export const getQueryRecord = async (catalystApp, id) => {
//   try {
//     const zcql = catalystApp.zcql();
//     const query = `SELECT * FROM ${TABLES.QUERY_LOG} WHERE ROWID = '${sanitize(id)}' LIMIT 1`;
//     const result = await zcql.executeZCQLQuery(query);
//     if (!result || result.length === 0) return null;
//     return result[0][TABLES.QUERY_LOG];
//   } catch (err) {
//     logger.error('datastoreService.getQueryRecord', 'Failed', err);
//     throw err;
//   }
// };

// export const insertRow = async (catalystApp, tableName, rowData) => {
//   try {
//     const datastore = catalystApp.datastore();
//     const table = datastore.table(tableName);
//     return await table.insertRow(rowData);
//   } catch (err) {
//     logger.error('datastoreService.insertRow', `Failed inserting into ${tableName}`, err);
//     throw err;
//   }
// };

// export const fetchRowsByColumn = async (catalystApp, { table, column, value, limit = 50 }) => {
//   try {
//     const zcql = catalystApp.zcql();
//     const query = `SELECT * FROM ${table} WHERE ${column} = '${sanitize(value)}' ORDER BY CREATEDTIME DESC LIMIT ${limit}`;
//     const result = await zcql.executeZCQLQuery(query);
//     return result.map((row) => row[table]);
//   } catch (err) {
//     logger.error('datastoreService.fetchRowsByColumn', 'Failed', err);
//     throw err;
//   }
// };

// /**
//  * Runs an arbitrary, already-built ZCQL query. Used by reportController
//  * for aggregate queries (COUNT/GROUP BY) that don't fit the intent-mapped
//  * pattern above.
//  */
// export const runRawZcql = async (catalystApp, query) => {
//   try {
//     const zcql = catalystApp.zcql();
//     return await zcql.executeZCQLQuery(query);
//   } catch (err) {
//     logger.error('datastoreService.runRawZcql', 'Failed', { query, error: err.message });
//     throw err;
//   }
// };

// export default {
//   fetchByIntent,
//   getQueryRecord,
//   insertRow,
//   fetchRowsByColumn,
//   runRawZcql
// };


// ============================================================================
// File: services/datastoreService.js
// Generic Data Access Layer for Catalyst Data Store
// ============================================================================

import logger from "../utils/logger.js";
import primaryKeys from "../config/primaryKeys.js";
import { resolveApp } from "./catalystContext.js";

/**
 * Escape quotes for ZCQL
 */
const sanitize = (value) => {
    if (value === undefined || value === null) return "";

    return String(value).replace(/'/g, "''");
};

/**
 * Execute any ZCQL Query
 */
export const executeQuery = async (catalystApp, query) => {

    try {

        // Callers that reached here via the legacy 2-arg shims (which null out
        // catalystApp) fall back to the request-scoped app. See catalystContext.js.
        const zcql = resolveApp(catalystApp, "datastoreService.executeQuery").zcql();

        return await zcql.executeZCQLQuery(query);

    } catch (err) {

        logger.error(
            "datastoreService.executeQuery",
            query,
            err
        );

        throw err;
    }

};

/**
 * Run Raw Query
 */
export const runRawZcql = async (catalystApp, query) => {

    return await executeQuery(catalystApp, query);

};

/**
 * Get All Rows
 */
export const getAllRows = async (

    catalystApp,

    table,

    limit = 300

) => {

    const query = `

        SELECT *

        FROM ${table}

        LIMIT ${limit}

    `;

    const result = await executeQuery(

        catalystApp,

        query

    );

    return result.map(r => r[table]);

};

/**
 * Get One Row By Primary Key
 */
export const getById = async (

    catalystApp,

    table,

    primaryKey,

    id

) => {

    const query = `

        SELECT *

        FROM ${table}

        WHERE ${primaryKey}='${sanitize(id)}'

        LIMIT 1

    `;

    const result = await executeQuery(

        catalystApp,

        query

    );

    if(result.length===0)

        return null;

    return result[0][table];

};

/**
 * Fetch One Row
 */
export const getByColumn = async (

    catalystApp,

    table,

    column,

    value

) => {

    const query = `

        SELECT *

        FROM ${table}

        WHERE ${column}='${sanitize(value)}'

        LIMIT 1

    `;

    const result = await executeQuery(

        catalystApp,

        query

    );

    if(result.length===0)

        return null;

    return result[0][table];

};

/**
 * Fetch Multiple Rows
 */
export const getManyByColumn = async (

    catalystApp,

    table,

    column,

    value,

    limit = 1000

) => {

    const query = `

        SELECT *

        FROM ${table}

        WHERE ${column}='${sanitize(value)}'

        LIMIT ${limit}

    `;

    const result = await executeQuery(

        catalystApp,

        query

    );

    return result.map(

        row => row[table]

    );

};
/**
 * Fetch Rows By Column (supporting both object params and positional params)
 */
export const fetchRowsByColumn = async (catalystApp, arg2, column, value, limit) => {
    if (typeof arg2 === 'object' && arg2 !== null) {
        const { table, column: col, value: val, limit: lim = 50 } = arg2;
        return getManyByColumn(catalystApp, table, col, val, lim);
    }
    return getManyByColumn(catalystApp, arg2, column, value, limit);
};

/**
 * Search using LIKE
 */
export const searchRows = async (

    catalystApp,

    table,

    column,

    keyword,

    limit=100

)=>{

    const query=`

        SELECT *

        FROM ${table}

        WHERE ${column}

        LIKE '%${sanitize(keyword)}%'

        LIMIT ${limit}

    `;

    const result=await executeQuery(

        catalystApp,

        query

    );

    return result.map(

        r=>r[table]

    );

};

/**
 * Insert Row
 */
export const insertRow = async (

    catalystApp,

    tableName,

    rowData

)=>{

    try{

        const datastore=resolveApp(catalystApp,"datastoreService.insertRow").datastore();

        const table=datastore.table(tableName);

        return await table.insertRow(

            rowData

        );

    }

    catch(err){

        logger.error(

            "datastoreService.insertRow",

            tableName,

            err

        );

        throw err;

    }

};
/**
 * Update Row
 */
export const updateRow = async (

    catalystApp,

    tableName,

    rowData

) => {

    try {

        const datastore = resolveApp(catalystApp, "datastoreService.updateRow").datastore();

        const table = datastore.table(tableName);

        return await table.updateRow(rowData);

    } catch (err) {

        logger.error(

            "datastoreService.updateRow",

            tableName,

            err

        );

        throw err;

    }

};

/**
 * Delete Row
 */
export const deleteRow = async (

    catalystApp,

    tableName,

    rowId

) => {

    try {

        const datastore = resolveApp(catalystApp, "datastoreService.deleteRow").datastore();

        const table = datastore.table(tableName);

        return await table.deleteRow(rowId);

    }

    catch (err) {

        logger.error(

            "datastoreService.deleteRow",

            tableName,

            err

        );

        throw err;

    }

};

/**
 * Get Rows By Multiple Values
 *
 * Example:
 *
 * districtid IN (1,2,3)
 *
 */
export const getRowsByIds = async (

    catalystApp,

    table,

    column,

    ids = []

) => {

    if (!ids.length) return [];

    const values = ids
        .map(id => `'${sanitize(id)}'`)
        .join(",");

    const query = `

        SELECT *

        FROM ${table}

        WHERE ${column}

        IN (${values})

    `;

    const result = await executeQuery(

        catalystApp,

        query

    );

    return result.map(

        row => row[table]

    );

};

/**
 * Pagination
 */
export const getPagedRows = async (

    catalystApp,

    table,

    page = 1,

    limit = 100

) => {

    const offset = (page - 1) * limit;

    const query = `

        SELECT *

        FROM ${table}

        LIMIT ${limit}

        OFFSET ${offset}

    `;

    const result = await executeQuery(

        catalystApp,

        query

    );

    return result.map(

        row => row[table]

    );

};

/**
 * Count Records
 */
export const countRows = async (

    catalystApp,

    table

) => {

    const query = `

        SELECT COUNT(*) AS total

        FROM ${table}

    `;

    const result = await executeQuery(

        catalystApp,

        query

    );

    return Number(

        result[0].total

    );

};

/**
 * Check Record Exists
 */
export const exists = async (

    catalystApp,

    table,

    column,

    value

) => {

    const row = await getByColumn(

        catalystApp,

        table,

        column,

        value

    );

    return row !== null;

};

/**
 * Generic WHERE Query
 *
 * Example
 *
 * getRows(
 *      "employee",
 *      "districtid=5 AND rankid=2"
 * )
 *
 */
export const getRows = async (

    catalystApp,

    table,

    whereClause = "",

    limit = 1000

) => {

    let query = `

        SELECT *

        FROM ${table}

    `;

    if (whereClause) {

        query += `

            WHERE ${whereClause}

        `;

    }

    query += `

        LIMIT ${limit}

    `;

    const result = await executeQuery(

        catalystApp,

        query

    );

    return result.map(

        row => row[table]

    );

};

/**
 * Get Distinct Values
 */
export const getDistinct = async (

    catalystApp,

    table,

    column

) => {

    const query = `

        SELECT DISTINCT ${column}

        FROM ${table}

    `;

    return await executeQuery(

        catalystApp,

        query

    );

};

export const getRecordById = async (catalystApp, table, id) => {
    if (typeof catalystApp === 'string') {
        id = table;
        table = catalystApp;
        catalystApp = null;
    }
    const pk = primaryKeys[table] || `${table}id`;
    return getById(catalystApp, table, pk, id);
};

export const getRecordsByField = async (catalystApp, table, fieldName, value) => {
    if (typeof catalystApp === 'string') {
        value = fieldName;
        fieldName = table;
        table = catalystApp;
        catalystApp = null;
    }
    return getManyByColumn(catalystApp, table, fieldName, value);
};

export const getRecords = async (catalystApp, table, options) => {
    let opts = options;
    let tbl = table;
    if (typeof catalystApp === 'string') {
        opts = table;
        tbl = catalystApp;
        catalystApp = null;
    }
    const where = opts?.where || "";
    const limit = opts?.limit || 1000;
    return getRows(catalystApp, tbl, where, limit);
};

export const searchRecords = async (catalystApp, table, searchTerm, columns = []) => {
    let term = searchTerm;
    let tbl = table;
    let cols = columns;
    if (typeof catalystApp === 'string') {
        cols = searchTerm || [];
        term = table;
        tbl = catalystApp;
        catalystApp = null;
    }
    const col = cols[0] || 'Name';
    return searchRows(catalystApp, tbl, col, term);
};

export const executeZCQL = async (catalystApp, zcqlQuery) => {
    if (typeof catalystApp === 'string') {
        zcqlQuery = catalystApp;
        catalystApp = null;
    }
    return executeQuery(catalystApp, zcqlQuery);
};

export const query = async (catalystApp, builtQuery) => {
    if (!builtQuery && catalystApp) {
        builtQuery = catalystApp;
        catalystApp = null;
    }
    const q = typeof builtQuery === 'string' ? builtQuery : builtQuery?.query;
    const table = typeof builtQuery === 'object' ? builtQuery?.table : null;
    const raw = await runRawZcql(catalystApp, q);
    if (table && Array.isArray(raw)) {
        return raw.map(r => (r && r[table]) ? r[table] : r);
    }
    return raw;
};

/**
 * Export Everything
 */
export default {

    executeQuery,

    runRawZcql,

    getAllRows,

    getById,

    getByColumn,

    getManyByColumn,

    getRowsByIds,

    getPagedRows,

    getRows,

    searchRows,

    countRows,

    exists,

    getDistinct,

    insertRow,

    updateRow,

    deleteRow,

    getRecordById,

    getRecordsByField,

    getRecords,

    searchRecords,

    executeZCQL,

    query

};