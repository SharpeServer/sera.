'use strict';

const cron = require('node-cron');
const config = require('../config/env');
const logger = require('../utils/logger');

const tool = {
  name: 'reminders',
  description: 'Create, list, and cancel reminders. Reminders are sent via WhatsApp at the specified date and time.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'cancel'],
        description: 'Reminder action',
      },
      text: { type: 'string', description: 'Reminder message text (for create)' },
      datetime: {
        type: 'string',
        description: 'When to remind, as ISO 8601 datetime string, e.g. "2024-12-25T10:00:00" (for create)',
      },
      reminderId: { type: 'string', description: 'Reminder ID to cancel (for cancel)' },
    },
    required: ['action'],
  },
  requiredCredentials: [],

  async execute(args, { sendToUser, userId } = {}) {
    const { action } = args;
    logger.tool('reminders', action);

    switch (action) {
      case 'create': return createReminder(args, sendToUser, userId);
      case 'list': return listReminders();
      case 'cancel': return cancelReminder(args);
      default:
        return { success: false, error: `Unknown reminders action: ${action}`, retryable: false };
    }
  },
};

// In-memory store — replace with DB in future
const reminders = new Map(); // id -> { id, text, datetime, userId, cronJob }
let nextId = 1;

function createReminder({ text, datetime }, sendToUser, userId) {
  if (!text || !datetime) {
    return { success: false, error: 'text and datetime are required to create a reminder', retryable: false };
  }

  let reminderDate;
  try {
    reminderDate = new Date(datetime);
    if (isNaN(reminderDate.getTime())) throw new Error('Invalid date');
  } catch {
    return {
      success: false,
      error: `Could not parse datetime: "${datetime}". Use ISO 8601 format like "2024-12-25T10:00:00"`,
      retryable: false,
    };
  }

  if (reminderDate <= new Date()) {
    return { success: false, error: 'Reminder datetime must be in the future', retryable: false };
  }

  const id = `R${nextId++}`;
  const minute = reminderDate.getMinutes();
  const hour = reminderDate.getHours();
  const day = reminderDate.getDate();
  const month = reminderDate.getMonth() + 1;

  const cronExpression = `${minute} ${hour} ${day} ${month} *`;

  if (!cron.validate(cronExpression)) {
    return { success: false, error: 'Could not build a valid cron schedule for that time', retryable: false };
  }

  const job = cron.schedule(cronExpression, () => {
    logger.info(`[REMINDERS] Firing reminder ${id}: ${text}`);
    if (sendToUser && userId) {
      sendToUser(userId, `⏰ Reminder: ${text}`).catch((err) =>
        logger.error('[REMINDERS] Failed to send:', err.message)
      );
    }
    // Remove after firing (one-time reminders)
    const r = reminders.get(id);
    if (r) { r.cronJob.stop(); reminders.delete(id); }
  }, {
    timezone: config.reminderTimezone,
  });

  reminders.set(id, { id, text, datetime: reminderDate.toISOString(), userId, cronJob: job });
  logger.tool('reminders', 'created', `${id} at ${reminderDate.toISOString()}`);

  return {
    success: true,
    data: {
      reminderId: id,
      text,
      scheduledFor: reminderDate.toISOString(),
      timezone: config.reminderTimezone,
    },
  };
}

function listReminders() {
  const list = [];
  for (const [id, r] of reminders.entries()) {
    list.push({ id, text: r.text, scheduledFor: r.datetime });
  }
  list.sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  return { success: true, data: { reminders: list, count: list.length } };
}

function cancelReminder({ reminderId }) {
  if (!reminderId) {
    return { success: false, error: 'reminderId is required to cancel a reminder', retryable: false };
  }

  const r = reminders.get(reminderId);
  if (!r) {
    return { success: false, error: `No reminder found with ID: ${reminderId}`, retryable: false };
  }

  r.cronJob.stop();
  reminders.delete(reminderId);
  logger.tool('reminders', 'cancelled', reminderId);

  return { success: true, data: { reminderId, cancelled: true } };
}

module.exports = tool;
