// File: functions/scrb-backend/routes/history.js
//
// Mounted twice in index.js:
//   /conversation  -> spec §8 surface. GET /conversation/:sessionId is the
//                     frontend's transcript fetch (conversationService.js); it
//                     lands on the `/:threadId` handler below.
//   /history       -> legacy alias, no frontend caller.
//
// KNOWN GAP (Step 5 / Phase 3): the SPA's `session_id` is a client-generated
// uuid sent with POST /query, but queryController calls auditService.log()
// (action/user/details) rather than logConversation({ threadId, ... }), so no
// row is ever keyed by that session id. Until that linkage exists,
// GET /conversation/:sessionId will 404 for real SPA sessions even though the
// route and its handler are correct.

import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import * as auditService from '../services/auditService.js';
import { ALL_ROLES } from '../utils/constants.js';

const router = Router();

/**
 * GET /history
 * Returns the authenticated user's own recent conversation threads
 * (most recent first). All three roles can view their own history.
 * Optional query param: ?limit=50
 */
router.get(
  '/',
  authMiddleware,
  roleMiddleware(ALL_ROLES),
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const conversations = await auditService.getUserConversations(
        req.catalystApp,
        req.user.zuid,
        limit
      );

      return res.status(200).json({
        success: true,
        data: conversations,
        count: conversations.length
      });
    } catch (err) {
      console.error('[routes/history] GET / failed:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve conversation history.',
        error: err.message
      });
    }
  }
);

/**
 * GET /history/:threadId
 * Returns the full transcript for a single conversation thread.
 * ASSUMPTION: Investigators may need to review threads beyond their own
 * (case collaboration); Analysts/Policymakers restricted to their own
 * threads. Ownership check below enforces that — confirm against Section 8.
 */
router.get(
  '/:threadId',
  authMiddleware,
  roleMiddleware(ALL_ROLES),
  async (req, res) => {
    const { threadId } = req.params;

    try {
      const thread = await auditService.getThreadHistory(req.catalystApp, threadId);

      if (!thread || thread.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No conversation thread found with id: ${threadId}`
        });
      }

      const isOwner = thread.some((turn) => turn.ZUID === req.user.zuid);

      if (!isOwner && req.user.role !== 'Investigator') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have access to this conversation thread.'
        });
      }

      // Spec §8 / frontend conversationService expects
      //   { session_id, turns: [{ role, text, timestamp }] }
      // rather than raw CONVERSATION_LOG rows. Each row holds one exchange
      // (QUESTION + optional ANSWER), so it expands into up to two turns.
      const turns = [];
      for (const row of thread) {
        const timestamp = row.CREATEDTIME ?? row.createdTime ?? row.CREATEDAT ?? null;
        if (row.QUESTION) {
          turns.push({ role: 'user', text: row.QUESTION, timestamp });
        }
        if (row.ANSWER) {
          turns.push({ role: 'assistant', text: row.ANSWER, timestamp });
        }
      }

      return res.status(200).json({
        success: true,
        data: { session_id: threadId, turns }
      });
    } catch (err) {
      console.error('[routes/history] GET /:threadId failed:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve conversation thread.',
        error: err.message
      });
    }
  }
);

export default router;