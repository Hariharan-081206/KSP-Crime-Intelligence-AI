// File: functions/scrb-backend/routes/export.js

import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import * as datastoreService from '../services/datastoreService.js';
import * as auditService from '../services/auditService.js';
import { ALL_ROLES } from '../utils/constants.js';

const router = Router();

/**
 * Shared export handler.
 *
 * Thread id source (spec §8): the frontend POSTs `session_id` in the body
 * (frontend/src/api/services/exportService.js); the older `GET /export/:threadId`
 * form passes it as a path param. Both resolve here.
 *
 * KNOWN GAP (Phase 3, audit §7.12): this returns the thread as JSON, not a
 * generated PDF. The frontend requests `responseType: 'blob'`, so it currently
 * receives a JSON blob. Real per-role PDF rendering (SmartBrowz templates
 * branching on `role`, narrowed by `scope`/`filters`) is not implemented — the
 * `role`, `scope`, `filters` and `title` body fields are accepted and audited
 * but do not yet shape the output.
 */
async function exportThread(req, res) {
  const threadId = req.params?.threadId ?? req.body?.session_id ?? req.body?.sessionId;
  const { role, scope, title } = req.body || {};

  if (!threadId) {
    return res.status(400).json({
      success: false,
      message: 'A thread/session id is required — pass "session_id" in the body.'
    });
  }

  try {
    const thread = await auditService.getThreadHistory(req.catalystApp, threadId);

    if (!thread || thread.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No thread found with id: ${threadId} to export.`
      });
    }

    // Audit the export itself — exporting data is a sensitive action.
    await auditService.logConversation(req.catalystApp, {
      threadId,
      user: req.user,
      question: `[EXPORT REQUEST] Thread ${threadId}${scope ? ` scope=${scope}` : ''}${role ? ` role=${role}` : ''}`,
      stage: 'EXPORTED'
    });

    res.setHeader('Content-Disposition', `attachment; filename="scrb_export_${threadId}.json"`);
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json({
      success: true,
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.email,
      threadId,
      title: title || null,
      data: thread
    });
  } catch (err) {
    console.error('[routes/export] export failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to export thread data.',
      error: err.message
    });
  }
}

/**
 * POST /export/pdf — spec §8, the path the SPA calls.
 * Body: { role, scope, session_id, filters, title }
 *
 * RBAC: all three roles may export (spec §5 grants Policymakers exports and
 * §5 also lists export for Investigator/Analyst views); the per-role *content*
 * differs, which is the Phase-3 template work noted above.
 */
router.post('/pdf', authMiddleware, roleMiddleware(ALL_ROLES), exportThread);

/**
 * GET /export/:threadId — pre-rename form, retained. No frontend caller.
 */
router.get('/:threadId', authMiddleware, roleMiddleware(ALL_ROLES), exportThread);

export default router;