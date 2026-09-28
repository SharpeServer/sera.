'use strict';

// Patterns that should never appear in logs
const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /access_token["\s:=]+[^\s"&]+/gi,
  /refresh_token["\s:=]+[^\s"&]+/gi,
  /client_secret["\s:=]+[^\s"&]+/gi,
  /api[_-]?key["\s:=]+[^\s"&]+/gi,
  /token["\s:=]+[A-Za-z0-9_\-]{20,}/gi,
];

function sanitize(msg) {
  if (typeof msg !== 'string') {
    try { msg = JSON.stringify(msg); } catch { msg = String(msg); }
  }
  for (const pattern of SECRET_PATTERNS) {
    msg = msg.replace(pattern, '[REDACTED]');
  }
  return msg;
}

function timestamp() {
  return new Date().toISOString();
}

function format(level, ...args) {
  const parts = args.map((a) =>
    typeof a === 'object' ? sanitize(JSON.stringify(a)) : sanitize(String(a))
  );
  return `[${timestamp()}] [${level}] ${parts.join(' ')}`;
}

const logger = {
  info: (...args) => console.log(format('INFO', ...args)),
  warn: (...args) => console.warn(format('WARN', ...args)),
  error: (...args) => console.error(format('ERROR', ...args)),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(format('DEBUG', ...args));
    }
  },
  tool: (toolName, action, detail) =>
    console.log(format('TOOL', `[${toolName}] ${action}`, detail || '')),
  agent: (...args) => console.log(format('AGENT', ...args)),
  whatsapp: (...args) => console.log(format('WHATSAPP', ...args)),
};

module.exports = logger;
