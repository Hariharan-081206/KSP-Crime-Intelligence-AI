// ============================================================================
// relationshipService.js
// SCRB Generic Relationship Engine
// ============================================================================

import relationships from "../config/relationships.js";
import datastoreService from "./datastoreService.js";
import logger from "../utils/logger.js";
import primaryKeys from "../config/primaryKeys.js";

/*
|--------------------------------------------------------------------------
| Master Table Cache
|--------------------------------------------------------------------------
|
| Master tables are loaded only once.
| All relationship lookups happen from memory.
|
*/

const CACHE = new Map();

/*
|--------------------------------------------------------------------------
| Cache Initialization
|--------------------------------------------------------------------------
*/

export const initialize = async (catalystApp) => {

    logger.info("Loading relationship cache...");

    //const tables = Object.keys(relationships);
    const tables = [
    "state",
    "district",
    "unittype",
    "unit",
    "rank",
    "designation",
    "employee",
    "court",
    "religionmaster",
    "castemaster",
    "occupationmaster",
    "casecategory",
    "casestatusmaster",
    "gravityoffence",
    "crimehead",
    "crimesubhead",
    "act",
    "section"
];

    for (const table of tables) {

        try {

            const rows = await datastoreService.getAllRows(
                catalystApp,
                table
            );

            const tableCache = new Map();

            if (rows.length > 0) {

                const pk = primaryKeys[table];

                    if (!pk) {

                        logger.warn(
                            `Primary key not configured for ${table}`
                        );

                        continue;

                    }

                rows.forEach(row => {

                    tableCache.set(
                        row[pk],
                        row
                    );

                });

            }

            CACHE.set(
                table,
                tableCache
            );

        }

        catch (err) {

            logger.warn(
                `Skipping cache for table ${table}`
            );

        }

    }

    logger.info("Relationship cache initialized.");

};

/*
|--------------------------------------------------------------------------
| Clear Cache
|--------------------------------------------------------------------------
*/

export const clearCache = () => {

    CACHE.clear();

};

/*
|--------------------------------------------------------------------------
| Reload Cache
|--------------------------------------------------------------------------
*/

export const reloadCache = async (catalystApp) => {

    clearCache();

    await initialize(
        catalystApp
    );

};

/*
|--------------------------------------------------------------------------
| Return cached table
|--------------------------------------------------------------------------
*/

const getTableCache = (table) => {

    if (!CACHE.has(table))
        return null;

    return CACHE.get(table);

};

/*
|--------------------------------------------------------------------------
| Return one cached row
|--------------------------------------------------------------------------
*/

const getCachedRow = (

    table,

    id

) => {

    const tableCache =
        getTableCache(table);

    if (!tableCache)
        return null;

    return tableCache.get(id) || null;

};

/*
|--------------------------------------------------------------------------
| Fetch from DB if cache miss
|--------------------------------------------------------------------------
*/

const fetchRecord = async (

    catalystApp,

    table,

    primaryKey,

    id

) => {

    const cached =
        getCachedRow(
            table,
            id
        );

    if (cached)
        return cached;

    const row =
        await datastoreService.getById(

            catalystApp,

            table,

            primaryKey,

            id

        );

    if (row) {

        let tableCache =
            CACHE.get(table);

        if (!tableCache) {

            tableCache =
                new Map();

            CACHE.set(
                table,
                tableCache
            );

        }

        tableCache.set(
            id,
            row
        );

    }

    return row;

};
// ============================================================================
// Expand One Record
// ============================================================================

export const expandRecord = async (
    catalystApp,
    table,
    record,
    depth = 0,
    maxDepth = 3
) => {

    if (!record) return null;

    if (depth >= maxDepth)
        return record;

    const relationConfig = relationships[table];

    if (!relationConfig)
        return record;

    const expanded = { ...record };

    for (const foreignKey of Object.keys(relationConfig)) {

        const relation = relationConfig[foreignKey];

        const relatedTable = relation[0];
        const relatedPrimaryKey = relation[1];

        const foreignValue = record[foreignKey];

        if (
            foreignValue === null ||
            foreignValue === undefined ||
            foreignValue === ""
        ) {
            continue;
        }

        const relatedRecord = await fetchRecord(
            catalystApp,
            relatedTable,
            relatedPrimaryKey,
            foreignValue
        );

        if (!relatedRecord)
            continue;

        const alias = foreignKey.replace(/id$/i, "");

        expanded[alias] = await expandRecord(
            catalystApp,
            relatedTable,
            relatedRecord,
            depth + 1,
            maxDepth
        );

    }

    return expanded;

};
// ============================================================================
// Expand Multiple Records
// ============================================================================

export const expandMany = async (
    catalystApp,
    table,
    records = [],
    maxDepth = 3
) => {

    if (!Array.isArray(records))
        return [];

    const expanded = [];

    for (const record of records) {

        expanded.push(

            await expandRecord(
                catalystApp,
                table,
                record,
                0,
                maxDepth
            )

        );

    }

    return expanded;

};
// ============================================================================
// Expand Record By Primary Key
// ============================================================================
export const getExpandedById = async (
    catalystApp,
    table,
    id,
    maxDepth = 3
) => {

    const pk = primaryKeys[table];

    if (!pk)
        throw new Error(
            `Primary key not configured for ${table}`
        );

    const row =
        await datastoreService.getById(
            catalystApp,
            table,
            pk,
            id
        );

    if (!row)
        return null;

    return await expandRecord(
        catalystApp,
        table,
        row,
        0,
        maxDepth
    );

};
export const getCasesForAccused = async (catalystApp, accusedId) => {
    if (typeof catalystApp === 'number' || typeof catalystApp === 'string') {
        accusedId = catalystApp;
        catalystApp = null;
    }
    const accusedRows = await datastoreService.getManyByColumn(catalystApp, 'accused', 'accusedmasterid', accusedId);
    const caseIds = [...new Set(accusedRows.map(r => r.casemasterid).filter(Boolean))];
    if (!caseIds.length) return [];
    return await datastoreService.getRowsByIds(catalystApp, 'casemaster', 'casemasterid', caseIds);
};

