'use strict';

require('dotenv').config();

const path = require('path');

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`[SERA] FATAL: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

function optionalEnv(name, defaultValue = '') {
  return process.env[name] || defaultValue;
}

function parseNumberList(str) {
  if (!str) return [];
  return str
    .split(',')
    .map((n) => n.trim().replace(/^\+/, ''))
    .filter(Boolean);
}

const config = {
  // Server
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),

  // WhatsApp / Meta
  verifyToken: requireEnv('VERIFY_TOKEN'),
  metaAccessToken: requireEnv('META_ACCESS_TOKEN'),
  whatsappPhoneNumberId: requireEnv('WHATSAPP_PHONE_NUMBER_ID'),
  seraWhatsappNumber: optionalEnv('SERA_WHATSAPP_NUMBER'),

  // Authorization
  allowedNumbers: parseNumberList(optionalEnv('ALLOWED_WHATSAPP_NUMBERS')),

  // Gemini
  geminiApiKey: requireEnv('GEMINI_API_KEY'),
  geminiModel: optionalEnv('GEMINI_MODEL', 'gemini-1.5-pro'),

  // Web Search
  webSearchProvider: optionalEnv('WEB_SEARCH_PROVIDER', 'serper'),
  webSearchApiKey: optionalEnv('WEB_SEARCH_API_KEY'),

  // Gmail
  gmailClientId: optionalEnv('GMAIL_CLIENT_ID'),
  gmailClientSecret: optionalEnv('GMAIL_CLIENT_SECRET'),
  gmailRedirectUri: optionalEnv('GMAIL_REDIRECT_URI', 'http://localhost:3000/auth/gmail/callback'),
  gmailRefreshToken: optionalEnv('GMAIL_REFRESH_TOKEN'),

  // GitHub
  githubToken: optionalEnv('GITHUB_TOKEN'),
  githubUsername: optionalEnv('GITHUB_USERNAME'),

  // Vercel
  vercelToken: optionalEnv('VERCEL_TOKEN'),
  vercelTeamId: optionalEnv('VERCEL_TEAM_ID'),

  // Workspace / Files
  workspacePath: path.resolve(optionalEnv('WORKSPACE_PATH', './workspace')),

  // Reminders
  reminderTimezone: optionalEnv('REMINDER_TIMEZONE', 'UTC'),
};

module.exports = config;
