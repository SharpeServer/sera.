'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const logger = require('./utils/logger');
const { handleVerification, handleIncoming } = require('./whatsapp/webhook');

const app = express();
app.set('trust proxy', 1);
// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Rate limiting — general
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

// Rate limiting — webhook (Meta sends a lot, but we want to protect our agent)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Rate limit exceeded' },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SERA Backend',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// WhatsApp webhook verification (GET)
app.get('/webhook', webhookLimiter, handleVerification);

// WhatsApp webhook events (POST)
app.post('/webhook', webhookLimiter, handleIncoming);

// Gmail OAuth setup routes (for initial token generation)
app.get('/auth/gmail', (req, res) => {
  const { google } = require('googleapis');
  if (!config.gmailClientId || !config.gmailClientSecret) {
    return res.status(503).send('Gmail credentials not configured. Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to .env');
  }
  const oAuth2Client = new google.auth.OAuth2(
    config.gmailClientId,
    config.gmailClientSecret,
    config.gmailRedirectUri
  );
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    prompt: 'consent',
  });
  res.redirect(authUrl);
});

app.get('/auth/gmail/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No authorization code received.');

  const { google } = require('googleapis');
  const oAuth2Client = new google.auth.OAuth2(
    config.gmailClientId,
    config.gmailClientSecret,
    config.gmailRedirectUri
  );

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    res.send(`
      <h2>✅ Gmail Authorization Successful!</h2>
      <p>Copy this refresh token into your <strong>.env</strong> file:</p>
      <pre style="background:#f5f5f5;padding:16px;border-radius:8px;word-break:break-all;">
GMAIL_REFRESH_TOKEN=${tokens.refresh_token}
      </pre>
      <p>Restart SERA after saving.</p>
      <p><em>This page is for one-time setup only.</em></p>
    `);
  } catch (err) {
    logger.error('[AUTH] Gmail OAuth callback error:', err.message);
    res.status(500).send('OAuth error: ' + err.message);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('[SERVER] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  logger.info(`SERA Backend running on port ${config.port} [${config.nodeEnv}]`);
  logger.info(`Webhook URL: http://localhost:${config.port}/webhook`);
  logger.info(`Health check: http://localhost:${config.port}/health`);
  logger.info(`Gmail OAuth setup: http://localhost:${config.port}/auth/gmail`);

  if (config.allowedNumbers.length === 0) {
    logger.warn('⚠️  No ALLOWED_WHATSAPP_NUMBERS configured — all users will be rejected!');
  } else {
    logger.info(`Authorized numbers: ${config.allowedNumbers.length} number(s) configured`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('[SERVER] SIGTERM received, shutting down gracefully...');
  server.close(() => { logger.info('[SERVER] Closed.'); process.exit(0); });
});

process.on('SIGINT', () => {
  logger.info('[SERVER] SIGINT received, shutting down...');
  server.close(() => { process.exit(0); });
});

module.exports = app;
