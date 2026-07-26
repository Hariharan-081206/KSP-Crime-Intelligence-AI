// ============================================================================
// File: backend/services/auditService.js
// ============================================================================

import crypto from "crypto";

import {
    insertRow,
    getManyByColumn
} from "./datastoreService.js";

import { TABLES } from "../utils/constants.js";

import logger from "../utils/logger.js";

/**
 * Generate Thread ID
 */
const generateThreadId = () => {

    return `thread_${crypto.randomUUID()}`;

};

/**
 * Log Conversation
 */
export const logConversation = async (

    catalystApp,

    entry

) => {

    const threadId =

        entry.threadId ||

        generateThreadId();

    const row = {

        THREAD_ID: threadId,

        ZUID:
            entry.user?.zuid || "UNKNOWN",

        USER_EMAIL:
            entry.user?.email || "UNKNOWN",

        USER_ROLE:
            entry.user?.role || "UNASSIGNED",

        QUESTION:
            entry.question || "",

        INTENT:
            entry.intent || null,

        ENTITIES_JSON:
            entry.entities
                ? JSON.stringify(entry.entities)
                : null,

        ZCQL_USED:
            entry.queryUsed || null,

        ROW_COUNT:
            entry.rowCount ?? 0,

        ANSWER:
            entry.answer || null,

        STAGE:
            entry.stage || "UNKNOWN",

        ERROR_MESSAGE:
            entry.error || null

    };

    try {

        await insertRow(

            catalystApp,

            TABLES.CONVERSATION_LOG,

            row

        );

        return {

            success: true,

            threadId

        };

    }

    catch(err){

        logger.error(

            "auditService.logConversation",

            err

        );

        return {

            success:false,

            threadId

        };

    }

};

/**
 * Get Thread History
 */
export const getThreadHistory = async (

    catalystApp,

    threadId

)=>{

    try{

        return await getManyByColumn(

            catalystApp,

            TABLES.CONVERSATION_LOG,

            "THREAD_ID",

            threadId,

            200

        );

    }

    catch(err){

        logger.error(

            "auditService.getThreadHistory",

            err

        );

        throw err;

    }

};

/**
 * Get User Conversation History
 */
export const getUserConversations = async (

    catalystApp,

    zuid,

    limit=50

)=>{

    try{

        return await getManyByColumn(

            catalystApp,

            TABLES.CONVERSATION_LOG,

            "ZUID",

            zuid,

            limit

        );

    }

    catch(err){

        logger.error(

            "auditService.getUserConversations",

            err

        );

        throw err;

    }

};

/**
 * Delete Thread
 */
export const deleteThread = async (

    catalystApp,

    threadId

)=>{

    try{

        const history=

            await getThreadHistory(

                catalystApp,

                threadId

            );

        return history;

    }

    catch(err){

        logger.error(

            "auditService.deleteThread",

            err

        );

        throw err;

    }

};

export const logAction = async (actorId, action, meta = {}) => {
    return await logConversation(null, {
        user: { zuid: actorId },
        question: `[ACTION] ${action}`,
        stage: action,
        entities: meta
    });
};

export const log = async (catalystApp, entry) => {
    if (!entry && typeof catalystApp === 'object') {
        entry = catalystApp;
        catalystApp = null;
    }
    return logConversation(catalystApp, {
        // Forward the caller's thread/session id. Without this, logConversation
        // fell through to generateThreadId() and every audited turn landed under
        // a fresh random THREAD_ID — so no row was ever keyed by the SPA's
        // session_id and GET /conversation/:sessionId could only ever 404.
        threadId: entry?.threadId ?? entry?.sessionId ?? entry?.details?.sessionId ?? null,
        user: entry?.user,
        question: entry?.details?.question || `[${entry?.action || 'AUDIT'}]`,
        intent: entry?.details?.intent || null,
        answer: entry?.details?.answer ?? null,
        stage: entry?.action || 'COMPLETED'
    });
};

/**
 * Export
 */
export default{

    logConversation,

    logAction,

    log,

    getThreadHistory,

    getUserConversations,

    deleteThread

};