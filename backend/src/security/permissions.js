'use strict';

/**
 * Permission levels for tools.
 * LOW  — executes automatically, no confirmation needed.
 * HIGH — requires explicit user confirmation before execution.
 */
const PERMISSION_LEVEL = {
  LOW: 'LOW',
  HIGH: 'HIGH',
};

/**
 * Per-action permission overrides.
 * Each entry: { level, confirmationMessage }
 *
 * Tools use these to determine if a confirmation step is required.
 */
const ACTION_PERMISSIONS = {
  // Web
  'web.search': { level: PERMISSION_LEVEL.LOW },
  'web.fetch': { level: PERMISSION_LEVEL.LOW },

  // Gmail
  'gmail.list': { level: PERMISSION_LEVEL.LOW },
  'gmail.read': { level: PERMISSION_LEVEL.LOW },
  'gmail.search': { level: PERMISSION_LEVEL.LOW },
  'gmail.draft': { level: PERMISSION_LEVEL.LOW },
  'gmail.send': {
    level: PERMISSION_LEVEL.HIGH,
    confirmationMessage: (args) =>
      `📧 Ready to send:\n\nTo: ${args.to}\nSubject: ${args.subject}\n\n${args.body}\n\nShould I send this?`,
  },

  // Files
  'files.list': { level: PERMISSION_LEVEL.LOW },
  'files.read': { level: PERMISSION_LEVEL.LOW },
  'files.search': { level: PERMISSION_LEVEL.LOW },
  'files.create': { level: PERMISSION_LEVEL.LOW },
  'files.update': { level: PERMISSION_LEVEL.LOW },
  'files.delete': {
    level: PERMISSION_LEVEL.HIGH,
    confirmationMessage: (args) => `⚠️ Delete file "${args.filename}"? This cannot be undone.`,
  },

  // GitHub
  'github.list': { level: PERMISSION_LEVEL.LOW },
  'github.inspect': { level: PERMISSION_LEVEL.LOW },
  'github.readFile': { level: PERMISSION_LEVEL.LOW },
  'github.createRepo': {
    level: PERMISSION_LEVEL.HIGH,
    confirmationMessage: (args) =>
      `Create GitHub repository "${args.name}"${args.private ? ' (private)' : ' (public)'}?`,
  },
  'github.createFile': { level: PERMISSION_LEVEL.LOW },
  'github.updateFile': { level: PERMISSION_LEVEL.LOW },
  'github.deleteRepo': {
    level: PERMISSION_LEVEL.HIGH,
    confirmationMessage: (args) =>
      `⚠️ PERMANENTLY delete GitHub repository "${args.name}"? This cannot be undone.`,
  },
  'github.createIssue': { level: PERMISSION_LEVEL.LOW },

  // Vercel
  'vercel.list': { level: PERMISSION_LEVEL.LOW },
  'vercel.inspect': { level: PERMISSION_LEVEL.LOW },
  'vercel.deploy': {
    level: PERMISSION_LEVEL.HIGH,
    confirmationMessage: (args) =>
      `🚀 Deploy "${args.projectName}" to Vercel${args.production ? ' (PRODUCTION)' : ''}?`,
  },
  'vercel.status': { level: PERMISSION_LEVEL.LOW },

  // Reminders
  'reminders.create': { level: PERMISSION_LEVEL.LOW },
  'reminders.list': { level: PERMISSION_LEVEL.LOW },
  'reminders.cancel': { level: PERMISSION_LEVEL.LOW },
};

/**
 * Get the permission config for a given action key (e.g. "gmail.send").
 */
function getPermission(toolName, actionName) {
  const key = `${toolName}.${actionName}`;
  return ACTION_PERMISSIONS[key] || { level: PERMISSION_LEVEL.LOW };
}

function requiresConfirmation(toolName, actionName) {
  const perm = getPermission(toolName, actionName);
  return perm.level === PERMISSION_LEVEL.HIGH;
}

function buildConfirmationMessage(toolName, actionName, args) {
  const perm = getPermission(toolName, actionName);
  if (perm.confirmationMessage) {
    return typeof perm.confirmationMessage === 'function'
      ? perm.confirmationMessage(args)
      : perm.confirmationMessage;
  }
  return `Proceed with ${toolName}.${actionName}?`;
}

module.exports = {
  PERMISSION_LEVEL,
  getPermission,
  requiresConfirmation,
  buildConfirmationMessage,
};
