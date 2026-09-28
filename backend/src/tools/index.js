'use strict';

const webTool = require('./web');
const gmailTool = require('./gmail');
const filesTool = require('./files');
const githubTool = require('./github');
const vercelTool = require('./vercel');
const remindersTool = require('./reminders');
const logger = require('../utils/logger');
const { requiresConfirmation, buildConfirmationMessage } = require('../security/permissions');

/**
 * Central tool registry.
 * Maps tool name → tool definition.
 */
const REGISTRY = {
  [webTool.name]: webTool,
  [gmailTool.name]: gmailTool,
  [filesTool.name]: filesTool,
  [githubTool.name]: githubTool,
  [vercelTool.name]: vercelTool,
  [remindersTool.name]: remindersTool,
};

/**
 * Get all tools as an array (for Gemini function declarations).
 */
function getAllTools() {
  return Object.values(REGISTRY);
}

/**
 * Get a tool by name.
 */
function getTool(name) {
  return REGISTRY[name] || null;
}

/**
 * Execute a tool call, respecting permissions and confirmation requirements.
 *
 * Returns:
 *   { needsConfirmation: true, message: string }   — caller should ask user first
 *   { success: true, data: {...} }                  — tool succeeded
 *   { success: false, error: string }               — tool failed
 */
async function executeTool(toolName, action, args, context = {}) {
  const tool = getTool(toolName);

  if (!tool) {
    logger.error(`[TOOLS] Tool not found: ${toolName}`);
    return { success: false, error: `Unknown tool: ${toolName}`, retryable: false };
  }

  // Determine the action name for permission checks
  const actionName = action || args.action || 'default';

  // Check if confirmation is required
  if (requiresConfirmation(toolName, actionName)) {
    const message = buildConfirmationMessage(toolName, actionName, args);
    logger.tool(toolName, `Confirmation required for: ${actionName}`);
    return { needsConfirmation: true, message, toolName, actionName, args };
  }

  // Execute
  logger.tool(toolName, `Executing: ${actionName}`, JSON.stringify(args).slice(0, 200));

  try {
    const result = await tool.execute(args, context);
    if (result.success) {
      logger.tool(toolName, `Success: ${actionName}`);
    } else {
      logger.warn(`[TOOLS] ${toolName}.${actionName} failed:`, result.error);
    }
    return result;
  } catch (err) {
    logger.error(`[TOOLS] ${toolName}.${actionName} threw:`, err.message);
    return { success: false, error: `Tool execution error: ${err.message}`, retryable: false };
  }
}

/**
 * Execute a confirmed action (called after user says "yes").
 */
async function executeConfirmedTool(toolName, args, context = {}) {
  const tool = getTool(toolName);
  if (!tool) return { success: false, error: `Unknown tool: ${toolName}` };

  logger.tool(toolName, 'Executing confirmed action');

  try {
    const result = await tool.execute(args, context);
    return result;
  } catch (err) {
    logger.error(`[TOOLS] Confirmed execution error:`, err.message);
    return { success: false, error: `Tool execution error: ${err.message}`, retryable: false };
  }
}

module.exports = { getAllTools, getTool, executeTool, executeConfirmedTool, REGISTRY };
