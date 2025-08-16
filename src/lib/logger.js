// src/lib/logger.js
export const log = {
  info:  (...a) => console.log(`[${new Date().toISOString()}] INFO `, ...a),
  warn:  (...a) => console.warn(`[${new Date().toISOString()}] WARN `, ...a),
  error: (...a) => console.error(`[${new Date().toISOString()}] ERROR`, ...a),
};
