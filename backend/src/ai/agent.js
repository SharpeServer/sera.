'use strict';

const gemini = require('./gemini');
const { buildSystemPrompt } = require('./systemPrompt');
const { getAllTools, executeTool, executeConfirmedTool } = require('../tools/index');
const memory = require('../memory/memory');
const logger = require('../utils/logger');

const MAX_TOOL_ITERATIONS = 8; // Prevent infinite loops

/**
 * Process an incoming message from an authorized user.
 *
 * Returns:
 *   { reply: string }
 *   { needsConfirmation: true, message: string, pendingAction: {...} }
 */
async function processMessage(userId, userMessage, context = {}) {
  logger.agent(`Processing message from ${userId.slice(0, 4)}****`);

  // Add user message to history
  memory.addMessage(userId, 'user', userMessage);
  memory.setTaskState(userId, 'planning');

  const tools = getAllTools();
  const systemPrompt = buildSystemPrompt(tools);
  const history = memory.getHistory(userId);

  // First call to Gemini
  let geminiResponse = await gemini.chat({
    systemPrompt,
    history: history.slice(0, -1), // exclude the message we're about to send
    userMessage,
    tools,
  });

  // Agent loop — allows tool chaining
  let iterations = 0;

  while (geminiResponse.type === 'tool_call' && iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    const { name: toolName, args } = geminiResponse;
    const actionName = args.action || 'default';

    logger.agent(`Tool call ${iterations}: ${toolName}.${actionName}`);
    memory.setTaskState(userId, 'executing');

    // Execute tool (may return needsConfirmation)
    const toolResult = await executeTool(toolName, actionName, args, context);

    if (toolResult.needsConfirmation) {
      // Pause and ask user for confirmation
      const pendingAction = {
        toolName,
        actionName,
        args,
        confirmationMessage: toolResult.message,
      };

      memory.setPending(userId, pendingAction);
      memory.setTaskState(userId, 'awaiting_confirmation');

      logger.agent(`Awaiting confirmation for: ${toolName}.${actionName}`);
      return {
        needsConfirmation: true,
        message: toolResult.message,
        pendingAction,
      };
    }

    // Build tool result message for Gemini
    const toolResultForGemini = {
      success: toolResult.success,
      ...(toolResult.success ? { data: toolResult.data } : { error: toolResult.error }),
    };

    // Send tool result back to Gemini and get next response
    geminiResponse = await gemini.sendToolResult({
      systemPrompt,
      history: memory.getHistory(userId),
      toolName,
      toolResult: toolResultForGemini,
      tools,
    });
  }

  if (iterations >= MAX_TOOL_ITERATIONS) {
    logger.warn('[AGENT] Max tool iterations reached');
    geminiResponse = { type: 'text', text: "I've reached the maximum number of steps for this task. Please try breaking it into smaller requests." };
  }

  if (geminiResponse.type === 'error') {
    logger.error('[AGENT] Gemini error:', geminiResponse.error);
    const reply = "I encountered an error processing your request. Please try again.";
    memory.addMessage(userId, 'assistant', reply);
    memory.setTaskState(userId, 'idle');
    return { reply };
  }

  const reply = geminiResponse.text || "I completed the task but had no additional output.";
  memory.addMessage(userId, 'assistant', reply);
  memory.setTaskState(userId, 'idle');

  return { reply };
}

/**
 * Handle a confirmation response (user said yes/no to a pending action).
 */
async function handleConfirmation(userId, userResponse, context = {}) {
  const pending = memory.getPending(userId);

  if (!pending) {
    logger.warn('[AGENT] No pending action for confirmation');
    return { reply: "I don't have anything waiting for confirmation. What would you like me to do?" };
  }

  if (memory.isRejection(userResponse)) {
    memory.clearPending(userId);
    memory.addMessage(userId, 'assistant', 'Understood, cancelled.');
    return { reply: "Got it, I've cancelled that action." };
  }

  if (memory.isConfirmation(userResponse)) {
    const { toolName, args } = pending;
    memory.clearPending(userId);
    memory.setTaskState(userId, 'executing');

    logger.agent(`Executing confirmed action: ${toolName}`);

    const result = await executeConfirmedTool(toolName, args, context);

    let reply;
    if (result.success) {
      // Let Gemini generate a natural-language reply from the result
      const tools = getAllTools();
      const systemPrompt = buildSystemPrompt(tools);

      const geminiResponse = await gemini.sendToolResult({
        systemPrompt,
        history: memory.getHistory(userId),
        toolName,
        toolResult: { success: true, data: result.data },
        tools,
      });

      reply = geminiResponse.type === 'text' ? geminiResponse.text : `Done. ${toolName} executed successfully.`;
    } else {
      reply = `The action failed: ${result.error}`;
    }

    memory.addMessage(userId, 'assistant', reply);
    memory.setTaskState(userId, 'idle');
    return { reply };
  }

  // Ambiguous response — check if it's a new request
  memory.clearPending(userId);
  memory.addMessage(userId, 'user', userResponse);
  return processMessage(userId, userResponse, context);
}

module.exports = { processMessage, handleConfirmation };
