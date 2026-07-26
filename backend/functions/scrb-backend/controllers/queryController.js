/**
 * queryController.js (ES Module)
 *
 * Query Processing Pipeline
 *   1. Cache Lookup
 *   2. Intent Extraction (RAG)
 *   3. Query Builder
 *   4. Datastore Query
 *   5. Relationship Expansion
 *   6. Answer Generation
 *   7. Cache Store
 *   8. Audit Log
 */

import * as ragService from "../services/ragService.js";
import * as queryBuilderService from "../services/queryBuilderService.js";
import * as datastoreService from "../services/datastoreService.js";
import * as relationshipService from "../services/relationshipService.js";
import * as auditService from "../services/auditService.js";
import * as cacheService from "../services/cacheService.js";
import logger from "../utils/logger.js";

/**
 * POST /query
 */
export async function handleQuery(req, res) {

    const { filters } = req.body || {};

    // Accept the frontend's `query` field (spec §8); fall back to the `question`
    // alias for backward-compatible internal callers.
    const question = req.body?.query ?? req.body?.question;

    try {

        if (!question || typeof question !== "string") {

            return res.status(400).json({
                success: false,
                error: '"query" is required and must be a string.'
            });

        }

        //----------------------------------------------------------------------
        // Cache Lookup
        //----------------------------------------------------------------------

        const cacheKey =
            cacheService.buildCacheKey?.("query", {
                question,
                filters
            }) ?? `query:${question}`;

        const cached =
            await cacheService.get(
                req.catalystApp,
                cacheKey
            );

        if (cached) {

            return res.status(200).json({
                success: true,
                data: cached,
                cached: true
            });

        }

        //----------------------------------------------------------------------
        // Intent Extraction
        //----------------------------------------------------------------------

        const {
            intent,
            entities,
            confidence,
            rawContext
        } = await ragService.extractIntent(
            question,
            {
                filters,
                userId: req.user?.id
            }
        );

        //----------------------------------------------------------------------
        // Build Query
        //----------------------------------------------------------------------

        const builtQuery =
            queryBuilderService.build({
                intent,
                entities,
                filters
            });

        //----------------------------------------------------------------------
        // Query Datastore
        //----------------------------------------------------------------------

        const records =
            await datastoreService.query(
                req.catalystApp,
                builtQuery
            );

        //----------------------------------------------------------------------
        // Expand Relationships
        //----------------------------------------------------------------------

        const expanded =
            await relationshipService.expand(
                req.catalystApp,
                records,
                {
                    intent,
                    entities
                }
            );

        //----------------------------------------------------------------------
        // Generate Final Answer
        //----------------------------------------------------------------------

        const {
            answer,
            citations
        } = await ragService.generateAnswer(
            question,
            expanded,
            {
                intent,
                entities,
                confidence,
                ragContext: rawContext
            }
        );

        //----------------------------------------------------------------------
        // Build Response
        //----------------------------------------------------------------------

        const responsePayload = {

            question,

            intent,

            entities,

            results: expanded,

            answer,

            citations

        };

        //----------------------------------------------------------------------
        // Cache Result
        //----------------------------------------------------------------------

        await cacheService.set(
            req.catalystApp,
            cacheKey,
            responsePayload
        );

        //----------------------------------------------------------------------
        // Audit Log
        //----------------------------------------------------------------------

        // Key the audit row on the SPA's client-generated session_id so the
        // transcript is retrievable via GET /conversation/:sessionId. Previously
        // this omitted the id, logConversation minted a random THREAD_ID, and the
        // conversation endpoint 404'd for every real session.
        await auditService.log(
            req.catalystApp,
            {
                action: "QUERY_EXECUTED",
                threadId: req.body?.session_id ?? req.body?.sessionId ?? null,
                user: req.user || null,
                details: {
                    question,
                    intent,
                    answer: responsePayload?.answer ?? null
                }
            }
        );

        //----------------------------------------------------------------------
        // Response
        //----------------------------------------------------------------------

        return res.status(200).json({

            success: true,

            data: responsePayload,

            cached: false

        });

    }

    catch (err) {

        logger.error(
            "[queryController.handleQuery] failed",
            {
                error: err.message,
                question
            }
        );

        return res.status(500).json({

            success: false,

            error: "Failed to process query."

        });

    }

}

/**
 * GET /query/:id
 */
export async function getQueryById(req, res) {

    const { id } = req.params;

    try {

        const record =
            await datastoreService.getById(
                req.catalystApp,
                "casemaster",
                "casemasterid",
                id
            );

        if (!record) {

            return res.status(404).json({

                success: false,

                message: `Query record not found with id: ${id}`

            });

        }

        return res.status(200).json({

            success: true,

            data: record

        });

    }

    catch (err) {

        logger.error(
            "[queryController.getQueryById] failed",
            {
                error: err.message,
                id
            }
        );

        return res.status(500).json({

            success: false,

            error: "Failed to retrieve query record."

        });

    }

}

export default {

    handleQuery,

    getQueryById

};