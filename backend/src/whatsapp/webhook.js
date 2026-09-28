'use strict';

const config = require('../config/env');
const logger = require('../utils/logger');
const { isAuthorized, UNAUTHORIZED_MESSAGE } = require('../security/auth');
const { sendTextMessage, markAsRead } = require('./sendMessage');
const { processMessage, handleConfirmation } = require('../ai/agent');
const memory = require('../memory/memory');

/**
 * GET /webhook — Meta webhook verification challenge.
 */
function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.whatsapp('Verification request received', `mode=${mode}`);

  if (mode === 'subscribe' && token === config.verifyToken) {
    logger.whatsapp('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('[WEBHOOK] Verification failed — token mismatch');
  return res.status(403).json({ error: 'Forbidden' });
}

/**
 * POST /webhook — Incoming WhatsApp messages and events.
 *
 * IMPORTANT: We acknowledge immediately (200 OK) and process async.
 * Meta will retry if we don't respond within 20 seconds.
 */
function handleIncoming(req, res) {
  // Acknowledge immediately — never block this
  res.status(200).json({ status: 'ok' });

  const body = req.body;

  // Validate the payload structure
  if (body?.object !== 'whatsapp_business_account') {
    return; // Not a WhatsApp event, ignore
  }

  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value) return;

  // Process messages
  const messages = value?.messages || [];
  const contacts = value?.contacts || [];

  for (const message of messages) {
    processIncomingMessage(message, contacts).catch((err) => {
      logger.error('[WEBHOOK] Unhandled error in processIncomingMessage:', err.message);
    });
  }

  // Process status updates (read receipts, delivered, etc.) — just log them
  const statuses = value?.statuses || [];
  for (const status of statuses) {
    logger.whatsapp(`Status update: ${status.status} for msgId=${status.id}`);
  }
}

/**
 * Process a single incoming WhatsApp message.
 */
async function processIncomingMessage(message, contacts) {
  const from = message.from; // Sender's WhatsApp number
  const messageId = message.id;
  const timestamp = message.timestamp;
  const messageType = message.type;

  logger.whatsapp(`Incoming message from ${from?.slice(0, 4)}****`, `type=${messageType}`, `id=${messageId}`);

  // Mark as read
  await markAsRead(messageId);

  // Authorization check
  if (!isAuthorized(from)) {
    logger.warn(`[WEBHOOK] Unauthorized sender rejected: ${from?.slice(0, 4)}****`);
    await sendTextMessage(from, UNAUTHORIZED_MESSAGE);
    return;
  }

  // Handle different message types
  let userText = null;

  if (messageType === 'text') {
    userText = message.text?.body?.trim();
  } else if (messageType === 'image') {
    // Future: handle image messages
    await sendTextMessage(from, "I received an image. Image handling is coming soon.");
    return;
  } else if (messageType === 'document') {
    // Future: handle documents
    await sendTextMessage(from, "I received a document. Document handling is coming soon.");
    return;
  } else if (messageType === 'audio' || messageType === 'voice') {
    await sendTextMessage(from, "I received an audio message. Voice handling is coming soon.");
    return;
  } else if (messageType === 'location') {
    await sendTextMessage(from, "I received a location. Location handling is coming soon.");
    return;
  } else {
    logger.warn(`[WEBHOOK] Unsupported message type: ${messageType}`);
    return;
  }

  if (!userText) {
    logger.warn('[WEBHOOK] Empty message text, skipping');
    return;
  }

  logger.info(`[WEBHOOK] Processing: "${userText.slice(0, 80)}${userText.length > 80 ? '...' : ''}"`);

  // Build context for tools that need to reply back to WhatsApp
  const sendToUser = (userId, text) => sendTextMessage(userId, text);
  const context = { sendToUser, userId: from };

  try {
    // Check if there's a pending confirmation for this user
    const hasPending = memory.getPending(from);

    let result;
    if (hasPending) {
      result = await handleConfirmation(from, userText, context);
    } else {
      result = await processMessage(from, userText, context);
    }

    if (result.needsConfirmation) {
      await sendTextMessage(from, result.message);
    } else if (result.reply) {
      await sendTextMessage(from, result.reply);
    }

  } catch (err) {
    logger.error('[WEBHOOK] Agent error:', err.message, err.stack);
    await sendTextMessage(from, "I ran into an unexpected error. Please try again.");
  }
}

module.exports = { handleVerification, handleIncoming };
