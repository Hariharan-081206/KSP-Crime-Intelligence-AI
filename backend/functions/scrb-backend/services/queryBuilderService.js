    // ============================================================================
    // File: services/queryBuilderService.js
    // Builds ZCQL queries from QuickML intents
    // ============================================================================

    import queryMap from "../config/querymap.js";
    import logger from "../utils/logger.js";

    /**
     * Escape quotes
     */
    const sanitize = (value) => {

        if (value === undefined || value === null)
            return "";

        return String(value).replace(/'/g, "''");

    };

    /**
     * Build WHERE clause
     */
    const buildWhereClause = (mapping, entities = {}) => {

        const clauses = [];

        if (!mapping.where)
            return "";

        for (const entityName of Object.keys(mapping.where)) {

            const column = mapping.where[entityName];

            const value = entities[entityName];

            if (
                value === undefined ||
                value === null ||
                value === ""
            ) {
                continue;
            }

            clauses.push(

                `${column}='${sanitize(value)}'`

            );

        }

        return clauses.join(" AND ");

    };

    /**
     * Build ORDER BY
     */
    const buildOrderBy = (mapping) => {

        if (!mapping.orderBy)
            return "";

        return ` ORDER BY ${mapping.orderBy}`;

    };

    /**
     * Build LIMIT
     */
    const buildLimit = (mapping) => {

        const limit = mapping.limit || 100;

        return ` LIMIT ${limit}`;

    };

    /**
     * Build ZCQL Query
     */
    export const buildQuery = (

        intent,

        entities = {}

    ) => {

        const mapping =

            queryMap[intent] ||

            queryMap.DEFAULT;

        if (!mapping) {

            throw new Error(

                `No query mapping for intent ${intent}`

            );

        }

        let query = `

            SELECT *

            FROM ${mapping.table}

        `;

        const whereClause =

            buildWhereClause(

                mapping,

                entities

            );

        if (whereClause) {

            query += `

                WHERE ${whereClause}

            `;

        }

        query += buildOrderBy(mapping);

        query += buildLimit(mapping);

        return {

            table: mapping.table,

            query

        };

    };

    /**
     * Build Query and Log
     */
    export const buildQueryForIntent = (

        intent,

        entities = {}

    ) => {

        const result =

            buildQuery(

                intent,

                entities

            );

        logger.info(

            "queryBuilderService",

            `Intent=${intent}`

        );

        logger.info(

            "queryBuilderService",

            result.query

        );

        return result;

    };

    export const build = (params, arg2) => {
        if (typeof params === 'string') {
            return buildQuery(params, arg2 || {});
        }
        const { intent, entities = {} } = params || {};
        return buildQuery(intent, entities);
    };

    export const buildZCQL = (tableName, filters = {}, options = {}) => {
        return buildQuery(options.intent || 'DEFAULT', filters).query;
    };

    export { buildWhereClause };

    export default {

        buildQuery,

        buildQueryForIntent,

        build,

        buildWhereClause,

        buildZCQL

    };