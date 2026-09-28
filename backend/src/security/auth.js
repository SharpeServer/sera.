'use strict';

const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * Normalize a WhatsApp number to digits-only (no +, no spaces).
 */
function normalizeNumber(number) {
  if (!number) return '';
  return String(number).replace(/[^\d]/g, '');
}

/**
 * Returns true if the sender is in the allowed list.
 */
function isAuthorized(senderNumber) {
  const normalized = normalizeNumber(senderNumber);
  if (!normalized) {
    logger.warn('[AUTH] Empty sender number rejected');
    return false;
  }

  if (config.allowedNumbers.length === 0) {
    logger.warn('[AUTH] No ALLOWED_WHATSAPP_NUMBERS configured — all senders rejected');
    return false;
  }

  const allowed = config.allowedNumbers.map(normalizeNumber);
  const ok = allowed.includes(normalized);

  if (!ok) {
    logger.warn(`[AUTH] Unauthorized sender: ${normalized.slice(0, 4)}****`);
  }

  return ok;
}

/**
 * Safe response message for unauthorized senders.
 */
const UNAUTHORIZED_MESSAGE =
  "I'm SERA, a private AI assistant. I'm not configured to respond to this number.";

module.exports = { isAuthorized, UNAUTHORIZED_MESSAGE, normalizeNumber };
