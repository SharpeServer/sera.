'use strict';

const { google } = require('googleapis');
const config = require('../config/env');
const logger = require('../utils/logger');

const tool = {
  name: 'gmail',
  description: 'Interact with Gmail — list emails, search emails, read an email, draft an email, or send an email.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'search', 'read', 'draft', 'send'],
        description: 'Action to perform',
      },
      query: { type: 'string', description: 'Gmail search query (for search/list actions)' },
      maxResults: { type: 'number', description: 'Max emails to return (default 10)' },
      messageId: { type: 'string', description: 'Gmail message ID (for read action)' },
      to: { type: 'string', description: 'Recipient email address (for draft/send)' },
      subject: { type: 'string', description: 'Email subject (for draft/send)' },
      body: { type: 'string', description: 'Email body text (for draft/send)' },
    },
    required: ['action'],
  },
  requiredCredentials: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'],
  permissionLevel: { list: 'LOW', search: 'LOW', read: 'LOW', draft: 'LOW', send: 'HIGH' },
  requiresConfirmation: { send: true },

  async execute(args) {
    const gmail = getGmailClient();
    if (!gmail) {
      return {
        success: false,
        error: 'Gmail is not configured. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN to your .env file. Run the OAuth setup to get a refresh token.',
        retryable: false,
      };
    }

    const { action } = args;
    logger.tool('gmail', action);

    try {
      switch (action) {
        case 'list': return await listEmails(gmail, args);
        case 'search': return await searchEmails(gmail, args);
        case 'read': return await readEmail(gmail, args);
        case 'draft': return await draftEmail(args);
        case 'send': return await sendEmail(gmail, args);
        default:
          return { success: false, error: `Unknown gmail action: ${action}`, retryable: false };
      }
    } catch (err) {
      logger.error('[GMAIL] Error:', err.message);
      return { success: false, error: `Gmail error: ${err.message}`, retryable: false };
    }
  },
};

function getGmailClient() {
  if (!config.gmailClientId || !config.gmailClientSecret || !config.gmailRefreshToken) {
    return null;
  }

  const oAuth2Client = new google.auth.OAuth2(
    config.gmailClientId,
    config.gmailClientSecret,
    config.gmailRedirectUri
  );
  oAuth2Client.setCredentials({ refresh_token: config.gmailRefreshToken });
  return google.gmail({ version: 'v1', auth: oAuth2Client });
}

async function listEmails(gmail, { maxResults = 10, query = '' }) {
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query,
  });

  const messages = res.data.messages || [];
  if (messages.length === 0) {
    return { success: true, data: { emails: [], total: 0 } };
  }

  const emails = await Promise.all(
    messages.slice(0, maxResults).map((m) => getEmailSummary(gmail, m.id))
  );

  return { success: true, data: { emails, total: res.data.resultSizeEstimate || emails.length } };
}

async function searchEmails(gmail, { query, maxResults = 10 }) {
  if (!query) {
    return { success: false, error: 'Search query is required', retryable: false };
  }
  return listEmails(gmail, { maxResults, query });
}

async function getEmailSummary(gmail, messageId) {
  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Subject', 'Date'],
  });

  const headers = msg.data.payload?.headers || [];
  const getHeader = (name) => headers.find((h) => h.name === name)?.value || '';

  return {
    id: messageId,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    snippet: msg.data.snippet || '',
  };
}

async function readEmail(gmail, { messageId }) {
  if (!messageId) {
    return { success: false, error: 'messageId is required to read an email', retryable: false };
  }

  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = msg.data.payload?.headers || [];
  const getHeader = (name) => headers.find((h) => h.name === name)?.value || '';

  // Extract plain text body
  let body = '';
  const parts = msg.data.payload?.parts || [];
  const textPart = parts.find((p) => p.mimeType === 'text/plain');
  if (textPart?.body?.data) {
    body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
  } else if (msg.data.payload?.body?.data) {
    body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8');
  }

  return {
    success: true,
    data: {
      id: messageId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body: body.slice(0, 5000), // limit to 5000 chars
    },
  };
}

function draftEmail({ to, subject, body }) {
  if (!to || !subject || !body) {
    return {
      success: false,
      error: 'to, subject, and body are required to draft an email',
      retryable: false,
    };
  }
  return {
    success: true,
    data: { drafted: true, to, subject, body },
  };
}

async function sendEmail(gmail, { to, subject, body }) {
  if (!to || !subject || !body) {
    return {
      success: false,
      error: 'to, subject, and body are required to send an email',
      retryable: false,
    };
  }

  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  if (res.status === 200 || res.status === 201) {
    logger.tool('gmail', 'send', `Success: ${res.data.id}`);
    return { success: true, data: { messageId: res.data.id, to, subject } };
  }

  return {
    success: false,
    error: `Gmail API returned status ${res.status}`,
    retryable: false,
  };
}

module.exports = tool;
