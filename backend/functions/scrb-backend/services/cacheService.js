// File: backend/services/cacheService.js

import logger from '../utils/logger.js';
import { CACHE_TTL_SECONDS } from '../utils/constants.js';

const SEGMENT_NAME = 'scrb-query-cache';

export const buildCacheKey = (intent, entities = {}) => {
  const sortedEntities = Object.keys(entities)
    .sort()
    .reduce((acc, key) => {
      acc[key] = entities[key];
      return acc;
    }, {});
  return `q:${intent}:${JSON.stringify(sortedEntities)}`;
};

export const get = async (catalystApp, key) => {
  try {
    const segment = catalystApp.cache().segment(SEGMENT_NAME);
    const value = await segment.getValue(key);
    if (!value) return null;
    return JSON.parse(value);
  } catch (err) {
    logger.warn('cacheService.get', 'Cache read failed, falling back to live lookup', { error: err.message });
    return null;
  }
};

export const set = async (catalystApp, key, value, ttlSeconds = CACHE_TTL_SECONDS.DEFAULT) => {
  try {
    const segment = catalystApp.cache().segment(SEGMENT_NAME);
    await segment.put(key, JSON.stringify(value), ttlSeconds);
    return true;
  } catch (err) {
    logger.warn('cacheService.set', 'Cache write failed (non-fatal)', { error: err.message });
    return false;
  }
};

export const invalidate = async (catalystApp, key) => {
  try {
    const segment = catalystApp.cache().segment(SEGMENT_NAME);
    await segment.delete(key);
    return true;
  } catch (err) {
    logger.warn('cacheService.invalidate', 'Cache delete failed (non-fatal)', { error: err.message });
    return false;
  }
};

export default { buildCacheKey, get, set, invalidate };