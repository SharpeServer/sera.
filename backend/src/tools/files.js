'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const logger = require('../utils/logger');

const tool = {
  name: 'files',
  description: 'Work with files in the secure workspace directory — list, read, search, create, or update files. Cannot access files outside the workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'read', 'search', 'create', 'update', 'delete'],
        description: 'File operation to perform',
      },
      filename: { type: 'string', description: 'File name or relative path within workspace' },
      content: { type: 'string', description: 'File content (for create/update)' },
      searchTerm: { type: 'string', description: 'Text to search for (for search action)' },
      subdirectory: { type: 'string', description: 'Optional subdirectory within workspace' },
    },
    required: ['action'],
  },
  requiredCredentials: ['WORKSPACE_PATH'],
  permissionLevel: { list: 'LOW', read: 'LOW', search: 'LOW', create: 'LOW', update: 'LOW', delete: 'HIGH' },

  async execute(args) {
    ensureWorkspace();
    const { action } = args;
    logger.tool('files', action, args.filename || '');

    try {
      switch (action) {
        case 'list': return listFiles(args);
        case 'read': return readFile(args);
        case 'search': return searchFiles(args);
        case 'create': return createFile(args);
        case 'update': return updateFile(args);
        case 'delete': return deleteFile(args);
        default:
          return { success: false, error: `Unknown files action: ${action}`, retryable: false };
      }
    } catch (err) {
      logger.error('[FILES] Error:', err.message);
      return { success: false, error: `Files error: ${err.message}`, retryable: false };
    }
  },
};

function ensureWorkspace() {
  if (!fs.existsSync(config.workspacePath)) {
    fs.mkdirSync(config.workspacePath, { recursive: true });
  }
}

/**
 * Resolve and validate a path is within the workspace sandbox.
 * Throws if path traversal is detected.
 */
function safeResolve(filename) {
  if (!filename) throw new Error('filename is required');

  // Reject obviously dangerous patterns immediately
  if (filename.includes('..') || filename.startsWith('/') || filename.includes('~')) {
    throw new Error('Invalid file path — path traversal is not allowed');
  }

  const resolved = path.resolve(config.workspacePath, filename);
  const workspace = path.resolve(config.workspacePath);

  if (!resolved.startsWith(workspace + path.sep) && resolved !== workspace) {
    throw new Error('Access denied — path is outside the workspace');
  }

  return resolved;
}

function listFiles({ subdirectory = '' }) {
  const dir = subdirectory ? safeResolve(subdirectory) : config.workspacePath;

  if (!fs.existsSync(dir)) {
    return { success: true, data: { files: [], directory: dir } };
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries.map((e) => ({
    name: e.name,
    type: e.isDirectory() ? 'directory' : 'file',
    size: e.isFile() ? fs.statSync(path.join(dir, e.name)).size : null,
  }));

  return { success: true, data: { files, directory: subdirectory || 'workspace root' } };
}

function readFile({ filename }) {
  const fullPath = safeResolve(filename);

  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `File not found: ${filename}`, retryable: false };
  }

  const stat = fs.statSync(fullPath);
  if (stat.size > 1024 * 1024) {
    return {
      success: false,
      error: `File is too large to read (${Math.round(stat.size / 1024)}KB). Max size is 1MB.`,
      retryable: false,
    };
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  return { success: true, data: { filename, content, size: stat.size } };
}

function searchFiles({ searchTerm }) {
  if (!searchTerm) {
    return { success: false, error: 'searchTerm is required', retryable: false };
  }

  const results = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(config.workspacePath, fullPath);
        if (entry.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          results.push({ filename: relativePath, matchType: 'filename' });
        } else {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.toLowerCase().includes(searchTerm.toLowerCase())) {
              results.push({ filename: relativePath, matchType: 'content' });
            }
          } catch {}
        }
      }
    }
  }

  walk(config.workspacePath);
  return { success: true, data: { searchTerm, results } };
}

function createFile({ filename, content = '' }) {
  const fullPath = safeResolve(filename);

  if (fs.existsSync(fullPath)) {
    return { success: false, error: `File already exists: ${filename}. Use "update" to modify it.`, retryable: false };
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  logger.tool('files', 'created', filename);

  return { success: true, data: { filename, created: true, size: Buffer.byteLength(content, 'utf-8') } };
}

function updateFile({ filename, content }) {
  if (content === undefined) {
    return { success: false, error: 'content is required to update a file', retryable: false };
  }

  const fullPath = safeResolve(filename);

  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `File not found: ${filename}. Use "create" to create it.`, retryable: false };
  }

  fs.writeFileSync(fullPath, content, 'utf-8');
  logger.tool('files', 'updated', filename);

  return { success: true, data: { filename, updated: true } };
}

function deleteFile({ filename }) {
  const fullPath = safeResolve(filename);

  if (!fs.existsSync(fullPath)) {
    return { success: false, error: `File not found: ${filename}`, retryable: false };
  }

  fs.unlinkSync(fullPath);
  logger.tool('files', 'deleted', filename);

  return { success: true, data: { filename, deleted: true } };
}

module.exports = tool;