export const getRelatedAccusedForCase = async (catalystApp, caseId) => {
    if (typeof catalystApp === 'number' || typeof catalystApp === 'string') {
        caseId = catalystApp;
        catalystApp = null;
    }
    return await datastoreService.getManyByColumn(catalystApp, 'accused', 'casemasterid', caseId);
};

export const getBankAccountsForAccused = async (catalystApp, accusedId) => {
    if (typeof catalystApp === 'number' || typeof catalystApp === 'string') {
        accusedId = catalystApp;
        catalystApp = null;
    }
    return await datastoreService.getManyByColumn(catalystApp, 'bankaccountlink', 'accusedmasterid', accusedId);
};

export const getTransactionsForAccount = async (catalystApp, accountId) => {
    if (typeof catalystApp === 'number' || typeof catalystApp === 'string') {
        accountId = catalystApp;
        catalystApp = null;
    }
    const src = await datastoreService.getManyByColumn(catalystApp, 'financialtransaction', 'sourceaccountid', accountId);
    const dst = await datastoreService.getManyByColumn(catalystApp, 'financialtransaction', 'destinationaccountid', accountId);
    const combined = [...src, ...dst];
    const unique = new Map();
    combined.forEach(item => {
        const id = item.transactionid || item.ROWID;
        if (id) unique.set(id, item);
    });
    return Array.from(unique.values());
};

export const getAlertsForAccount = async (catalystApp, accountId) => {
    if (typeof catalystApp === 'number' || typeof catalystApp === 'string') {
        accountId = catalystApp;
        catalystApp = null;
    }
    const txns = await getTransactionsForAccount(catalystApp, accountId);
    const txnIds = txns.map(t => t.transactionid || t.ROWID).filter(Boolean);
    if (!txnIds.length) return [];
    return await datastoreService.getRowsByIds(catalystApp, 'transactionalert', 'transactionid', txnIds);
};

export const getVictimsForCase = async (catalystApp, caseId) => {
    if (typeof catalystApp === 'number' || typeof catalystApp === 'string') {
        caseId = catalystApp;
        catalystApp = null;
    }
    return await datastoreService.getManyByColumn(catalystApp, 'victim', 'casemasterid', caseId);
};

export const getAssociatesForAccused = async (catalystApp, accusedId, depth = 1) => {
    if (typeof catalystApp === 'number' || typeof catalystApp === 'string') {
        depth = accusedId || 1;
        accusedId = catalystApp;
        catalystApp = null;
    }
    const cases = await getCasesForAccused(catalystApp, accusedId);
    const caseIds = cases.map(c => c.casemasterid || c.ROWID).filter(Boolean);
    if (!caseIds.length) return [];
    const coAccused = await datastoreService.getRowsByIds(catalystApp, 'accused', 'casemasterid', caseIds);
    return coAccused.filter(a => String(a.accusedmasterid) !== String(accusedId));
};

export const getSharedCases = async (catalystApp, accusedIdA, accusedIdB) => {
    if (typeof catalystApp === 'number' || typeof catalystApp === 'string') {
        accusedIdB = accusedIdA;
        accusedIdA = catalystApp;
        catalystApp = null;
    }
    const casesA = await getCasesForAccused(catalystApp, accusedIdA);
    const casesB = await getCasesForAccused(catalystApp, accusedIdB);
    const idsB = new Set(casesB.map(c => c.casemasterid || c.ROWID));
    return casesA.filter(c => idsB.has(c.casemasterid || c.ROWID));
};

export const getRelatedRecords = async (catalystApp, tableName, recordId, relatedTable, foreignKey) => {
    if (typeof catalystApp === 'string') {
        foreignKey = relatedTable;
        relatedTable = recordId;
        recordId = tableName;
        tableName = catalystApp;
        catalystApp = null;
    }
    if (tableName === 'accused' && relatedTable === 'casemaster') {
        return getCasesForAccused(catalystApp, recordId);
    }
    if (tableName === 'casemaster' && relatedTable === 'accused') {
        return getRelatedAccusedForCase(catalystApp, recordId);
    }
    if (tableName === 'accused' && relatedTable === 'bankaccountlink') {
        return getBankAccountsForAccused(catalystApp, recordId);
    }
    if (tableName === 'bankaccountlink' && relatedTable === 'financialtransaction') {
        return getTransactionsForAccount(catalystApp, recordId);
    }
    if (tableName === 'casemaster' && relatedTable === 'victim') {
        return getVictimsForCase(catalystApp, recordId);
    }
    const fk = foreignKey || primaryKeys[tableName] || `${tableName}id`;
    return datastoreService.getManyByColumn(catalystApp, relatedTable, fk, recordId);
};

export const expand = async (catalystApp, records, options) => {
    if (Array.isArray(catalystApp)) {
        options = records;
        records = catalystApp;
        catalystApp = null;
    }
    const table = (records && records[0] && records[0].casemasterid) ? 'casemaster' : 'accused';
    return expandMany(catalystApp, table, records);
};

export default {
    initialize,
    reloadCache,
    clearCache,
    expandRecord,
    expandMany,
    getExpandedById,
    getCasesForAccused,
    getRelatedAccusedForCase,
    getBankAccountsForAccused,
    getTransactionsForAccount,
    getAlertsForAccount,
    getVictimsForCase,
    getAssociatesForAccused,
    getSharedCases,
    getRelatedRecords,
    expand,
};
