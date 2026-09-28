'use strict';

const axios = require('axios');
const config = require('../config/env');
const logger = require('../utils/logger');

const GRAPH_API_URL = `https://graph.facebook.com/v20.0/${config.whatsappPhoneNumberId}/messages`;

/**
 * Send a text message to a WhatsApp number via Meta Graph API.
 *
 * @param {string} to - Recipient WhatsApp number (with country code, no +)
 * @param {string} text - Message text
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendTextMessage(to, text) {
  if (!to || !text) {
    logger.error('[WHATSAPP] sendTextMessage called with missing to or text');
    return { success: false, error: 'Missing recipient or message text' };
  }

  // WhatsApp has a 4096 char limit per message
  const MAX_LENGTH = 4000;
  const chunks = chunkMessage(text, MAX_LENGTH);

  let lastResult = { success: true };

  for (const chunk of chunks) {
    lastResult = await sendChunk(to, chunk);
    if (!lastResult.success) break;
    // Small delay between chunks to preserve order
    if (chunks.length > 1) await sleep(300);
  }

  return lastResult;
}

async function sendChunk(to, text) {
  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    };

    const res = await axios.post(GRAPH_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${config.metaAccessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const messageId = res.data?.messages?.[0]?.id;
    logger.whatsapp(`Sent to ${to.slice(0, 4)}****`, `msgId=${messageId}`);
    return { success: true, messageId };

  } catch (err) {
    const status = err.response?.status;
    const details = err.response?.data?.error?.message || err.message;
    logger.error(`[WHATSAPP] Send failed (${status}): ${details}`);
    return { success: false, error: `WhatsApp send failed: ${details}` };
  }
}

/**
 * Mark a message as read (shows double blue ticks on sender's device).
 */
async function markAsRead(messageId) {
  try {
    await axios.post(GRAPH_API_URL, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }, {
      headers: {
        Authorization: `Bearer ${config.metaAccessToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    // Non-critical, don't throw
  }
}

/**
 * Split long text into chunks at paragraph or sentence boundaries.
 */
function chunkMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n\n', maxLength);
    if (splitAt === -1) splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt === -1) splitAt = remaining.lastIndexOf('. ', maxLength);
    if (splitAt === -1) splitAt = maxLength;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { sendTextMessage, markAsRead };
