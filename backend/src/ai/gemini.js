'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/env');
const logger = require('../utils/logger');

let genAI = null;

function getClient() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI;
}

/**
 * Convert our internal tool schema to Gemini function declarations format.
 */
function toGeminiFunctionDeclarations(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

/**
 * Convert conversation history to Gemini format.
 * Gemini uses "user" and "model" roles.
 */
function toGeminiHistory(history) {
  return history.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}

/**
 * Send a message to Gemini with tool calling support.
 *
 * Returns:
 *   { type: 'text', text: string }
 *   { type: 'tool_call', name: string, args: object }
 *   { type: 'error', error: string }
 */
async function chat({ systemPrompt, history, userMessage, tools = [] }) {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction: systemPrompt,
      ...(tools.length > 0 && {
        tools: [{ functionDeclarations: toGeminiFunctionDeclarations(tools) }],
      }),
    });

    const geminiHistory = toGeminiHistory(history);
    const chatSession = model.startChat({ history: geminiHistory });

    logger.agent('Sending to Gemini', `model=${config.geminiModel}`, `tools=${tools.length}`);

    const result = await chatSession.sendMessage(userMessage);
    const response = result.response;

    // Check for function call
    const functionCall = response.candidates?.[0]?.content?.parts?.find(
      (p) => p.functionCall
    );

    if (functionCall) {
      logger.agent('Gemini requested tool call:', functionCall.functionCall.name);
      return {
        type: 'tool_call',
        name: functionCall.functionCall.name,
        args: functionCall.functionCall.args || {},
      };
    }

    // Plain text response
    const text = response.text();
    logger.agent('Gemini text response received', `length=${text.length}`);
    return { type: 'text', text };

  } catch (err) {
    logger.error('[GEMINI] Error:', err.message);
    return { type: 'error', error: err.message };
  }
}

/**
 * Send a tool result back to Gemini and get its final response.
 * Used after executing a tool call.
 */
async function sendToolResult({ systemPrompt, history, toolName, toolResult, tools = [] }) {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction: systemPrompt,
      ...(tools.length > 0 && {
        tools: [{ functionDeclarations: toGeminiFunctionDeclarations(tools) }],
      }),
    });

    const geminiHistory = toGeminiHistory(history);
    const chatSession = model.startChat({ history: geminiHistory });

    // Build the function response
    const functionResponsePart = {
      functionResponse: {
        name: toolName,
        response: toolResult,
      },
    };

    const result = await chatSession.sendMessage([functionResponsePart]);
    const response = result.response;

    // May chain into another tool call
    const functionCall = response.candidates?.[0]?.content?.parts?.find(
      (p) => p.functionCall
    );

    if (functionCall) {
      logger.agent('Gemini chained tool call:', functionCall.functionCall.name);
      return {
        type: 'tool_call',
        name: functionCall.functionCall.name,
        args: functionCall.functionCall.args || {},
      };
    }

    const text = response.text();
    return { type: 'text', text };

  } catch (err) {
    logger.error('[GEMINI] sendToolResult error:', err.message);
    return { type: 'error', error: err.message };
  }
}

module.exports = { chat, sendToolResult };
