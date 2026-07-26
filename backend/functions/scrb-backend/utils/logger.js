// File: backend/utils/logger.js

/**
 * logger
 * ---------------------------------------------------------------------------
 * Lightweight structured logger. Catalyst captures stdout/stderr into the
 * function's execution logs, so this just standardizes the shape of what
 * gets written rather than wrapping a third-party logging library.
 */

const LEVELS = Object.freeze({
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
});

function write(level, scope, message, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    ...(Object.keys(meta).length > 0 && { meta })
  };

  const line = JSON.stringify(entry);

  if (level === LEVELS.ERROR) {
    console.error(line);
  } else if (level === LEVELS.WARN) {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (scope, message, meta) => write(LEVELS.DEBUG, scope, message, meta),
  info: (scope, message, meta) => write(LEVELS.INFO, scope, message, meta),
  warn: (scope, message, meta) => write(LEVELS.WARN, scope, message, meta),
  error: (scope, message, meta) => {
    const errMeta = meta instanceof Error
      ? { errorMessage: meta.message, stack: meta.stack }
      : meta;
    write(LEVELS.ERROR, scope, message, errMeta);
  }
};

export default logger;