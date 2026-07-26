// File: backend/services/quickmlService.js

import logger from '../utils/logger.js';

const INTENT_MODEL_ID = process.env.QUICKML_INTENT_MODEL_ID || 'REPLACE_WITH_INTENT_MODEL_ID';
const SYNTHESIS_MODEL_ID = process.env.QUICKML_SYNTHESIS_MODEL_ID || 'REPLACE_WITH_SYNTHESIS_MODEL_ID';

function fallbackEntityExtraction(question) {
  const entities = {};
  const zoneMatch = question.match(/zone\s*(\d+)/i);
  if (zoneMatch) entities.zone = zoneMatch[1];
  const caseMatch = question.match(/case\s*(?:id)?\s*#?\s*([A-Za-z0-9-]+)/i);
  if (caseMatch) entities.caseId = caseMatch[1];
  return entities;
}

export const extractIntent = async (catalystApp, { question, context = {}, role }) => {
  try {
    const model = catalystApp.quickml().model(INTENT_MODEL_ID);
    const prediction = await model.predict({ question, context, requesterRole: role });

    if (!prediction || !prediction.label) {
      return { intent: null, entities: {}, confidence: 0 };
    }

    return {
      intent: prediction.label,
      entities: prediction.entities && Object.keys(prediction.entities).length > 0
        ? prediction.entities
        : fallbackEntityExtraction(question),
      confidence: prediction.confidence ?? null
    };
  } catch (err) {
    logger.error('quickmlService.extractIntent', 'Failed', err);
    throw err;
  }
};

export const synthesizeResponse = async (catalystApp, { question, intent, entities, records, role }) => {
  try {
    const model = catalystApp.quickml().model(SYNTHESIS_MODEL_ID);
    const prediction = await model.predict({
      question, intent, entities, records,
      recordCount: Array.isArray(records) ? records.length : 0,
      requesterRole: role
    });

    if (!prediction || !prediction.text) {
      return { answer: buildTemplatedFallback(intent, records), confidence: 0 };
    }

    return { answer: prediction.text, confidence: prediction.confidence ?? null };
  } catch (err) {
    logger.error('quickmlService.synthesizeResponse', 'Failed', err);
    throw err;
  }
};

function buildTemplatedFallback(intent, records) {
  const count = Array.isArray(records) ? records.length : 0;
  return `Found ${count} record(s) matching intent "${intent}". Natural-language summary is temporarily unavailable — please review the raw records below.`;
}

export const detectIntent = async (text) => {
  return await extractIntent(null, { question: text });
};

export default { extractIntent, detectIntent, synthesizeResponse };